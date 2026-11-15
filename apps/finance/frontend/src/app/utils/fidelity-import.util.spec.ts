import {
buildFidelityImportPreview,
commitFidelityImportRows,
parseFidelityCsv
} from './fidelity-import.util';

const SAMPLE_CSV = [
  'Account Number,Account Name,Symbol,Description,Quantity,Average Cost Basis',
  'Z111,Individual,VOO,VOO ETF,2,$500.00',
  'Z222,Roth IRA,VT,VT ETF,1,100',
].join('\n');

describe('fidelity-import util', () => {

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

});
