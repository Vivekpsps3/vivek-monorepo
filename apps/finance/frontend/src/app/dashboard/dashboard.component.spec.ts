import { Component, Input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CashflowSummary, Holding, Transaction } from '../models/transaction.model';
import { FinanceService } from '../services/finance.service';
import { ChartsComponent } from '../charts/charts.component';
import { DashboardComponent } from './dashboard.component';

@Component({ selector: 'app-charts', standalone: true, template: '' })
class DashboardChartsStubComponent {
  @Input() embedded = false;
  @Input() dataReady = false;
  @Input() overrideTransactions: Transaction[] = [];
}

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

  it('renders dated sources, unknown estimate dates, and the aggregate overlap adjustment on Home', async () => {
    const cashflow = {
      total_income: 3000,
      total_expenses: 0,
      net_cashflow: 3000,
      income_occurrences: [
        { id: 'pay', date: '2026-10-15', kind: 'paycheck', label: 'Projected paycheck', name: 'Acme', detail: 'biweekly schedule · estimated net', amount: 2000 },
        { id: 'sale', date: '2026-10-16', kind: 'stock_sale', label: 'ESPP sale', name: 'Acme', detail: 'ESPP 2026 · 5 shares sold', amount: 1000 },
        { id: 'equity', date: null, kind: 'estimate', label: 'Annual equity estimate', name: 'Acme', detail: 'Undated estimate; no payout date recorded', amount: 500 },
        { id: 'overlap', date: null, kind: 'overlap', label: 'Possible income overlap adjustment', name: 'Monthly aggregate adjustment', detail: 'Totals are within 20%; no date match is inferred.', amount: -500 },
      ],
    } as unknown as CashflowSummary;
    const finance = {
      netWorth$: of({ total: 1000, portfolio: 500, other_assets: 600, liabilities: 100 }),
      cashflowSummary$: of(cashflow),
      holdings$: of([]),
      dashboardTransactions$: of([]),
      assets$: of([]),
      liabilities$: of([]),
      fixedExpenses$: of([]),
      jobIncomes$: of([]),
      subscriptions$: of([]),
      loadDashboard: jasmine.createSpy('loadDashboard').and.returnValue(of([])),
      getLiabilities: jasmine.createSpy('getLiabilities').and.returnValue(of([])),
    } as unknown as FinanceService;
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [{ provide: FinanceService, useValue: finance }, provideRouter([])],
    }).overrideComponent(DashboardComponent, {
      remove: { imports: [ChartsComponent] },
      add: { imports: [DashboardChartsStubComponent] },
    }).compileComponents();
    const fixture: ComponentFixture<DashboardComponent> = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const breakdown = fixture.nativeElement.querySelector('[aria-label="Monthly income breakdown"]') as HTMLElement;
    expect(breakdown.textContent).toContain('Projected paycheck · Acme');
    expect(breakdown.textContent).toContain('2026-10-15');
    expect(breakdown.textContent).toContain('ESPP sale · Acme');
    expect(breakdown.textContent).toContain('Annual equity estimate · Acme');
    expect(breakdown.textContent).toContain('Date unknown');
    expect(breakdown.textContent).toContain('Possible income overlap adjustment');
    expect(fixture.nativeElement.textContent).toContain('Income and spending, counted once');
    fixture.destroy();
  });
});
