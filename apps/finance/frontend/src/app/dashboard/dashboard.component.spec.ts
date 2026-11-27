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

  it('opens card import in Imports and does not repeat starter actions', async () => {
    const host = await renderHome({
      netWorth: { total: 0, portfolio: 0, other_assets: 0, liabilities: 0 },
      assets: [],
      transactions: [],
    });
    const card = host.querySelector('.home-empty__secondary') as HTMLAnchorElement;
    expect(card.textContent?.trim()).toBe('Import card activity');
    expect(card.getAttribute('href')).toBe('/finance/imports?start=bank');
    expect(card.getAttribute('href')).not.toContain('add=1');
    const stepLinks = [...host.querySelectorAll('.first-steps a')].map(link => link.textContent?.trim());
    expect(stepLinks).toEqual(['Add holdings', 'Add pay and bills']);
    expect(host.querySelector('.first-steps__progress')?.textContent).toContain('0 of 4 done');
  });

  it('keeps a dated manual add distinct from import on a vault with records', async () => {
    const host = await renderHome({
      netWorth: { total: 4200, portfolio: 0, other_assets: 4200, liabilities: 0 },
      assets: [{ id: 1, name: 'Checking', category: 'cash', current_value: 4200, as_of_date: '2026-10-22' }],
      transactions: [],
    });
    expect(host.querySelector('.home-empty')).toBeNull();
    expect(host.textContent).not.toContain('Import card activity');
    const balance = host.querySelector('.home-tile--balance');
    const steps = host.querySelector('.first-steps');
    expect(balance).not.toBeNull();
    expect(steps).not.toBeNull();
    expect(balance!.compareDocumentPosition(steps!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const activity = [...host.querySelectorAll('.first-steps a')].find(link => link.textContent?.trim() === 'Add activity') as HTMLAnchorElement;
    expect(activity.getAttribute('href')).toBe('/finance/imports?start=bank');
    const manual = host.querySelector('.home-tile--activity a') as HTMLAnchorElement;
    expect(manual.textContent).toContain('Add a transaction');
    expect(manual.getAttribute('href')).toContain('add=1');
    expect(manual.getAttribute('href')).toMatch(/date=\d{4}-\d{2}-\d{2}/);
    expect(manual.getAttribute('href')).not.toContain('imports');
  });

});

async function renderHome(seed: {
  netWorth: { total: number; portfolio: number; other_assets: number; liabilities: number };
  assets: unknown[];
  transactions: unknown[];
}): Promise<HTMLElement> {
  const finance = {
    netWorth$: of(seed.netWorth),
    cashflowSummary$: of({ total_income: 0, total_expenses: 0, net_cashflow: 0, income_occurrences: [] }),
    holdings$: of([]),
    dashboardTransactions$: of(seed.transactions),
    assets$: of(seed.assets),
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
  return fixture.nativeElement as HTMLElement;
}
