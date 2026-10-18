import { of, Subject, throwError } from 'rxjs';
import { EncryptedStoreService } from './encrypted-store.service';
import { VaultService } from './vault.service';
import { FidelityStageRow, resumeFidelityImportStage } from '../utils/fidelity-import.util';
import { resumeBankImportReceipt } from '../utils/bank-import.util';
import { ImportPreviewRow } from '../models/transaction.model';

/** An isolated persistence double: replies reflect server records, not the store's cache. */
function persistence() {
  const records = new Map<string, any>();
  const payloads = new Map<string, any>();
  const writes: any[][] = [];
  let serial = 0;
  let failHoldingBatch = 0;
  let holdingBatches = 0;
  let failHoldingDelete = false;
  let failFirstReceiptChunk = false;
  const key = (row: any) => row.collection + '/' + row.client_id;
  const vault = {
    isUnlocked: true,
    currentStatus: { exists: true },
    listRecords: () => of([...records.values()]),
    decryptPayload: async (cipher: string) => structuredClone(payloads.get(cipher)),
    encryptPayload: async (payload: any) => {
      const cipher = 'opaque-' + serial++;
      payloads.set(cipher, structuredClone(payload));
      return cipher;
    },
    blindIndex: async () => 'opaque-index',
    upsertRecords: (incoming: any[]) => {
      writes.push(incoming);
      expect(incoming.length).toBeLessThanOrEqual(200);
      if (incoming.some(row => row.collection === 'holdings') && ++holdingBatches === failHoldingBatch) {
        return throwError(() => new Error('Injected interrupted holding batch'));
      }
      if (failFirstReceiptChunk && incoming.some(row =>
        row.collection === 'import_batches' && payloads.get(row.ciphertext_b64)?.record_type === 'bank_receipt_rows'
      )) {
        failFirstReceiptChunk = false;
        return throwError(() => new Error('Injected interrupted receipt chunk'));
      }
      const saved = incoming.map(row => {
        const previous = records.get(key(row));
        expect(row.expected_revision ?? null).toBe(previous?.revision ?? null);
        return { ...row, revision: (previous?.revision || 0) + 1, updated_at: '' };
      });
      saved.forEach(row => records.set(key(row), row));
      return of(saved);
    },
    deleteRecords: (incoming: any[]) => {
      expect(incoming.length).toBeLessThanOrEqual(200);
      if (failHoldingDelete && incoming.some(row => row.collection === 'holdings')) {
        failHoldingDelete = false;
        return throwError(() => new Error('Injected interrupted holding cleanup'));
      }
      incoming.forEach(row => records.delete(key(row)));
      return of({ deleted: incoming.length });
    },
  } as unknown as VaultService;
  return {
    store: new EncryptedStoreService(vault),
    vault, records, payloads, writes,
    failSecondReplacementBatch: () => { holdingBatches = 0; failHoldingBatch = 2; },
    failHoldingCleanupOnce: () => { failHoldingDelete = true; },
    failFirstReceiptChunkOnce: () => { failFirstReceiptChunk = true; },
    mutateStage: (stageId: number, patch: Record<string, unknown>) => {
      for (const row of records.values()) {
        const payload = row.collection === 'import_batches' ? payloads.get(row.ciphertext_b64) : null;
        if (payload?.record_type === 'holding_stage' && Number(payload.id) === stageId) {
          payloads.set(row.ciphertext_b64, { ...payload, ...patch });
        }
      }
    },
    data: (collection: string) => [...records.values()].filter(row => row.collection === collection)
      .map(row => structuredClone(payloads.get(row.ciphertext_b64))),
  };
}

describe('encrypted import persistence recovery', () => {
  it('shares a pending load and rejects it when the vault session changes', async () => {
    const loading = new Subject<any[]>();
    const listRecords = jasmine.createSpy('listRecords').and.returnValues(loading, of([]));
    const vault = { isUnlocked: true, currentStatus: { exists: true }, listRecords } as unknown as VaultService;
    const store = new EncryptedStoreService(vault);
    const assets = store.getAssets();
    const liabilities = store.getLiabilities();
    expect(listRecords).toHaveBeenCalledTimes(1);
    store.clear();
    loading.next([]);
    loading.complete();
    await expectAsync(assets).toBeRejected();
    await expectAsync(liabilities).toBeRejected();
    expect(await store.getAssets()).toEqual([]);
    expect(listRecords).toHaveBeenCalledTimes(2);
  });

  it('keeps the old portfolio active after a failed second batch and resumes without doubled positions', async () => {
    const fixture = persistence();
    const account = await fixture.store.upsertBrokerageAccount({ broker_slug: 'fidelity', broker_name: 'Fidelity', account_mask: '1234' });
    await fixture.store.addHolding({ symbol: 'OLD', shares: 1, purchase_price: 80, current_price: 100, brokerage_account_id: account.id });
    const rows = Array.from({ length: 201 }, (_, index) => ({
      account_mask: '1234', account_display: 'Fidelity ···1234', symbol: 'NEW' + index, shares: 1,
      avg_cost_basis: 80, cost_basis_total: 80, market_price: 120, market_value: 120,
      valuation_source: 'reported_price', position_as_of: '2026-10-01', status: 'replace',
      brokerage_account_id: account.id, purchase_price: 80, purchase_date: null,
      current_price: 120, value: 120, price_source: 'reported_price', price_as_of: null,
      quote_date: null, cost_basis_status: 'known', lifecycle_status: 'staged', portfolio_row_index: index,
    })) as FidelityStageRow[];
    const stage = await fixture.store.createHoldingImportStage({
      source: 'fidelity', filename: 'positions.csv', status: 'staged', account_masks: ['1234'],
      expected_row_count: rows.length, account_replacements: [], created_at: new Date().toISOString(),
    }, rows);
    const checkpoint = [...fixture.records.entries()].find(([, record]) =>
      fixture.payloads.get(record.ciphertext_b64)?.record_type === 'holding_stage_rows'
    )!;
    fixture.records.delete(checkpoint[0]);
    await expectAsync(fixture.store.verifyHoldingImportStage(stage.id)).toBeRejected();
    expect((await fixture.store.getNetWorth()).portfolio).toBe(100);
    fixture.records.set(checkpoint[0], checkpoint[1]);
    fixture.failSecondReplacementBatch();
    await expectAsync(fixture.store.activateHoldingImportStage(stage.id)).toBeRejected();
    expect((await fixture.store.getHoldings()).map(row => row.symbol)).toEqual(['OLD']);
    expect((await fixture.store.getNetWorth()).portfolio).toBe(100);
    expect(fixture.data('holdings').length).toBe(201);
    fixture.store.clear();
    await fixture.store.activateHoldingImportStage(stage.id);
    expect((await fixture.store.getHoldings()).length).toBe(201);
    expect((await fixture.store.getNetWorth()).portfolio).toBe(24120);
    expect(fixture.data('holdings').some(row => row.symbol === 'OLD')).toBeFalse();
    await fixture.store.addHolding({ symbol: 'MANUAL', shares: 1, purchase_price: 5, current_price: 5, brokerage_account_id: account.id });
    expect((await fixture.store.getHoldings()).some(row => row.symbol === 'MANUAL')).toBeTrue();
  });

  it('resumes activated cleanup without overwriting edited or newly added manual holdings', async () => {
    const fixture = persistence();
    const account = await fixture.store.upsertBrokerageAccount({ broker_slug: 'fidelity', broker_name: 'Fidelity', account_mask: '5678' });
    await fixture.store.addHolding({ symbol: 'OLD', shares: 1, purchase_price: 80, current_price: 100, value: 100, brokerage_account_id: account.id });
    const rows = [{
      account_mask: '5678', account_display: 'Fidelity ···5678', symbol: 'NEW', shares: 1,
      avg_cost_basis: 80, cost_basis_total: 80, market_price: 120, market_value: 120,
      valuation_source: 'reported_price', position_as_of: '2026-10-01', status: 'replace',
      brokerage_account_id: account.id, purchase_price: 80, purchase_date: null,
      current_price: 120, value: 120, price_source: 'import_market_price', price_as_of: null,
      quote_date: null, cost_basis_status: 'known', lifecycle_status: 'staged', portfolio_row_index: 0,
    }] as FidelityStageRow[];
    const stage = await fixture.store.createHoldingImportStage({
      source: 'fidelity', filename: 'positions.csv', status: 'staged', account_masks: ['5678'],
      expected_row_count: 1, account_replacements: [], created_at: new Date().toISOString(),
    }, rows);

    fixture.failHoldingCleanupOnce();
    await expectAsync(fixture.store.activateHoldingImportStage(stage.id)).toBeRejectedWithError('Injected interrupted holding cleanup');
    const imported = (await fixture.store.getHoldings()).find(row => row.symbol === 'NEW')!;
    await fixture.store.updateHolding(imported.id, { shares: 2, current_price: 135, value: 270, company_name: 'Edited after import' });
    const manual = await fixture.store.addHolding({
      symbol: 'CASH', shares: 1, purchase_price: 5, current_price: 5, value: 5, brokerage_account_id: account.id,
    });
    expect(manual.portfolio_stage_id).toBe(stage.id);

    fixture.store.clear();
    const result = await resumeFidelityImportStage(fixture.store, stage.id);
    const active = await fixture.store.getHoldings();

    expect(result.status).toBe('activated');
    expect(active.map(row => row.symbol).sort()).toEqual(['CASH', 'NEW']);
    expect(active.find(row => row.symbol === 'NEW')).toEqual(jasmine.objectContaining({
      shares: 2, current_price: 135, value: 270, market_value: null, company_name: 'Edited after import',
    }));
    expect(active.find(row => row.symbol === 'CASH')).toEqual(jasmine.objectContaining({ value: 5 }));
    expect(fixture.data('holdings').some(row => row.symbol === 'OLD')).toBeFalse();
    expect((await fixture.store.getHoldingImportStages()).find(row => row.id === stage.id)?.cleanup_complete).toBeTrue();
  });

  it('does not let an interrupted older stage remove a newer activated replacement', async () => {
    const fixture = persistence();
    const account = await fixture.store.upsertBrokerageAccount({ broker_slug: 'fidelity', broker_name: 'Fidelity', account_mask: '8899' });
    await fixture.store.addHolding({ symbol: 'OLD', shares: 1, purchase_price: 80, current_price: 100, brokerage_account_id: account.id });
    const stageRow = (symbol: string): FidelityStageRow => ({
      account_mask: '8899', account_display: 'Fidelity ···8899', symbol, shares: 1,
      avg_cost_basis: 80, cost_basis_total: 80, market_price: 120, market_value: 120,
      valuation_source: 'reported_price', position_as_of: '2026-10-01', status: 'replace',
      brokerage_account_id: account.id, purchase_price: 80, purchase_date: null,
      current_price: 120, value: 120, price_source: 'import_market_price', price_as_of: null,
      quote_date: null, cost_basis_status: 'known', lifecycle_status: 'staged', portfolio_row_index: 0,
    });
    const sameCallerTimestamp = new Date().toISOString();
    const createStage = (filename: string, symbol: string) => fixture.store.createHoldingImportStage({
      source: 'fidelity', filename, status: 'staged', account_masks: ['8899'], expected_row_count: 1,
      account_replacements: [], created_at: sameCallerTimestamp,
    }, [stageRow(symbol)]);
    const older = await createStage('older.csv', 'OLDER');
    fixture.failHoldingCleanupOnce();
    await expectAsync(fixture.store.activateHoldingImportStage(older.id)).toBeRejectedWithError('Injected interrupted holding cleanup');

    const newer = await createStage('newer.csv', 'NEWER');
    expect(Date.parse(newer.created_at)).toBeGreaterThan(Date.parse(older.created_at));
    await fixture.store.activateHoldingImportStage(newer.id);
    expect((await fixture.store.getHoldings()).map(row => row.symbol)).toEqual(['NEWER']);
    const activatedStages = await fixture.store.getHoldingImportStages();
    expect(Date.parse(activatedStages.find(row => row.id === newer.id)!.activated_at!))
      .toBeGreaterThan(Date.parse(activatedStages.find(row => row.id === older.id)!.activated_at!));

    // Equal activation timestamps must use the explicit stage creation order,
    // never the randomized numeric record IDs.
    const tiedActivationTime = '2026-10-12T00:00:00.000Z';
    fixture.mutateStage(older.id, { activated_at: tiedActivationTime });
    fixture.mutateStage(newer.id, { activated_at: tiedActivationTime });

    fixture.store.clear();
    await resumeFidelityImportStage(fixture.store, older.id);
    expect((await fixture.store.getHoldings()).map(row => row.symbol)).toEqual(['NEWER']);
    expect(fixture.data('holdings').map(row => row.symbol)).toEqual(['NEWER']);

    // Legacy activated stages may not have activated_at. Their durable
    // created_at order remains sufficient after a vault reload.
    fixture.mutateStage(older.id, {
      activated_at: null, cleanup_complete: false, created_at: '2026-10-10T00:00:00.000Z',
    });
    fixture.mutateStage(newer.id, {
      activated_at: null, created_at: '2026-10-11T00:00:00.000Z',
    });
    fixture.store.clear();
    await resumeFidelityImportStage(fixture.store, older.id);
    expect((await fixture.store.getHoldings()).map(row => row.symbol)).toEqual(['NEWER']);
    expect(fixture.data('holdings').map(row => row.symbol)).toEqual(['NEWER']);
  });

  it('advances a new activation past a legacy stage missing activated_at', async () => {
    const fixture = persistence();
    const account = await fixture.store.upsertBrokerageAccount({ broker_slug: 'fidelity', broker_name: 'Fidelity', account_mask: '9900' });
    const stageRow = (symbol: string): FidelityStageRow => ({
      account_mask: '9900', account_display: 'Fidelity ···9900', symbol, shares: 1,
      avg_cost_basis: 80, cost_basis_total: 80, market_price: 120, market_value: 120,
      valuation_source: 'reported_price', position_as_of: '2026-10-01', status: 'replace',
      brokerage_account_id: account.id, purchase_price: 80, purchase_date: null,
      current_price: 120, value: 120, price_source: 'import_market_price', price_as_of: null,
      quote_date: null, cost_basis_status: 'known', lifecycle_status: 'staged', portfolio_row_index: 0,
    });
    const createStage = (filename: string, symbol: string) => fixture.store.createHoldingImportStage({
      source: 'fidelity', filename, status: 'staged', account_masks: ['9900'], expected_row_count: 1,
      account_replacements: [], created_at: new Date().toISOString(),
    }, [stageRow(symbol)]);

    const legacy = await createStage('legacy.csv', 'LEGACY');
    await fixture.store.activateHoldingImportStage(legacy.id);
    const futureLegacyCreatedAt = '2035-01-01T00:00:00.000Z';
    fixture.mutateStage(legacy.id, { activated_at: null, created_at: futureLegacyCreatedAt });
    fixture.store.clear();

    const newer = await createStage('newer.csv', 'NEWER');
    await fixture.store.activateHoldingImportStage(newer.id);

    const stages = await fixture.store.getHoldingImportStages();
    const activatedNewer = stages.find(row => row.id === newer.id)!;
    expect(Date.parse(activatedNewer.activated_at!)).toBeGreaterThan(Date.parse(futureLegacyCreatedAt));
    expect((await fixture.store.getHoldings()).map(row => row.symbol)).toEqual(['NEWER']);
  });

  it('keeps legacy unlinked Fidelity holdings out of value after activation even when cleanup is interrupted', async () => {
    const fixture = persistence();
    const account = await fixture.store.upsertBrokerageAccount({ broker_slug: 'fidelity', broker_name: 'Fidelity', account_mask: '7777' });
    await fixture.store.addHolding({
      symbol: 'OLD', shares: 1, purchase_price: 80, current_price: 100,
      account_display: 'Fidelity ···7777',
    });
    const row = {
      account_mask: '7777', account_display: 'Fidelity ···7777', symbol: 'NEW', shares: 1,
      avg_cost_basis: 80, cost_basis_total: 80, market_price: 120, market_value: 120,
      valuation_source: 'reported_price', position_as_of: '2026-10-01', status: 'replace',
      brokerage_account_id: account.id, purchase_price: 80, purchase_date: null,
      current_price: 120, value: 120, price_source: 'import_market_price', price_as_of: null,
      quote_date: null, cost_basis_status: 'known', lifecycle_status: 'staged', portfolio_row_index: 0,
    } as FidelityStageRow;
    const stage = await fixture.store.createHoldingImportStage({
      source: 'fidelity', filename: 'positions.csv', status: 'staged', account_masks: ['7777'],
      expected_row_count: 1, account_replacements: [], created_at: new Date().toISOString(),
    }, [row]);
    fixture.failHoldingCleanupOnce();
    await expectAsync(fixture.store.activateHoldingImportStage(stage.id)).toBeRejectedWithError('Injected interrupted holding cleanup');
    expect((await fixture.store.getHoldings()).map(holding => holding.symbol)).toEqual(['NEW']);
    expect((await fixture.store.getNetWorth()).portfolio).toBe(120);

    fixture.store.clear();
    await resumeFidelityImportStage(fixture.store, stage.id);
    expect(fixture.data('holdings').map(holding => holding.symbol)).toEqual(['NEW']);
  });

  it('keeps same-mask bank accounts separate by confirmed account key and renames by explicit ID', async () => {
    const fixture = persistence();
    const accountA = await fixture.store.upsertBankAccount({
      bank_slug: 'chase', account_mask: 'card', account_key: 'chase-account-a', display_name: 'Travel card', confirmed: true,
    });
    const accountB = await fixture.store.upsertBankAccount({
      bank_slug: 'chase', account_mask: 'card', account_key: 'chase-account-b', display_name: 'Household card', confirmed: true,
    });
    const renamed = await fixture.store.upsertBankAccount({ ...accountA, display_name: 'Main travel card' });

    const saved = await fixture.store.getBankAccounts();
    expect(saved.length).toBe(2);
    expect(renamed).toEqual(jasmine.objectContaining({ id: accountA.id, account_key: 'chase-account-a', display_name: 'Main travel card' }));
    expect(saved.find(row => row.id === accountB.id)).toEqual(jasmine.objectContaining({ account_key: 'chase-account-b', display_name: 'Household card' }));
  });

  it('preserves exact imported value on non-valuation edits and updates basis availability', async () => {
    const fixture = persistence();
    const holding = await fixture.store.addHolding({
      symbol: 'XYZ', shares: 3, purchase_price: null, current_price: 33.33,
      market_value: 100, cost_basis_status: 'unknown', price_source: 'import_market_price',
    });

    const updated = await fixture.store.updateHolding(holding.id, {
      symbol: 'XYZ renamed', shares: 3, current_price: 33.33, purchase_price: 25,
    });

    expect(updated).toEqual(jasmine.objectContaining({
      symbol: 'XYZ renamed', market_value: 100, value: 100, cost_basis_status: 'known',
    }));
  });

  it('does not complete or activate coverage when the first encrypted receipt row chunk is missing', async () => {
    const fixture = persistence();
    fixture.failFirstReceiptChunkOnce();
    const row: ImportPreviewRow = {
      dedupe_key: 'new-row', date: '2026-09-10', account_mask: 'card', account_display: 'Chase card',
      account_key: 'card', bank_slug: 'chase', description: 'Coffee', category: 'Food', amount: 10, status: 'new',
    };
    let stagingError: any;
    try {
      await fixture.store.addImportReceiptWithRows({
        bank_slugs: ['chase'], filenames: ['statement.csv'], status: 'staged', started_at: '2026-10-01T00:00:00Z',
        selected_row_count: 1, inserted_count: 0, unresolved: [], account_displays: ['Chase card'],
        coverage: [{ account_display: 'Chase card', account_key: 'card', start_date: '2026-09-01', end_date: '2026-09-30', confirmed: true }],
      } as any, [row]);
    } catch (error) {
      stagingError = error;
    }

    const receiptId = Number(stagingError?.receipt_id);
    expect(stagingError?.message).toBe('Injected interrupted receipt chunk');
    expect(receiptId).toBeGreaterThan(0);
    expect((await fixture.store.getImportReceipt(receiptId))?.selected_row_count).toBe(1);
    await expectAsync(resumeBankImportReceipt(fixture.store, receiptId))
      .toBeRejectedWithError('This receipt is missing staged rows and cannot be resumed. Re-import the original CSV.');
    expect((await fixture.store.getImportReceipt(receiptId))?.status).toBe('staging');

    // Re-importing the original CSV restores its encrypted chunks, after which resume is safe.
    await fixture.store.saveImportReceiptRows(receiptId, [row]);
    await resumeBankImportReceipt(fixture.store, receiptId);
    expect((await fixture.store.getImportReceipt(receiptId))?.status).toBe('complete');
    expect((await fixture.store.getTransactions()).some(tx => tx.import_receipt_id === receiptId)).toBeTrue();
  });

  it('undo retains an edited imported record and withdraws only the undone receipt coverage', async () => {
    const fixture = persistence();
    const receipt = await fixture.store.addImportReceipt({
      bank_slugs: ['chase'], filenames: ['statement.csv'], status: 'complete', started_at: '',
      completed_at: '', selected_row_count: 2, inserted_count: 2, unresolved: [],
      coverage: [{ account_key: 'card', start_date: '2026-09-01', end_date: '2026-09-30', confirmed: true }],
      coverage_start: '2026-09-01', coverage_end: '2026-09-30', account_displays: ['Card'], undo_summary: null,
    } as any);
    const snapshot = { date: '2026-09-10', type: 'expense', category: 'Food', amount: 10, description: 'SOURCE', merchant: null, reviewed: false };
    const unchanged = await fixture.store.addTransaction({ ...snapshot, source: 'import', import_receipt_id: receipt.id, import_snapshot: snapshot } as any);
    const edited = await fixture.store.addTransaction({ ...snapshot, source: 'import', import_receipt_id: receipt.id, import_snapshot: snapshot } as any);
    await fixture.store.updateTransaction(edited.id, { merchant: 'Friendly name' });
    const result = await fixture.store.undoImportReceipt(receipt.id);
    expect(result).toEqual({ removed: 1, edited: 1, missing: 0 });
    expect((await fixture.store.getTransactions()).map(row => row.id)).toEqual([edited.id]);
    expect(fixture.data('transactions').find(row => row.id === unchanged.id)).toBeUndefined();
    expect((await fixture.store.getImportReceipt(receipt.id))?.coverage).toEqual([]);
    fixture.store.clear();
    expect(await fixture.store.undoImportReceipt(receipt.id)).toEqual(result);
  });
});
