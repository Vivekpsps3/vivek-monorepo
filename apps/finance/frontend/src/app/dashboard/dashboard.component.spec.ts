import { of } from 'rxjs';
import { Holding } from '../models/transaction.model';
import { FinanceService } from '../services/finance.service';
import { DashboardComponent } from './dashboard.component';

describe('Dashboard', () => {
  it('loads the finance summary without fetching import or account details', () => {
    const finance = {
      netWorth$: of({ total: 1500 }),
      cashflowSummary$: of(null),
      holdings$: of([]),
      dashboardTransactions$: of([{ id: 1, date: '2026-10-10' }]),
      assets$: of([]),
      liabilities$: of([]),
      fixedExpenses$: of([]),
      jobIncomes$: of([]),
      subscriptions$: of([]),
      loadDashboard: jasmine.createSpy('loadDashboard').and.returnValue(of([])),
      getLiabilities: jasmine.createSpy('getLiabilities').and.returnValue(of([])),
      getBankAccounts: jasmine.createSpy('getBankAccounts'),
      getImportReceipts: jasmine.createSpy('getImportReceipts'),
      getAllTransactions: jasmine.createSpy('getAllTransactions'),
    } as unknown as FinanceService;
    const component = new DashboardComponent(finance, { markForCheck: () => undefined } as any);

    component.ngOnInit();

    expect(component.netWorth?.total).toBe(1500);
    expect(component.transactions.length).toBe(1);
    expect(component.isStarterState).toBeFalse();
    expect(finance.loadDashboard).toHaveBeenCalledOnceWith(false);
    expect(finance.getBankAccounts).not.toHaveBeenCalled();
    expect(finance.getImportReceipts).not.toHaveBeenCalled();
    expect(finance.getAllTransactions).not.toHaveBeenCalled();
    component.ngOnDestroy();
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
