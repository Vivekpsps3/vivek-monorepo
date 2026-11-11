import { SESSION_CONTEXT } from '@vivek/ui';
import { FinancePricePrefsService } from '../core/finance-price-prefs.service';
import { MarketRefreshCoordinatorService } from '../services/market-refresh-coordinator.service';
import { Component, Input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, ReplaySubject, Subject, of, throwError } from 'rxjs';
import { type SessionPort } from '@vivek/ui';
import {
  Asset,
  CashflowSummary,
  FixedExpense,
  Holding,
  Subscription,
  Transaction,
} from '../models/transaction.model';
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
  beforeEach(() => TestBed.configureTestingModule({
    providers: [{ provide: MarketRefreshCoordinatorService, useValue: null }],
  }));
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
    const component = TestBed.runInInjectionContext(() => new DashboardComponent(finance, { markForCheck: () => undefined } as any));

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
    const component = TestBed.runInInjectionContext(() => new DashboardComponent({} as any, { markForCheck: () => {} } as any));
    expect(component.isStarterState).toBeTrue();
    component.jobIncomes = [{ id: 1 } as any];
    expect(component.isStarterState).toBeFalse();
  });

  it('reports quote dates from source trading dates, not recent fetch timestamps', () => {
    const component = TestBed.runInInjectionContext(() => new DashboardComponent({} as any, { markForCheck: () => {} } as any));
    component.holdings = [
      { id: 1, symbol: 'ABC', shares: 1, purchase_price: 10, purchase_date: null, quote_date: null, price_as_of: '2026-10-11T08:00:00Z' } as Holding,
    ];
    expect(component.quoteSourceDates).toBe('No date');
    component.holdings = [{ ...component.holdings[0], quote_date: '2026-10-08' }];
    expect(component.quoteSourceDates).toBe('Oct 8');
  });

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

  it('shows First steps when the Guide requested them even with data', async () => {
    const finance = {
      netWorth$: of({ total: 1000, portfolio: 500, other_assets: 600, liabilities: 100 }),
      cashflowSummary$: of(null),
      holdings$: of([]),
      dashboardTransactions$: of([{ id: 1, date: '2026-10-10' }]),
      assets$: of([{ id: 1 }]),
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
    expect(fixture.componentInstance.isStarterState).toBeFalse();
    fixture.componentInstance.hideFirstSteps();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('First steps');
    const { FinanceGuideService } = await import('../core/finance-guide.service');
    TestBed.inject(FinanceGuideService).requestFirstSteps();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('First steps');
    fixture.destroy();
  });
  function priceStubs(autoCheck: boolean) {
    const finance = {
      netWorth$: of({ total: 1000, portfolio: 500, other_assets: 600, liabilities: 100 }),
      cashflowSummary$: of(null),
      holdings$: of([{ id: 1, symbol: 'VOO', shares: 1 }]),
      dashboardTransactions$: of([]),
      assets$: of([]),
      liabilities$: of([]),
      fixedExpenses$: of([]),
      jobIncomes$: of([]),
      subscriptions$: of([]),
      loadDashboard: jasmine.createSpy('loadDashboard').and.returnValue(of([])),
      getLiabilities: jasmine.createSpy('getLiabilities').and.returnValue(of([])),
    } as unknown as FinanceService;
    const firstAutoCheck = new ReplaySubject<readonly string[]>(1);
    const coordinator = {
      firstAutoCheck$: firstAutoCheck.asObservable(),
      refreshNow: jasmine.createSpy('refreshNow').and.resolveTo({}),
    } as unknown as MarketRefreshCoordinatorService;
    const prefs = new FinancePricePrefsService();
    if (!autoCheck) prefs.setAutoCheck(7, false);
    const session = { currentUser: { id: 7 }, user$: of(null) };
    return { finance, firstAutoCheck, coordinator, prefs, session };
  }

  it('shows the one-time price notice after the first automatic check and records dismissal', async () => {
    localStorage.clear();
    const { finance, firstAutoCheck, coordinator, prefs, session } = priceStubs(true);
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        { provide: FinanceService, useValue: finance },
        { provide: MarketRefreshCoordinatorService, useValue: coordinator },
        { provide: FinancePricePrefsService, useValue: prefs },
        { provide: SESSION_CONTEXT, useValue: session },
        provideRouter([]),
      ],
    }).overrideComponent(DashboardComponent, {
      remove: { imports: [ChartsComponent] },
      add: { imports: [DashboardChartsStubComponent] },
    }).compileComponents();
    const fixture: ComponentFixture<DashboardComponent> = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.priceNoticeVisible).toBeFalse();

    firstAutoCheck.next(['voo']);
    fixture.detectChanges();
    expect(fixture.componentInstance.priceNoticeVisible).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('Prices checked automatically for 1 ticker symbol (VOO). Only ticker symbols are sent.');
    expect(fixture.nativeElement.textContent).toContain('Turn off automatic checks');
    expect(fixture.nativeElement.textContent).toContain('OK');

    const ok = [...fixture.nativeElement.querySelectorAll('button')].find(button => (button as HTMLButtonElement).textContent?.trim() === 'OK') as HTMLButtonElement;
    ok.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.priceNoticeVisible).toBeFalse();
    expect(prefs.noticeSeen(7)).toBeTrue();
    expect(prefs.autoCheck(7)).toBeTrue();
    expect(fixture.componentInstance.autoPricesOff).toBeFalse();
    fixture.destroy();
    localStorage.clear();
  });

  it('turns automatic checks off from the notice and shows manual Refresh', async () => {
    localStorage.clear();
    const { finance, firstAutoCheck, coordinator, prefs, session } = priceStubs(true);
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        { provide: FinanceService, useValue: finance },
        { provide: MarketRefreshCoordinatorService, useValue: coordinator },
        { provide: FinancePricePrefsService, useValue: prefs },
        { provide: SESSION_CONTEXT, useValue: session },
        provideRouter([]),
      ],
    }).overrideComponent(DashboardComponent, {
      remove: { imports: [ChartsComponent] },
      add: { imports: [DashboardChartsStubComponent] },
    }).compileComponents();
    const fixture: ComponentFixture<DashboardComponent> = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    firstAutoCheck.next(['VOO']);
    fixture.detectChanges();
    const turnOff = [...fixture.nativeElement.querySelectorAll('button')].find(button => (button as HTMLButtonElement).textContent?.includes('Turn off automatic checks')) as HTMLButtonElement;
    turnOff.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.priceNoticeVisible).toBeFalse();
    expect(prefs.noticeSeen(7)).toBeTrue();
    expect(prefs.autoCheck(7)).toBeFalse();
    expect(fixture.componentInstance.autoPricesOff).toBeTrue();
    expect((fixture.nativeElement.querySelector('.home-tile--balance') as HTMLElement).textContent).toContain('Automatic price checks are off');
    expect(fixture.nativeElement.querySelector('.home-refresh-prices')).not.toBeNull();
    fixture.destroy();
    localStorage.clear();
  });

  it('shows the off state and a manual Refresh prices action when automatic checks are off', async () => {
    localStorage.clear();
    const { finance, coordinator, prefs, session } = priceStubs(false);
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        { provide: FinanceService, useValue: finance },
        { provide: MarketRefreshCoordinatorService, useValue: coordinator },
        { provide: FinancePricePrefsService, useValue: prefs },
        { provide: SESSION_CONTEXT, useValue: session },
        provideRouter([]),
      ],
    }).overrideComponent(DashboardComponent, {
      remove: { imports: [ChartsComponent] },
      add: { imports: [DashboardChartsStubComponent] },
    }).compileComponents();
    const fixture: ComponentFixture<DashboardComponent> = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.autoPricesOff).toBeTrue();
    const balanceTile = fixture.nativeElement.querySelector('.home-tile--balance') as HTMLElement;
    expect(balanceTile.textContent).toContain('Automatic price checks are off');
    const button = fixture.nativeElement.querySelector('.home-refresh-prices') as HTMLElement;
    expect(button).not.toBeNull();
    expect(balanceTile.contains(button)).toBeFalse();
    fixture.componentInstance.refreshPrices();
    expect(coordinator.refreshNow).toHaveBeenCalled();
    fixture.destroy();
    localStorage.clear();
  });
});

describe('Home states (F14)', () => {
  beforeEach(() => TestBed.configureTestingModule({
    providers: [{ provide: MarketRefreshCoordinatorService, useValue: null }],
  }));
  interface HomeData {
    assets?: Asset[];
    holdings?: Holding[];
    transactions?: Transaction[];
    fixed?: FixedExpense[];
    subs?: Subscription[];
    cashflow?: CashflowSummary | null;
  }

  const asset = { id: 1, name: 'Checking', category: 'cash', current_value: 100, as_of_date: '2026-10-22' } as Asset;
  const holding = { id: 1, symbol: 'VOO', shares: 1 } as Holding;
  const transaction = { id: 1, date: '2026-10-10', amount: -5 } as unknown as Transaction;

  function sub(name: string, amount: number, nextBill: string): Subscription {
    return {
      id: 1,
      name,
      category: 'entertainment',
      amount,
      frequency: 'monthly',
      next_bill_date: nextBill,
      is_active: true,
    } as Subscription;
  }

  function bill(name: string, dueDay: number, amount = 10): FixedExpense {
    return {
      id: 1,
      name,
      category: 'utilities',
      amount,
      frequency: 'monthly',
      start_date: '2026-01-01',
      due_day: dueDay,
      is_active: true,
    } as FixedExpense;
  }

  async function render(
    data: HomeData,
    loadDashboard: () => Observable<unknown> = () => of([]),
  ): Promise<ComponentFixture<DashboardComponent>> {
    const finance = {
      netWorth$: of({ total: 0, portfolio: 0, other_assets: 0, liabilities: 0 }),
      cashflowSummary$: of(data.cashflow ?? null),
      holdings$: of(data.holdings ?? []),
      dashboardTransactions$: of(data.transactions ?? []),
      assets$: of(data.assets ?? []),
      liabilities$: of([]),
      fixedExpenses$: of(data.fixed ?? []),
      jobIncomes$: of([]),
      subscriptions$: of(data.subs ?? []),
      loadDashboard: jasmine.createSpy('loadDashboard').and.callFake(loadDashboard),
      getLiabilities: jasmine.createSpy('getLiabilities').and.returnValue(of([])),
    } as unknown as FinanceService;
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        { provide: FinanceService, useValue: finance },
        { provide: SESSION_CONTEXT, useValue: { currentUser: { id: 7 } } as unknown as SessionPort },
        provideRouter([]),
      ],
    })
      .overrideComponent(DashboardComponent, {
        remove: { imports: [ChartsComponent] },
        add: { imports: [DashboardChartsStubComponent] },
      })
      .compileComponents();
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    return fixture;
  }

  function createOnly(): ComponentFixture<DashboardComponent> {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    return fixture;
  }

  function text(fixture: ComponentFixture<DashboardComponent>): string {
    // Money formatting inserts a word joiner after the currency symbol.
    return ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/⁠/g, '');
  }

  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date(2026, 9, 20, 12));
    localStorage.clear();
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  it('empty vault shows one card and the checklist, no figures', async () => {
    const fixture = await render({});
    const el = fixture.nativeElement as HTMLElement;
    expect(text(fixture)).toContain('Start with one number');
    expect(text(fixture)).toContain('First steps');
    expect(text(fixture)).toContain('0 of 4 done');
    const addBalance = el.querySelector('a[href="/finance/have"]');
    expect(addBalance?.textContent).toContain('Add a balance');
    const importLink = el.querySelector('a[href="/finance/spending?add=1"]');
    expect(importLink?.textContent).toContain('Import card activity');
    expect(el.querySelector('.home-tile')).toBeNull();
    expect(text(fixture)).not.toContain('Monthly income sources');
    expect(el.querySelector('app-charts')).toBeNull();
    expect(text(fixture)).not.toContain('Hide');
    fixture.destroy();
  });

  it('net worth topline and as-of line', async () => {
    const fixture = await render({ assets: [asset] });
    const tile = (fixture.nativeElement as HTMLElement).querySelector('a.home-tile--balance');
    expect(tile).not.toBeNull();
    expect(tile?.textContent).toContain('Net worth');
    expect(tile?.textContent).toContain('Balances Oct 22');
    expect(text(fixture)).not.toContain('What you have');
    fixture.destroy();
  });

  it('partial tiles become plain cards with one link', async () => {
    const fixture = await render({ subs: [sub('Streaming', 10, '2026-11-15')] });
    const el = fixture.nativeElement as HTMLElement;
    const empty = el.querySelector('div.home-tile--empty');
    expect(empty?.textContent).toContain('No balances yet.');
    expect(empty?.querySelector('a')?.textContent).toContain('Add a balance');
    expect(el.querySelector('a.home-tile--balance')).toBeNull();
    fixture.destroy();
  });

  it('no activity this month', async () => {
    const fixture = await render({ assets: [asset] });
    const el = fixture.nativeElement as HTMLElement;
    expect(text(fixture)).toContain('No activity in October.');
    const link = Array.from(el.querySelectorAll('a')).find(a => a.textContent?.includes('Add a transaction'));
    expect(link?.getAttribute('href')).toContain('date=2026-10-20');
    expect(link?.getAttribute('href')).toContain('add=1');
    fixture.destroy();
  });

  it('due soon lists unposted bills', async () => {
    const fixture = await render({ subs: [sub('Streaming', 15.49, '2026-10-22')] });
    const el = fixture.nativeElement as HTMLElement;
    expect(text(fixture)).toContain('Due soon');
    expect(text(fixture)).toContain('Next 14 days · $15.49');
    const row = el.querySelector('.due-soon__row');
    expect((row?.textContent ?? '').replace(/\s+/g, ' ')).toContain('Thu, Oct 22');
    expect(row?.textContent).toContain('Streaming');
    expect((row?.textContent ?? '').replace(/⁠/g, '')).toContain('$15.49');
    expect(row?.querySelector('.money')?.classList.contains('negative')).toBeFalse();
    fixture.destroy();
  });

  it('due soon empty copy', async () => {
    const fixture = await render({ fixed: [bill('Rent', 5, 1200)] });
    expect(text(fixture)).toContain('No bills due in the next two weeks.');
    fixture.destroy();
  });

  it('due soon caps at five', async () => {
    const fixed = [21, 22, 23, 24, 25, 26, 27].map((day, i) => bill(`Bill ${i + 1}`, day, i + 1));
    const fixture = await render({ fixed });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.due-soon__row').length).toBe(5);
    expect(text(fixture)).toContain('2 more due soon');
    fixture.destroy();
  });

  it('no income card without income rows', async () => {
    const cashflow = {
      total_income: 0,
      total_expenses: 0,
      net_cashflow: 0,
      income_occurrences: [],
    } as unknown as CashflowSummary;
    const fixture = await render({ assets: [asset], cashflow });
    expect(text(fixture)).not.toContain('Monthly income sources');
    expect(text(fixture)).not.toContain('No income sources were recorded');
    fixture.destroy();
  });

  it('first steps hide persists per user', async () => {
    const data: HomeData = { assets: [asset], transactions: [transaction] };
    const fixture = await render(data);
    const el = fixture.nativeElement as HTMLElement;
    expect(text(fixture)).toContain('2 of 4 done');
    const hide = Array.from(el.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Hide');
    hide?.click();
    fixture.detectChanges();
    expect(text(fixture)).not.toContain('First steps');
    expect(localStorage.getItem('finance-home-first-steps-hidden:7')).toBe('1');
    fixture.destroy();

    const again = createOnly();
    expect(text(again)).not.toContain('First steps');
    again.destroy();
  });

  it('first steps disappear when all four are done', async () => {
    const fixture = await render({
      assets: [asset],
      holdings: [holding],
      transactions: [transaction],
      subs: [sub('Streaming', 10, '2026-11-15')],
    });
    expect(text(fixture)).not.toContain('First steps');
    fixture.destroy();
  });

  it('skeleton waits 150 ms', async () => {
    const fixture = await render({}, () => new Subject<unknown>());
    const el = fixture.nativeElement as HTMLElement;
    jasmine.clock().tick(149);
    fixture.detectChanges();
    expect(el.querySelector('.home-skeleton')).toBeNull();
    jasmine.clock().tick(1);
    fixture.detectChanges();
    expect(el.querySelector('.home-skeleton')).not.toBeNull();
    fixture.destroy();
  });

  it('error copy hides the raw message', async () => {
    const fixture = await render({}, () => throwError(() => new Error('HTTP 500 /vault')));
    const el = fixture.nativeElement as HTMLElement;
    expect(text(fixture)).toContain("Couldn't load Home.");
    expect(text(fixture)).toContain('Your data is still in the vault. Try again.');
    expect(text(fixture)).not.toContain('HTTP 500');
    const finance = TestBed.inject(FinanceService) as unknown as { loadDashboard: jasmine.Spy };
    const retry = Array.from(el.querySelectorAll('button')).find(b => b.textContent?.includes('Try again'));
    retry?.click();
    expect(finance.loadDashboard).toHaveBeenCalledWith(true);
    fixture.destroy();
  });
});
