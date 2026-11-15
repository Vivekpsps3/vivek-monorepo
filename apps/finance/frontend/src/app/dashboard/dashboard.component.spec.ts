import { Component,Input } from '@angular/core';
import { ComponentFixture,TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ChartsComponent } from '../charts/charts.component';
import {
CashflowSummary,
Transaction
} from '../models/transaction.model';
import { FinanceService } from '../services/finance.service';
import { MarketRefreshCoordinatorService } from '../services/market-refresh-coordinator.service';
import { DashboardComponent } from './dashboard.component';

@Component({ selector: 'app-charts', standalone: true, template: '' })
class DashboardChartsStubComponent {
  @Input() embedded = false;
  @Input() dataReady = false;
  @Input() overrideTransactions: Transaction[] = [];
}

describe('Dashboard', () => {
  beforeEach(() => TestBed.configureTestingModule({
    providers: [{ provide: MarketRefreshCoordinatorService, useValue: null }],
  }));

  it('renders dated sources, unknown estimate dates, and the aggregate overlap adjustment on Home', async () => {
    const cashflow = {
      total_income: 3000,
      total_expenses: 0,
      net_cashflow: 3000,
      income_occurrences: [
        { id: 'pay', date: '2026-10-15', kind: 'paycheck', label: 'Projected paycheck', name: 'Acme', detail: 'biweekly schedule · estimated net', amount: 2000, payday_frequency: 'biweekly' },
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
    expect(breakdown.textContent).toContain('Acme paycheck');
    expect(breakdown.textContent).toContain('Oct 15');
    expect(breakdown.textContent).toContain('Estimated net · Every two weeks');
    expect(breakdown.textContent).toContain('ESPP sale');
    expect(breakdown.textContent).toContain('Annual equity');
    expect(breakdown.textContent).toContain('No date');
    expect(breakdown.textContent).toContain('Possible income overlap adjustment');
    expect(fixture.nativeElement.textContent).not.toContain('Income and spending, counted once');
    expect(fixture.nativeElement.textContent).not.toContain('Current net worth');
    expect(fixture.nativeElement.textContent).not.toContain('Source dates');
    fixture.destroy();
  });

});
