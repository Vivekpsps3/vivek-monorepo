import { Observable, Subject, of, throwError } from 'rxjs';
import { EncryptedStoreService } from './encrypted-store.service';
import { VaultService } from './vault.service';

describe('EncryptedStoreService', () => {
  function createStoreHarness() {
    let nextCipher = 0;
    const payloads = new Map<string, any>();
    const database: any[] = [];
    let listOverride: ((collection?: string) => Observable<any[]>) | null = null;
    const vault = {
      isUnlocked: true,
      listRecords: (collection?: string) => listOverride
        ? listOverride(collection)
        : of(database.filter(row => !collection || row.collection === collection).map(row => ({ ...row }))),
      decryptPayload: async (cipher: string) => JSON.parse(JSON.stringify(payloads.get(cipher))),
      encryptPayload: async (payload: any) => {
        const cipher = `test-cipher-${nextCipher++}`;
        payloads.set(cipher, JSON.parse(JSON.stringify(payload)));
        return cipher;
      },
      upsertRecords: (incoming: any[]) => {
        const saved = incoming.map(record => {
          const existingIndex = database.findIndex(row => row.collection === record.collection && row.client_id === record.client_id);
          const existing = existingIndex < 0 ? null : database[existingIndex];
          const actualRevision = existing?.revision ?? null;
          if (actualRevision !== record.expected_revision) return null;
          const row = { ...record, revision: (existing?.revision ?? 0) + 1, updated_at: '' };
          if (existingIndex < 0) database.push(row);
          else database[existingIndex] = row;
          return row;
        });
        if (saved.some(row => row === null)) return throwError(() => Object.assign(new Error('revision conflict'), { status: 409 }));
        return of(saved);
      },
      deleteRecords: (incoming: any[]) => {
        for (const target of incoming) {
          const index = database.findIndex(row => row.collection === target.collection && row.client_id === target.client_id);
          if (index >= 0) database.splice(index, 1);
        }
        return of({ ok: true });
      },
      blindIndex: async () => 'index',
    } as unknown as VaultService;
    return {
      database,
      vault,
      store: new EncryptedStoreService(vault),
      deferNextListRecords(handler: (collection?: string) => Observable<any[]>) { listOverride = handler; },
      resumeDefaultListRecords() { listOverride = null; },
      async replaceRemote(collection: string, id: number, data: any) {
        const row = database.find(item => item.collection === collection && JSON.parse(JSON.stringify(payloads.get(item.ciphertext_b64))).id === id);
        if (!row) throw new Error('Remote test row not found');
        const cipher = `test-cipher-${nextCipher++}`;
        payloads.set(cipher, JSON.parse(JSON.stringify(data)));
        row.ciphertext_b64 = cipher;
        row.revision += 1;
      },
      async injectRemote(collection: string, data: any, clientId = `remote:${collection}:${nextCipher}`) {
        const ciphertext_b64 = await vault.encryptPayload(data, collection, clientId, 2, 1);
        database.push({
          collection, client_id: clientId, ciphertext_b64, schema_version: 2, key_version: 1,
          revision: 1, updated_at: '',
        });
      },
    };
  }

  it('preserves employment history inside vault records across updates and reloads', async () => {
    let records: any[] = [];
    const payloads = new Map<string, any>();
    let nextCipher = 0;
    const vault = {
      isUnlocked: true,
      listRecords: () => of(records),
      decryptPayload: async (cipher: string) => payloads.get(cipher),
      encryptPayload: async (payload: any) => {
        const cipher = 'opaque-cipher-' + nextCipher++;
        payloads.set(cipher, JSON.parse(JSON.stringify(payload)));
        return cipher;
      },
      upsertRecords: (incoming: any[]) => {
        records = incoming.map(record => ({ ...record, revision: 1, updated_at: '' }));
        return of(records);
      },
    } as unknown as VaultService;
    const store = new EncryptedStoreService(vault);
    const created = await store.addJobIncome({
      employer: 'Acme', effective_date: '2026-01-01', end_date: '2026-12-31',
      pay_frequency: 'annual', base_pay: 36525, is_active: true,
      stock_symbol: 'MSFT',
      promotions: [{ date: '2026-06-01', annual_base_pay: 73050 }],
      compensation_payments: [{ date: '2026-07-01', kind: 'bonus', amount: 1000 }],
      stock_grants: [{
        date: '2026-08-01', origin: 'bonus', label: 'Stock bonus', quantity: 200, price_at_grant: 100,
        sales: [{ date: '2026-09-01', shares: 100, cash_proceeds: 15000 }],
      }],
      stock_purchases: [{
        date: '2026-09-15', label: 'ESPP', quantity: 10, price_paid_per_share: 80,
        market_price_at_purchase: 100, sales: [{ date: '2026-10-15', shares: 2, cash_proceeds: 250 }],
      }],
      stock_valuations: [{ date: '2026-10-01', price_per_share: 200, source: 'live_eod', symbol: 'MSFT', price_as_of: '2026-10-01T16:00:00Z', observed_date: '2026-10-02' }],
    });
    await store.updateJobIncome(created.id, { notes: 'History retained' });
    store.clear();
    const [reloaded] = await store.getJobIncomes();
    expect(reloaded.end_date).toBe('2026-12-31');
    expect(reloaded.promotions).toEqual([{ date: '2026-06-01', annual_base_pay: 73050 }]);
    expect(reloaded.compensation_payments).toEqual([{ date: '2026-07-01', kind: 'bonus', amount: 1000 }]);
    expect(reloaded.stock_symbol).toBe('MSFT');
    expect(reloaded.stock_grants).toEqual([{
      date: '2026-08-01', origin: 'bonus', label: 'Stock bonus', quantity: 200, price_at_grant: 100,
      sales: [{ date: '2026-09-01', shares: 100, cash_proceeds: 15000 }],
    }]);
    expect(reloaded.stock_purchases).toEqual([{
      date: '2026-09-15', label: 'ESPP', quantity: 10, price_paid_per_share: 80,
      market_price_at_purchase: 100, sales: [{ date: '2026-10-15', shares: 2, cash_proceeds: 250 }],
    }]);
    expect(reloaded.stock_valuations).toEqual([{
      date: '2026-10-01', price_per_share: 200, source: 'live_eod', symbol: 'MSFT',
      price_as_of: '2026-10-01T16:00:00Z', observed_date: '2026-10-02',
    }]);
    expect(reloaded.base_pay).toBe(36525);
    expect(JSON.stringify(records)).not.toContain('Acme');
    expect(records[0].schema_version).toBe(2);
  });

  it('uses scheduled occurrences rather than monthly rates in encrypted cashflow summaries', async () => {
    const vault = {
      isUnlocked: true,
      listRecords: () => of([]),
      decryptPayload: async () => ({}),
      encryptPayload: async () => 'ciphertext',
      blindIndex: async () => 'index',
      upsertRecords: (records: any[]) => of(records.map(record => ({ ...record, revision: 1, updated_at: '' }))),
    } as unknown as VaultService;
    const store = new EncryptedStoreService(vault);

    await store.addFixedExpense({
      name: 'Quarterly insurance', category: 'insurance', amount: 300, frequency: 'quarterly',
      start_date: '2026-01-15', is_active: true,
    });
    await store.addSubscription({
      name: 'Annual software', category: 'software', amount: 120, frequency: 'annual',
      next_bill_date: '2026-01-20', is_active: true,
    });

    const summary = await store.getCashflowSummary('2026-01-01', '2026-01-31');

    expect(summary.fixed_expenses).toBe(300);
    expect(summary.subscriptions).toBe(120);
    expect((summary.fixed_occurrences as any[]).map(event => event.date)).toEqual(['2026-01-15']);
    expect((summary.subscription_occurrences as any[]).map(event => event.date)).toEqual(['2026-01-20']);
  });

  it('exports vault-ready legacy records to encrypt locally before completing migration', async () => {
    const completeLegacyMigration = jasmine.createSpy('completeLegacyMigration').and.returnValue(of({ status: 'completed' }));
    const upsertRecords = jasmine.createSpy('upsertRecords').and.callFake((records: any[]) =>
      of(records.map(record => ({ ...record, revision: 1, updated_at: '' })))
    );
    const vault = {
      isUnlocked: true,
      currentStatus: { exists: true, migration_status: 'vault_ready' },
      listRecords: () => of([]),
      exportLegacyRecords: () => of({
        counts: { assets: 1 },
        records: [{ collection: 'assets', data: { id: 7, name: 'Legacy cash' } }],
      }),
      decryptPayload: async () => ({}),
      encryptPayload: async () => 'ciphertext',
      blindIndex: async () => 'index',
      upsertRecords,
      completeLegacyMigration,
    } as unknown as VaultService;
    const store = new EncryptedStoreService(vault);

    expect(await store.getAssets()).toEqual([jasmine.objectContaining({ id: 7, name: 'Legacy cash' })]);
    expect(upsertRecords).toHaveBeenCalledWith([
      jasmine.objectContaining({ collection: 'assets', schema_version: 2, key_version: 1 }),
    ]);
    expect(completeLegacyMigration).toHaveBeenCalledWith(
      { assets: 1 },
      [jasmine.objectContaining({ collection: 'assets' })]
    );
  });

  it('rewrites schema-1 records with their key version and revision before completing migration', async () => {
    const completeLegacyMigration = jasmine.createSpy('completeLegacyMigration').and.returnValue(
      of({ status: 'completed' })
    );
    const vault = {
      isUnlocked: true,
      listRecords: () =>
        of([
          {
            collection: 'assets',
            client_id: 'asset-001',
            ciphertext_b64: 'legacy',
            schema_version: 1,
            key_version: 7,
            revision: 4,
            updated_at: '',
          },
        ]),
      decryptPayload: async () => ({ id: 1, name: 'Cash' }),
      encryptPayload: async () => 'schema2',
      blindIndex: async () => 'index',
      upsertRecords: (records: any[]) => {
        expect(records).toEqual([
          jasmine.objectContaining({
            collection: 'assets',
            client_id: 'asset-001',
            schema_version: 2,
            key_version: 7,
            expected_revision: 4,
          }),
        ]);
        return of([{ ...records[0], revision: 5, updated_at: '' }]);
      },
      completeLegacyMigration,
    } as unknown as VaultService;
    const store = new EncryptedStoreService(vault);

    await store.getAssets();
    expect(completeLegacyMigration).toHaveBeenCalledWith(
      { assets: 1 },
      [{ collection: 'assets', client_id: 'asset-001' }]
    );
  });

  it('serializes a manual holding edit with its quote and preserves the edited position facts', async () => {
    const { store } = createStoreHarness();
    const today = new Date().toISOString().slice(0, 10);
    const holding = await store.addHolding({
      symbol: 'MSFT', shares: 10, purchase_price: 50, purchase_date: '2024-01-02',
      lifecycle_status: 'active', position_as_of: '2026-10-01',
    });
    const quoteWrite = store.updateHoldingPrice(holding.id, {
      symbol: 'MSFT', price: 125, price_source: 'live_eod',
      price_as_of: `${today}T20:00:00Z`, quote_date: today,
    });
    const manualEdit = store.updateHolding(holding.id, {
      shares: 25, purchase_price: 55, purchase_date: '2024-02-03', position_as_of: '2026-10-03',
    });
    await Promise.all([quoteWrite, manualEdit]);

    const [saved] = await store.getHoldings();
    expect(saved.shares).toBe(25);
    expect(saved.purchase_price).toBe(55);
    expect(saved.purchase_date).toBe('2024-02-03');
    expect(saved.position_as_of).toBe('2026-10-03');
    expect(saved.current_price).toBe(125);
    expect(saved.quote_date).toBe(today);
    expect(saved.value).toBe(3125);
  });

  it('rejects mismatched and future quotes while keeping the last saved holding price', async () => {
    const { store } = createStoreHarness();
    const today = new Date().toISOString().slice(0, 10);
    const holding = await store.addHolding({ symbol: 'MSFT', shares: 10, purchase_price: 50, purchase_date: '2024-01-02' });

    await expectAsync(store.updateHoldingPrice(holding.id, {
      symbol: 'AAPL', price: 125, price_source: 'live_eod', quote_date: today,
    })).toBeRejectedWithError(/ticker changed/);
    await expectAsync(store.updateHoldingPrice(holding.id, {
      symbol: 'MSFT', price: 125, price_source: 'live_eod', quote_date: '2999-01-01',
    })).toBeRejectedWithError(/invalid or future trading date/);

    const [saved] = await store.getHoldings();
    expect(saved.current_price).toBe(50);
    expect(saved.quote_date).toBeUndefined();
  });

  it('does not apply a manual update read before the vault session changes', async () => {
    const harness = createStoreHarness();
    const oldAsset = await harness.store.addAsset({ name: 'Old user cash', category: 'cash', current_value: 100 });
    let releaseRead!: (rows: any[]) => void;
    const oldRead = new Promise<any[]>(resolve => { releaseRead = resolve; });
    spyOn(harness.store, 'getAssets').and.returnValue(oldRead as any);

    const update = harness.store.updateAsset(oldAsset.id, { name: 'Stale draft' });
    harness.store.clear();
    await harness.replaceRemote('assets', oldAsset.id, { ...oldAsset, name: 'New user cash', current_value: 900 });
    releaseRead([oldAsset]);

    await expectAsync(update).toBeRejectedWithError('Vault session changed');
    const persisted = harness.database.find(row => row.collection === 'assets');
    expect(await (harness.store as any).vault.decryptPayload(persisted.ciphertext_b64)).toEqual(
      jasmine.objectContaining({ name: 'New user cash', current_value: 900 })
    );
  });

  it('allocates distinct numeric IDs for simultaneous adds in separate tabs', async () => {
    const harness = createStoreHarness();
    const firstTab = harness.store;
    const secondTab = new EncryptedStoreService(harness.vault);
    const [first, second] = await Promise.all([
      firstTab.addAsset({ name: 'First tab cash', category: 'cash', current_value: 100 }),
      secondTab.addAsset({ name: 'Second tab cash', category: 'cash', current_value: 200 }),
    ]);

    expect(first.id).not.toBe(second.id);
    expect(Number.isSafeInteger(first.id)).toBeTrue();
    expect(Number.isSafeInteger(second.id)).toBeTrue();
    await Promise.all([firstTab.reloadCollections(['assets']), secondTab.reloadCollections(['assets'])]);
    await Promise.all([
      firstTab.updateAsset(first.id, { current_value: 110 }),
      secondTab.updateAsset(second.id, { current_value: 220 }),
    ]);
    await Promise.all([firstTab.reloadCollections(['assets']), secondTab.reloadCollections(['assets'])]);
    expect(await firstTab.getAssets()).toEqual(jasmine.arrayContaining([
      jasmine.objectContaining({ id: first.id, name: 'First tab cash', current_value: 110 }),
      jasmine.objectContaining({ id: second.id, name: 'Second tab cash', current_value: 220 }),
    ]));

    await Promise.all([firstTab.deleteAsset(first.id), secondTab.deleteAsset(second.id)]);
    await Promise.all([firstTab.reloadCollections(['assets']), secondTab.reloadCollections(['assets'])]);
    expect(await firstTab.getAssets()).toEqual([]);
    expect(await secondTab.getAssets()).toEqual([]);
  });

  it('assigns a safe positive ID when a legacy encrypted record has no ID', async () => {
    const harness = createStoreHarness();
    await harness.injectRemote('assets', { name: 'Legacy cash', category: 'cash', current_value: 40 });

    const [legacy] = await harness.store.getAssets();

    expect(legacy.name).toBe('Legacy cash');
    expect(legacy.id).toBeGreaterThan(0);
    expect(Number.isSafeInteger(legacy.id)).toBeTrue();
  });

  it('retries a remote snapshot when a local upsert commits during rehydration', async () => {
    const harness = createStoreHarness();
    await harness.store.getAssets();
    const staleResponse = new Subject<any[]>();
    let markStarted!: () => void;
    const started = new Promise<void>(resolve => { markStarted = resolve; });
    let firstRead = true;
    harness.deferNextListRecords(collection => {
      if (firstRead) {
        firstRead = false;
        markStarted();
        return staleResponse.asObservable();
      }
      harness.resumeDefaultListRecords();
      return of(harness.database.filter(row => !collection || row.collection === collection).map(row => ({ ...row })));
    });
    const reload = harness.store.reloadCollections(['assets']);
    await started;
    await harness.store.addAsset({ name: 'Local cash', category: 'cash', current_value: 100, as_of_date: '2026-10-12' });
    staleResponse.next([]);
    staleResponse.complete();
    await reload;

    expect(await harness.store.getAssets()).toEqual([jasmine.objectContaining({ name: 'Local cash', current_value: 100 })]);
  });

  it('retries a remote snapshot after a local delete so the deleted record cannot return', async () => {
    const harness = createStoreHarness();
    const asset = await harness.store.addAsset({ name: 'Temporary cash', category: 'cash', current_value: 100, as_of_date: '2026-10-12' });
    const staleRows = harness.database.map(row => ({ ...row }));
    const staleResponse = new Subject<any[]>();
    let markStarted!: () => void;
    const started = new Promise<void>(resolve => { markStarted = resolve; });
    let firstRead = true;
    harness.deferNextListRecords(collection => {
      if (firstRead) {
        firstRead = false;
        markStarted();
        return staleResponse.asObservable();
      }
      harness.resumeDefaultListRecords();
      return of(harness.database.filter(row => !collection || row.collection === collection).map(row => ({ ...row })));
    });
    const reload = harness.store.reloadCollections(['assets']);
    await started;
    await harness.store.deleteAsset(asset.id);
    staleResponse.next(staleRows);
    staleResponse.complete();
    await reload;

    expect(await harness.store.getAssets()).toEqual([]);
  });

  it('refreshes a revision conflict, preserves the draft request, and retries against the latest revision', async () => {
    const harness = createStoreHarness();
    const asset = await harness.store.addAsset({
      name: 'Original cash', category: 'cash', current_value: 100, as_of_date: '2026-10-12',
    });
    await harness.replaceRemote('assets', asset.id, { ...asset, name: 'Remote cash', current_value: 125 });
    const changes: any[] = [];
    harness.store.changes$.subscribe(change => changes.push(change));

    await expectAsync(harness.store.updateAsset(asset.id, { notes: 'my draft' }))
      .toBeRejectedWithError(/latest saved version was refreshed/);
    expect(changes).toContain(jasmine.objectContaining({ collection: 'assets', source: 'remote' }));
    expect(await harness.store.getAssets()).toEqual([jasmine.objectContaining({ name: 'Remote cash', current_value: 125 })]);

    await harness.store.updateAsset(asset.id, { notes: 'my draft' });
    expect(await harness.store.getAssets()).toEqual([jasmine.objectContaining({
      name: 'Remote cash', current_value: 125, notes: 'my draft',
    })]);
  });
});
