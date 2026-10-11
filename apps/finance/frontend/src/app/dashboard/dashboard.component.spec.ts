import { of } from 'rxjs';
import { FinanceService } from '../services/finance.service';
import { DashboardComponent } from './dashboard.component';

describe('Dashboard review queue', () => {
  it('resolves classified credit notes dynamically and keeps withdrawn receipts out of review', () => {
    const creditNote = { line: 7, reason: 'Unclassified credit from 2026-01-02: Card credit' };
    const receipts = [
      {
        id: 1, bank_slugs: ['chase'], filenames: ['ambiguous.csv'], status: 'complete',
        started_at: '2026-01-03T00:00:00Z', selected_row_count: 1, inserted_count: 1,
        unresolved: [creditNote], account_displays: ['Chase'],
      },
      {
        id: 2, bank_slugs: ['amex'], filenames: ['resolved.csv'], status: 'complete',
        started_at: '2026-01-03T00:00:00Z', selected_row_count: 1, inserted_count: 1,
        unresolved: [creditNote], account_displays: ['Amex'],
      },
      {
        id: 3, bank_slugs: ['chase'], filenames: ['withdrawn.csv'], status: 'withdrawn',
        started_at: '2026-01-03T00:00:00Z', selected_row_count: 0, inserted_count: 0,
        unresolved: [{ line: 8, reason: 'CSV row could not be parsed' }], account_displays: ['Chase'],
      },
      {
        id: 4, bank_slugs: ['amex'], filenames: ['parse-error.csv'], status: 'partial',
        started_at: '2026-01-03T00:00:00Z', selected_row_count: 1, inserted_count: 1,
        unresolved: [{ line: 9, reason: 'Unrecognized date: "bad date"' }], account_displays: ['Amex'],
      },
    ] as any;
    const finance = {
      netWorth$: of(null),
      cashflowSummary$: of(null),
      holdings$: of([]),
      dashboardTransactions$: of([]),
      assets$: of([]),
      liabilities$: of([]),
      fixedExpenses$: of([]),
      subscriptions$: of([]),
      loadDashboard: () => of([]),
      getLiabilities: () => of([]),
      getBankAccounts: () => of([]),
      getImportReceipts: () => of(receipts),
      getAllTransactions: () => of([
        { id: 1, date: '2026-01-02', description: 'Card credit', import_receipt_id: 1, kind: 'ambiguous_credit' },
        { id: 2, date: '2026-01-02', description: 'Card credit', import_receipt_id: 2, kind: 'refund' },
      ]),
    } as unknown as FinanceService;
    const component = new DashboardComponent(finance, { markForCheck: () => undefined } as any);

    component.ngOnInit();

    expect(component.reviewItems.map(item => item.id)).toEqual(['receipt-1', 'receipt-4']);
    expect(component.reviewItems[0].detail).toContain('1 unresolved row(s)');
    expect(component.reviewItems[0].link).toBe('/spending');
    expect(component.reviewItems[0].query).toEqual({ t: 'imports' });
    expect(component.reviewItems[1].detail).toContain('1 unresolved row(s)');
  });
});
