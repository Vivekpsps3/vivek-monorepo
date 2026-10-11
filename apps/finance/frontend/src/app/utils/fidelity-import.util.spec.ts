import {
  buildFidelityImportPreview,
  commitFidelityImportRows,
  listClientBrokerageImports,
  parseFidelityCsv,
  replacementPreviewForAccounts,
  getResumableFidelityStages,
  resumeFidelityImportStage,
} from './fidelity-import.util';

const SAMPLE_CSV = [
  'Account Number,Account Name,Symbol,Description,Quantity,Average Cost Basis',
  'Z111,Individual,VOO,VOO ETF,2,$500.00',
  'Z222,Roth IRA,VT,VT ETF,1,100',
].join('\n');

describe('fidelity-import util', () => {
  it('lists Fidelity as the client-side brokerage importer', () => {
    expect(listClientBrokerageImports().map(b => b.slug)).toEqual(['fidelity']);
  });

  it('parses positions while leaving undated cost-only source values undated', () => {
    const rows = parseFidelityCsv(SAMPLE_CSV);
    expect(rows.map(r => r.symbol).sort()).toEqual(['VOO', 'VT']);
    const voo = rows.find(r => r.symbol === 'VOO')!;
    expect(voo.account_mask).toBe('Z111');
    expect(voo.shares).toBe(2);
    expect(voo.avg_cost_basis).toBe(500);
    expect(voo.market_value).toBe(1000);
    expect(voo.valuation_source).toBe('provisional_cost_basis');
    expect(voo.position_as_of).toBeNull();
  });

  it('preserves exact reported current value when price is rounded', () => {
    const rows = parseFidelityCsv([
      'Account Number,Symbol,Quantity,Average Cost Basis,Last Price,Current Value,Position Date',
      'Z1,ABC,3,10,33.33,100.00,2026-10-10',
    ].join('\n'));
    expect(rows[0].market_price).toBe(33.33);
    expect(rows[0].market_value).toBe(100);
    expect(rows[0].position_as_of).toBe('2026-10-10');
    expect(rows[0].valuation_source).toBe('reported_price');
  });

  it('derives a price from market value and reports unavailable value when both are absent', () => {
    const rows = parseFidelityCsv([
      'Account Number,Symbol,Quantity,Average Cost Basis,Current Value',
      'Z1,ABC,4,10,120.00',
      'Z1,XYZ,2,N/A,N/A',
    ].join('\n'));
    expect(rows[0]).toEqual(jasmine.objectContaining({ market_price: 30, market_value: 120, valuation_source: 'derived_market_value' }));
    expect(rows[1]).toEqual(jasmine.objectContaining({ avg_cost_basis: null, cost_basis_total: null, market_price: null, market_value: null, valuation_source: 'unavailable' }));
  });

  it('treats a zero basis as known and does not invent dates from import time', () => {
    const rows = parseFidelityCsv([
      'Account Number,Symbol,Quantity,Average Cost Basis,Position Date',
      'Z1,ABC,2,0,not-a-date',
    ].join('\n'));
    expect(rows[0].avg_cost_basis).toBe(0);
    expect(rows[0].cost_basis_total).toBe(0);
    expect(rows[0].position_as_of).toBeNull();
    expect(rows[0].valuation_source).toBe('unavailable');
  });

  it('builds an account and valuation preview without backend calls', () => {
    const preview = buildFidelityImportPreview('fidelity.csv', SAMPLE_CSV);
    expect(preview.broker).toBe('Fidelity');
    expect(preview.summary).toEqual(jasmine.objectContaining({
      accounts: 2,
      positions: 2,
      total_cost: 1100,
      known_cost_total: 1100,
      total_market_value: 1100,
      provisional_positions: 2,
      unavailable_positions: 0,
      unknown_basis_positions: 0,
    }));
    expect(preview.accounts).toEqual(['Fidelity ···Z111', 'Fidelity ···Z222']);
    expect(preview.rows[0]).toEqual(jasmine.objectContaining({
      account_mask: 'Z111',
      account_display: 'Fidelity ···Z111 (Individual)',
      symbol: 'VOO',
      status: 'replace',
      market_value: 1000,
      valuation_source: 'provisional_cost_basis',
    }));
  });

  it('does not match a same-mask account belonging to a different brokerage', () => {
    const current: any[] = [{
      id: 2,
      symbol: 'OTHER',
      shares: 5,
      purchase_price: 20,
      purchase_date: '2024-01-01',
      value: 100,
      brokerage_account_id: 22,
      account_display: 'Schwab ···Z1',
    }];
    const preview = replacementPreviewForAccounts(
      [{ account_mask: 'Z1', account_display: 'Fidelity ···Z1', symbol: 'ABC', shares: 1, avg_cost_basis: 10, cost_basis_total: 10, market_value: 15, valuation_source: 'reported_price', status: 'replace' } as any],
      current,
      new Set(['Z1']),
      [{ id: 22, broker_slug: 'schwab', broker_name: 'Schwab', account_mask: 'Z1', label: 'Schwab ···Z1' }],
    );
    expect(preview[0].existing_market_value).toBe(0);
    expect(preview[0].change).toBe(15);
  });

  it('matches renamed Fidelity accounts through brokerage account id for replacement preview', () => {
    const current: any[] = [{
      id: 1, symbol: 'OLD', shares: 2, purchase_price: 10, purchase_date: '2024-01-01',
      value: 40, brokerage_account_id: 9, account_display: 'Household retirement',
    }];
    const preview = replacementPreviewForAccounts(
      [{ account_mask: 'Z1', account_display: 'Fidelity ···Z1', symbol: 'NEW', shares: 1, avg_cost_basis: 10, cost_basis_total: 10, market_value: 30, valuation_source: 'reported_price', status: 'replace' } as any],
      current,
      new Set(['Z1']),
      [{ id: 9, broker_slug: 'fidelity', broker_name: 'Fidelity', account_mask: 'Z1', nickname: 'Household retirement' }],
    );
    expect(preview[0].existing_market_value).toBe(40);
    expect(preview[0].replacement_market_value).toBe(30);
    expect(preview[0].change).toBe(-10);
  });

  it('stages, verifies and activates replacement rows without direct delete-and-add', async () => {
    const holdings: any[] = [{ id: 1, symbol: 'OLD', shares: 1, purchase_price: 10, purchase_date: '2020-01-01', value: 10, brokerage_account_id: 9, account_display: 'Fidelity ···Z111' }];
    const accounts: any[] = [{ id: 9, broker_slug: 'fidelity', broker_name: 'Fidelity', account_mask: 'Z111', label: 'Fidelity ···Z111' }];
    let stagedRows: any[] = [];
    const stage = { id: 5, source: 'fidelity', filename: 'fidelity.csv', status: 'staged', account_masks: ['Z111'], expected_row_count: 1, account_replacements: [], created_at: '2026-10-11T00:00:00.000Z' };
    const store: any = {
      getHoldings: jasmine.createSpy().and.resolveTo(holdings),
      getBrokerageAccounts: jasmine.createSpy().and.resolveTo(accounts),
      upsertBrokerageAccount: jasmine.createSpy(),
      createHoldingImportStage: jasmine.createSpy().and.callFake(async (_body: any, rows: any[]) => {
        stagedRows = rows;
        return stage;
      }),
      getHoldingImportStages: jasmine.createSpy().and.resolveTo([stage]),
      getHoldingImportStageRows: jasmine.createSpy().and.callFake(async () => stagedRows),
      verifyHoldingImportStage: jasmine.createSpy().and.resolveTo({ ...stage, status: 'verified' }),
      activateHoldingImportStage: jasmine.createSpy().and.resolveTo({ accounts_replaced: 1, holdings_replaced: 1, inserted: 1, accounts: ['Fidelity ···Z111'], stage_id: 5, status: 'activated' }),
    };
    const preview = buildFidelityImportPreview('fidelity.csv', SAMPLE_CSV);
    const selected = preview.rows.filter(r => r.account_mask === 'Z111');

    const result = await commitFidelityImportRows(store, selected, ['Z111']);

    expect(store.createHoldingImportStage).toHaveBeenCalled();
    expect(stagedRows[0]).toEqual(jasmine.objectContaining({
      symbol: 'VOO', lifecycle_status: 'staged', purchase_date: null,
      position_as_of: null, quote_date: null, value: 1000,
      cost_basis_status: 'known', brokerage_account_id: 9,
    }));
    expect(store.verifyHoldingImportStage).toHaveBeenCalledWith(5);
    expect(store.activateHoldingImportStage).toHaveBeenCalledWith(5);
    expect(result.status).toBe('activated');
    expect(store.deleteHolding).toBeUndefined();
  });

  it('lists staged work after an interruption and resumes the same stage without duplicating it', async () => {
    const stage: any = { id: 8, source: 'fidelity', filename: 'retry.csv', status: 'interrupted', account_masks: ['Z9'], expected_row_count: 2, account_replacements: [], created_at: '2026-10-11T00:00:00Z' };
    const store: any = {
      getHoldingImportStages: jasmine.createSpy().and.resolveTo([stage, { ...stage, id: 7, status: 'activated' }]),
      verifyHoldingImportStage: jasmine.createSpy().and.resolveTo({ ...stage, status: 'verified' }),
      activateHoldingImportStage: jasmine.createSpy().and.resolveTo({ accounts_replaced: 1, holdings_replaced: 1, inserted: 2, accounts: ['Fidelity ···Z9'], stage_id: 8, status: 'activated' }),
    };
    expect((await getResumableFidelityStages(store)).map(row => row.id)).toEqual([8]);
    const result = await resumeFidelityImportStage(store, 8);
    expect(store.verifyHoldingImportStage).toHaveBeenCalledWith(8);
    expect(store.activateHoldingImportStage).toHaveBeenCalledWith(8);
    expect(result.stage_id).toBe(8);
    expect(result.status).toBe('activated');
  });
});
