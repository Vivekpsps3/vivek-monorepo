import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { httpErrorInterceptor } from '@vivek/ui';
import { EncryptedBrokerageStageStore } from './encrypted-store.brokerage-stages';
import { EncryptedRecordPersistence } from './encrypted-store.persistence';
import { EncryptedStoreService } from './encrypted-store.service';
import { VaultService } from './vault.service';

describe('record update queue', () => {
  let http: HttpTestingController;
  let store: EncryptedStoreService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([httpErrorInterceptor])),
        provideHttpClientTesting(),
        VaultService,
        EncryptedStoreService,
      ],
    });
    const vault = TestBed.inject(VaultService);
    (vault as unknown as { dek: CryptoKey }).dek = {} as CryptoKey;
    (vault as unknown as { unlockedSubject: { next(value: boolean): void } }).unlockedSubject.next(true);
    spyOn(vault, 'encryptPayload').and.resolveTo('Y2lwaGVy');
    spyOn(vault, 'decryptPayload').and.callFake((async (_cipher: string, collection: string) => plaintext(collection)) as VaultService['decryptPayload']);
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(EncryptedStoreService);
  });

  afterEach(() => http.verify());

  async function whenRequest(match: (req: {
    method: string;
    url: string;
    body?: { records?: Array<{ client_id?: string; expected_revision?: number | null }> };
  }) => boolean) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const found = http.match(req => match(req));
      if (found.length) return found[0];
      await Promise.resolve();
    }
    return http.expectOne(req => match(req));
  }

  async function settle(): Promise<void> {
    for (let step = 0; step < 20; step += 1) await Promise.resolve();
  }

  function envelope(collection: string, revision: number, clientId = `${collection}-1`) {
    return {
      collection,
      client_id: clientId,
      ciphertext_b64: 'Y2lwaGVy',
      schema_version: 2,
      key_version: 1,
      revision,
      updated_at: '2026-10-01T00:00:00Z',
    };
  }

  async function preload(collection: string): Promise<void> {
    const pending = store.getAssets();
    const list = await whenRequest(req => req.method === 'GET' && req.url.includes('/vault/records') && !req.url.includes('collection='));
    list.flush([envelope(collection, 3)]);
    await pending;
  }

  async function secondWriteWaits(
    collection: string,
    first: () => Promise<unknown>,
    second: () => Promise<unknown>,
    deleting = false,
  ): Promise<void> {
    await preload(collection);
    const firstSave = first();
    const saved = await whenRequest(req => req.method === 'POST' && req.url.includes('/vault/records/upsert'));
    expect(saved.request.body?.records?.[0].expected_revision).withContext(collection).toBe(3);
    const secondSave = second();
    await settle();
    expect(http.match(req => req.method === 'POST' && req.url.includes('/vault/records/')).length)
      .withContext(`${collection} waits`)
      .toBe(0);
    const clientId = saved.request.body?.records?.[0].client_id || `${collection}-1`;
    saved.flush([envelope(collection, 4, clientId)]);
    await firstSave;
    const next = await whenRequest(req => req.method === 'POST' && req.url.includes(deleting ? '/vault/records/delete' : '/vault/records/upsert'));
    expect(next.request.body?.records?.[0].expected_revision).withContext(`${collection} follows the first save`).toBe(4);
    if (deleting) next.flush({ deleted: 1 });
    else next.flush([envelope(collection, 5, next.request.body?.records?.[0].client_id || clientId)]);
    await secondSave;
  }

  const updates: Array<{ collection: string; first: () => Promise<unknown>; second: () => Promise<unknown> }> = [
    {
      collection: 'transactions',
      first: () => store.updateTransaction(1, { merchant: 'First' }),
      second: () => store.updateTransaction(1, { merchant: 'Second' }),
    },
    {
      collection: 'liabilities',
      first: () => store.updateLiability(1, { name: 'First' }),
      second: () => store.updateLiability(1, { name: 'Second' }),
    },
    {
      collection: 'assets',
      first: () => store.updateAsset(1, { name: 'First' }),
      second: () => store.updateAsset(1, { name: 'Second' }),
    },
    {
      collection: 'holdings',
      first: () => store.updateHolding(1, { shares: 2 }),
      second: () => store.updateHolding(1, { shares: 3 }),
    },
    {
      collection: 'job_incomes',
      first: () => store.updateJobIncome(1, { employer: 'First' }),
      second: () => store.updateJobIncome(1, { employer: 'Second' }),
    },
    {
      collection: 'fixed_expenses',
      first: () => store.updateFixedExpense(1, { name: 'First' }),
      second: () => store.updateFixedExpense(1, { name: 'Second' }),
    },
    {
      collection: 'subscriptions',
      first: () => store.updateSubscription(1, { name: 'First' }),
      second: () => store.updateSubscription(1, { name: 'Second' }),
    },
    {
      collection: 'planning_profiles',
      first: () => store.savePlanningProfile({ name: 'First' }, 1),
      second: () => store.savePlanningProfile({ name: 'Second' }, 1),
    },
    {
      collection: 'bank_accounts',
      first: () => store.upsertBankAccount({ id: 1, bank_slug: 'chase', account_mask: '1234', account_key: 'chk', display_name: 'First', confirmed: true }),
      second: () => store.upsertBankAccount({ id: 1, bank_slug: 'chase', account_mask: '1234', account_key: 'chk', display_name: 'Second', confirmed: true }),
    },
    {
      collection: 'brokerage_accounts',
      first: () => store.upsertBrokerageAccount({ id: 1, broker_slug: 'fidelity', broker_name: 'Fidelity', account_mask: '9999', nickname: 'First' }),
      second: () => store.upsertBrokerageAccount({ id: 1, broker_slug: 'fidelity', broker_name: 'Fidelity', account_mask: '9999', nickname: 'Second' }),
    },
    {
      collection: 'stock_lab_scenarios',
      first: () => store.saveStockLabScenario({ name: 'First', primary_symbol: 'MSFT', updated_at: '2026-01-01T00:00:00Z' } as never, 1),
      second: () => store.saveStockLabScenario({ name: 'Second', primary_symbol: 'MSFT', updated_at: '2026-01-02T00:00:00Z' } as never, 1),
    },
    {
      collection: 'import_batches',
      first: () => store.updateImportReceipt(1, { status: 'staged' }),
      second: () => store.updateImportReceipt(1, { status: 'complete' }),
    },
  ];

  for (const entry of updates) {
    it(`sends a second ${entry.collection} save with the revision from the first`, async () => {
      await secondWriteWaits(entry.collection, entry.first, entry.second);
    });
  }

  const deletes: Array<{ collection: string; update: () => Promise<unknown>; remove: () => Promise<unknown> }> = [
    { collection: 'transactions', update: () => store.updateTransaction(1, { merchant: 'First' }), remove: () => store.deleteTransaction(1) },
    { collection: 'transactions', update: () => store.updateTransaction(1, { merchant: 'First' }), remove: () => store.deleteTransactions([1]) },
    { collection: 'assets', update: () => store.updateAsset(1, { name: 'First' }), remove: () => store.deleteAsset(1) },
    { collection: 'liabilities', update: () => store.updateLiability(1, { name: 'First' }), remove: () => store.deleteLiability(1) },
    { collection: 'fixed_expenses', update: () => store.updateFixedExpense(1, { name: 'First' }), remove: () => store.deleteFixedExpense(1) },
    { collection: 'subscriptions', update: () => store.updateSubscription(1, { name: 'First' }), remove: () => store.deleteSubscription(1) },
    { collection: 'planning_profiles', update: () => store.savePlanningProfile({ name: 'First' }, 1), remove: () => store.deletePlanningProfile(1) },
    { collection: 'stock_lab_scenarios', update: () => store.saveStockLabScenario({ name: 'First', updated_at: '2026-01-01T00:00:00Z' } as never, 1), remove: () => store.deleteStockLabScenario(1) },
    { collection: 'holdings', update: () => store.updateHolding(1, { shares: 2 }), remove: () => store.deleteHolding(1) },
  ];

  for (const entry of deletes) {
    it(`waits to delete ${entry.collection} until the in-flight save stores its revision`, async () => {
      await secondWriteWaits(entry.collection, entry.update, entry.remove, true);
    });
  }
});

describe('brokerage stage status writes', () => {
  function stageStore(status: 'staged' | 'verified' | 'activated', options?: {
    failCheckpoint?: boolean;
    gateStatus?: string;
    cleanup?: boolean;
  }) {
    const persistence = new EncryptedRecordPersistence({} as VaultService, () => 1);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let running = 0;
    let peak = 0;
    const stage = {
      id: 7,
      record_type: 'holding_stage',
      source: 'fidelity',
      filename: 'positions.csv',
      status,
      account_masks: ['1234'],
      expected_row_count: 0,
      account_replacements: [],
      created_at: '2026-01-01T00:00:00Z',
    };
    const port = {
      ensureLoaded: async () => undefined,
      readPersistedRows: async (collection: string) => collection === 'import_batches' ? [stage] : [],
      getImportRows: () => [stage],
      allocateId: () => 7,
      upsertImportRecord: async (payload: { status?: string; cleanup_complete?: boolean }) => {
        const gated = options?.gateStatus === payload.status
          && (options?.cleanup === undefined || payload.cleanup_complete === options?.cleanup);
        if (gated) {
          running += 1;
          peak = Math.max(peak, running);
          await gate;
          running -= 1;
        }
        return { ...stage, ...payload, id: 7 };
      },
      commitHoldingReplacements: async (_generation: number, _extraIds: number[], build: (current: never[]) => never[]) => build([]),
      savePreparedImportRows: async () => {
        if (options?.failCheckpoint) throw new Error('checkpoint');
        return [];
      },
      getBrokerageAccounts: async () => [],
      upsertBrokerageAccount: async () => stage,
      getHoldings: async () => [],
      updateHolding: async () => undefined,
      removeHolding: async () => undefined,
      sessionToken: () => 1,
      assertSession: () => undefined,
      runRecordUpdate: <T>(collection: 'import_batches', id: number, generation: number, update: () => Promise<T>) =>
        persistence.runRecordUpdate(collection, id, generation, update),
    };
    return { stages: new EncryptedBrokerageStageStore(port as never), release: () => release(), peak: () => peak };
  }

  async function overlap(start: (stages: EncryptedBrokerageStageStore) => Promise<unknown>, harness: ReturnType<typeof stageStore>) {
    const first = start(harness.stages);
    for (let step = 0; step < 40 && harness.peak() < 1; step += 1) await Promise.resolve();
    expect(harness.peak()).withContext('the first write is in flight').toBe(1);
    const second = start(harness.stages);
    for (let step = 0; step < 40; step += 1) await Promise.resolve();
    expect(harness.peak()).withContext('the second write waits').toBe(1);
    harness.release();
    await Promise.all([first.catch(() => undefined), second.catch(() => undefined)]);
    expect(harness.peak()).toBe(1);
  }

  it('serializes two interrupted stage writes', async () => {
    const harness = stageStore('staged', { failCheckpoint: true, gateStatus: 'interrupted' });
    await overlap(stages => stages.createHoldingImportStage({
      source: 'fidelity', filename: 'positions.csv', status: 'staged', account_masks: ['1234'],
      expected_row_count: 1, account_replacements: [], created_at: '2026-01-01T00:00:00Z',
    }, [{ symbol: 'MSFT', shares: 1 } as never]), harness);
  });

  it('serializes two verifies of the same stage', async () => {
    const harness = stageStore('staged', { gateStatus: 'verified' });
    await overlap(stages => stages.verifyHoldingImportStage(7), harness);
  });

  it('serializes two activation writes of the same stage', async () => {
    const harness = stageStore('verified', { gateStatus: 'activated', cleanup: false });
    await overlap(stages => stages.activateHoldingImportStage(7), harness);
  });

  it('serializes two cleanup writes of the same stage', async () => {
    const harness = stageStore('activated', { gateStatus: 'activated', cleanup: true });
    await overlap(stages => stages.activateHoldingImportStage(7), harness);
  });

  it('builds the replacement from holdings observed after the queued edit', async () => {
    const session = 1;
    const persistence = new EncryptedRecordPersistence({} as VaultService, () => session);
    let holdings: Array<Record<string, unknown>> = [];
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const written: Array<Array<Record<string, unknown>>> = [];
    const statuses: string[] = [];
    const stage = {
      id: 7, record_type: 'holding_stage', status: 'verified', account_masks: ['1234'],
      expected_row_count: 1, created_at: '2026-01-01T00:00:00Z', source: 'fidelity', filename: 'positions.csv',
      account_replacements: [],
    };
    const rowChunk = {
      id: 8, record_type: 'holding_stage_rows', stage_id: 7, chunk_index: 0,
      rows: [{
        symbol: 'MSFT', shares: 4, brokerage_account_id: 3, account_display: 'Fidelity ···1234',
        purchase_price: 10, purchase_date: '2024-01-02', current_price: 10, value: 40,
        price_source: 'manual', price_as_of: null, quote_date: null, position_as_of: null,
        cost_basis_status: 'known', lifecycle_status: 'staged', portfolio_row_index: 0,
      }],
    };
    const edit = persistence.runRecordUpdate('holdings', 5, 1, async () => {
      await gate;
      holdings = [{
        id: 5, symbol: 'MSFT', shares: 2, brokerage_account_id: 3,
        portfolio_stage_id: 7, portfolio_row_index: 0,
      }];
    });
    const stages = new EncryptedBrokerageStageStore({
      ensureLoaded: async () => undefined,
      readPersistedRows: async (collection: string) => collection === 'import_batches' ? [stage, rowChunk] : holdings,
      getImportRows: () => [stage, rowChunk],
      allocateId: () => 99,
      upsertImportRecord: async (payload: { status?: string }) => {
        statuses.push(String(payload.status));
        return { ...stage, ...payload, id: 7 };
      },
      commitHoldingReplacements: async (
        generation: number,
        extraIds: number[],
        build: (current: Array<Record<string, unknown>>) => Array<Record<string, unknown>>,
      ) => persistence.withRecordUpdates('holdings', [...new Set([5, ...extraIds])], generation, async () => {
        const records = build(holdings);
        written.push(records);
        holdings = records;
        return records;
      }),
      savePreparedImportRows: async () => [],
      getBrokerageAccounts: async () => [],
      upsertBrokerageAccount: async () => stage,
      getHoldings: async () => holdings,
      updateHolding: async () => holdings[0],
      removeHolding: async () => undefined,
      sessionToken: () => session,
      assertSession: (generation: number) => {
        if (generation !== session) throw new Error('Vault session changed');
      },
      runRecordUpdate: <T>(collection: 'import_batches', id: number, generation: number, update: () => Promise<T>) =>
        persistence.runRecordUpdate(collection, id, generation, update),
    } as never);

    const activation = stages.activateHoldingImportStage(7);
    for (let step = 0; step < 30 && written.length === 0; step += 1) await Promise.resolve();
    expect(written).withContext('the replacement waits for the holding edit').toEqual([]);
    release();
    const result = await activation;
    await edit;
    expect(written.length).toBe(1);
    expect(written[0][0]).toEqual(jasmine.objectContaining({ id: 5, shares: 4, symbol: 'MSFT' }));
    expect(written[0].some(row => row['id'] === 99)).toBeFalse();
    expect(result).toEqual(jasmine.objectContaining({ status: 'activated', stage_id: 7 }));
    expect(statuses).toContain('activated');
  });

  it('does not activate or write holdings after the session changes while the snapshot waits', async () => {
    let session = 1;
    const persistence = new EncryptedRecordPersistence({} as VaultService, () => session);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const written: unknown[] = [];
    const statuses: string[] = [];
    const stage = {
      id: 7, record_type: 'holding_stage', status: 'verified', account_masks: ['1234'],
      expected_row_count: 1, created_at: '2026-01-01T00:00:00Z', source: 'fidelity', filename: 'positions.csv',
      account_replacements: [],
    };
    const rowChunk = {
      id: 8, record_type: 'holding_stage_rows', stage_id: 7, chunk_index: 0,
      rows: [{
        symbol: 'MSFT', shares: 4, brokerage_account_id: 3, account_display: 'Fidelity ···1234',
        purchase_price: 10, purchase_date: '2024-01-02', current_price: 10, value: 40,
        price_source: 'manual', price_as_of: null, quote_date: null, position_as_of: null,
        cost_basis_status: 'known', lifecycle_status: 'staged', portfolio_row_index: 0,
      }],
    };
    const edit = persistence.runRecordUpdate('holdings', 5, 1, async () => { await gate; });
    const stages = new EncryptedBrokerageStageStore({
      ensureLoaded: async () => undefined,
      readPersistedRows: async (collection: string) => collection === 'import_batches' ? [stage, rowChunk] : [],
      getImportRows: () => [stage, rowChunk],
      allocateId: () => 99,
      upsertImportRecord: async (payload: { status?: string }) => {
        statuses.push(String(payload.status));
        return { ...stage, ...payload, id: 7 };
      },
      commitHoldingReplacements: async (
        generation: number,
        extraIds: number[],
        build: (current: Array<Record<string, unknown>>) => Array<Record<string, unknown>>,
      ) => persistence.withRecordUpdates('holdings', [...new Set([5, ...extraIds])], generation, async () => {
        const records = build([]);
        written.push(records);
        return records;
      }),
      savePreparedImportRows: async () => [],
      getBrokerageAccounts: async () => [],
      upsertBrokerageAccount: async () => stage,
      getHoldings: async () => [],
      updateHolding: async () => undefined,
      removeHolding: async () => undefined,
      sessionToken: () => session,
      assertSession: () => undefined,
      runRecordUpdate: <T>(collection: 'import_batches', id: number, generation: number, update: () => Promise<T>) =>
        persistence.runRecordUpdate(collection, id, generation, update),
    } as never);

    const activation = stages.activateHoldingImportStage(7);
    for (let step = 0; step < 30; step += 1) await Promise.resolve();
    session = 2;
    release();
    await expectAsync(activation).toBeRejectedWithError('Vault session changed');
    await edit.catch(() => undefined);
    expect(written).toEqual([]);
    expect(statuses).not.toContain('activated');
  });
});

function plaintext(collection: string): Record<string, unknown> {
  switch (collection) {
    case 'transactions':
      return { id: 1, date: '2026-01-02', type: 'expense', category: 'Food', amount: 4, description: 'Tea' };
    case 'liabilities':
      return { id: 1, name: 'Card', category: 'credit', balance_owed: 20, as_of_date: '2026-01-02' };
    case 'holdings':
      return { id: 1, symbol: 'MSFT', shares: 1, purchase_price: 10, purchase_date: '2024-01-02', lifecycle_status: 'active' };
    case 'job_incomes':
      return { id: 1, employer: 'Acme', effective_date: '2026-01-01', pay_frequency: 'annual', base_pay: 1, is_active: true };
    case 'fixed_expenses':
      return { id: 1, name: 'Rent', category: 'Housing', amount: 1, frequency: 'monthly', start_date: '2026-01-01', autopay: false, is_active: true };
    case 'subscriptions':
      return { id: 1, name: 'Music', category: 'Fun', amount: 1, frequency: 'monthly', next_bill_date: '2026-02-01', is_active: true };
    case 'planning_profiles':
      return { id: 1, name: 'Base' };
    case 'bank_accounts':
      return { id: 1, bank_slug: 'chase', account_mask: '1234', account_key: 'chk', display_name: 'Checking', confirmed: true };
    case 'brokerage_accounts':
      return { id: 1, broker_slug: 'fidelity', broker_name: 'Fidelity', account_mask: '9999' };
    case 'stock_lab_scenarios':
      return { id: 1, name: 'First', primary_symbol: 'MSFT', updated_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' };
    case 'import_batches':
      return {
        id: 1, record_type: 'bank_receipt', bank_slugs: ['chase'], filenames: ['a.csv'], status: 'complete',
        started_at: '2026-01-01', selected_row_count: 0, inserted_count: 0, unresolved: [], coverage: [],
      };
    default:
      return { id: 1, name: 'Cash', current_value: 10, updated_at: '2026-01-01T00:00:00Z' };
  }
}
