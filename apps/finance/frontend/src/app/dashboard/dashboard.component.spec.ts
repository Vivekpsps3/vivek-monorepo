import { fakeAsync, tick } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { Holding } from '../models/transaction.model';
import { FinanceService } from '../services/finance.service';
import { DashboardComponent } from './dashboard.component';

describe('Dashboard review queue', () => {
  it('refreshes mounted account coverage and removes a withdrawn import from attention', fakeAsync(() => {
    let accounts: any[] = [{ account_key: 'account-a', display_name: 'Old card label', confirmed: true }];
    let receipts: any[] = [{
      id: 7, status: 'partial', filenames: ['import.csv'], unresolved: [{ line: 4, reason: 'Unrecognized date' }],
      account_displays: ['Old card label'], started_at: '2026-01-01T00:00:00Z', selected_row_count: 0, inserted_count: 0,
    }];
    const dataChanges$ = new Subject<any>();
    const finance = {
      dataChanges$,
      netWorth$: of(null), cashflowSummary$: of(null), holdings$: of([]), dashboardTransactions$: of([]),
      assets$: of([]), liabilities$: of([]), fixedExpenses$: of([]), jobIncomes$: of([]), subscriptions$: of([]),
      loadDashboard: () => of([]), getLiabilities: () => of([]), getJobIncomes: () => of([]),
      getBankAccounts: () => of(accounts), getImportReceipts: () => of(receipts), getAllTransactions: () => of([]),
    } as unknown as FinanceService;
    const component = new DashboardComponent(finance, { markForCheck: () => undefined } as any);
    component.ngOnInit();
    expect(component.reviewItems.find(item => item.id === 'coverage-account-a')?.title).toBe('Old card label');
    expect(component.reviewItems.some(item => item.id === 'receipt-7')).toBeTrue();

    accounts = [{ account_key: 'account-a', display_name: 'Renamed card', confirmed: true }];
    receipts = [{ ...receipts[0], status: 'withdrawn' }];
    dataChanges$.next({ collections: ['bank_accounts', 'import_batches'], source: 'remote' });
    tick(80);

    expect(component.reviewItems.find(item => item.id === 'coverage-account-a')?.title).toBe('Renamed card');
    expect(component.reviewItems.some(item => item.id === 'receipt-7')).toBeFalse();
    component.ngOnDestroy();
  }));

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
      jobIncomes$: of([]),
      subscriptions$: of([]),
      loadDashboard: () => of([]),
      getLiabilities: () => of([]),
      getBankAccounts: () => of([]),
      getImportReceipts: () => of(receipts),
      getJobIncomes: () => of([]),
      getAllTransactions: () => of([
        { id: 1, date: '2026-01-02', description: 'Card credit', import_receipt_id: 1, kind: 'ambiguous_credit' },
        { id: 2, date: '2026-01-02', description: 'Card credit', import_receipt_id: 2, kind: 'refund', reviewed: true },
      ]),
    } as unknown as FinanceService;
    const component = new DashboardComponent(finance, { markForCheck: () => undefined } as any);

    component.ngOnInit();

    expect(component.reviewItems.map(item => item.id)).toEqual(['credit-1', 'receipt-4']);
    expect(component.reviewItems[0].category).toBe('Ambiguous credit');
    expect(component.reviewItems[0].query).toEqual(jasmine.objectContaining({
      t: 'activity', v: 'all', review: 'needs', edit: '1', account: '__unassigned_account__',
    }));
    expect(component.reviewItems[1].detail).toContain('1 unresolved row(s)');
  });

  it('shows setup links only while the user has no recorded finance data', () => {
    const component = new DashboardComponent({} as any, { markForCheck: () => {} } as any);
    expect(component.isStarterState).toBeTrue();
    component.jobIncomes = [{ id: 1 } as any];
    expect(component.isStarterState).toBeFalse();
  });

  it('reports quote dates from source trading dates, not recent fetch timestamps', () => {
    const component = new DashboardComponent({} as any, { markForCheck: () => {} } as any);
    component.holdings = [
      { id: 1, symbol: 'ABC', shares: 1, purchase_price: 10, purchase_date: null, quote_date: null, price_as_of: '2026-10-11T08:00:00Z' } as Holding,
    ];
    expect(component.quoteSourceDates).toBe('Date unknown');
    component.holdings = [{ ...component.holdings[0], quote_date: '2026-10-08' }];
    expect(component.quoteSourceDates).toBe('2026-10-08');
  });
});
