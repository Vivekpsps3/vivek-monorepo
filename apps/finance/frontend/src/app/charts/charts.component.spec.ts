import { ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { ChartsComponent } from './charts.component';
import { FinanceService } from '../services/finance.service';
import { cssVar } from '../utils/chart-options';

describe('ChartsComponent', () => {
  it('uses the full ledger for category totals and applies transaction kinds', () => {
    const fullLedger = [
      { id: 1, date: '2026-08-02', type: 'expense', category: 'Food', amount: 100, kind: 'purchase' },
      { id: 2, date: '2026-08-03', type: 'expense', category: 'Food', amount: 10, kind: 'refund' },
      { id: 3, date: '2026-08-04', type: 'expense', category: 'Transfer', amount: 50, kind: 'transfer' },
    ] as any;
    const financeService = {
      transactions$: of([{ id: 99, date: '2026-08-01', type: 'expense', category: 'Paged only', amount: 1 }]),
      holdings$: of([]),
      jobIncomes$: of([]),
      fixedExpenses$: of([]),
      subscriptions$: of([]),
      getAllTransactions: jasmine.createSpy().and.returnValue(of(fullLedger)),
    };
    const cdr = { markForCheck: jasmine.createSpy() };
    const router = jasmine.createSpyObj('Router', ['navigate']);
    const component = new ChartsComponent(financeService as any, cdr as any, router as any);
    component.embedded = true;

    component.ngOnInit();

    expect(financeService.getAllTransactions).toHaveBeenCalled();
    expect(component.allCategoryRows).toEqual([{ label: 'Food', value: 90, pct: 100 }]);
    expect(component.allCategoryRows.some(row => row.label === 'Paged only')).toBeFalse();
    component.ngOnDestroy();
  });

  it('keeps refund-only category effects signed and uses net total percentages', () => {
    const component = new ChartsComponent({} as any, { markForCheck: () => {} } as any, { navigate: () => Promise.resolve(true) } as any);
    (component as any).txOverride = [
      { id: 1, date: '2026-08-02', type: 'expense', category: 'Dining', amount: 25, kind: 'purchase' },
      { id: 2, date: '2026-08-03', type: 'expense', category: 'Returned item', amount: 10, kind: 'refund' },
    ];
    (component as any).computeDerived();

    expect(component.allCategoryRows.length).toBe(2);
    const byCategory = new Map(component.allCategoryRows.map(row => [row.label, row]));
    expect(byCategory.get('Returned item')?.value).toBe(-10);
    expect(byCategory.get('Dining')?.value).toBe(25);
    expect(component.allCategoryRows.reduce((sum, row) => sum + (row.pct || 0), 0)).toBeCloseTo(100);
    expect(byCategory.get('Returned item')?.pct).toBeCloseTo(-66.6667, 3);
    expect(byCategory.get('Dining')?.pct).toBeCloseTo(166.6667, 3);
  });

  it('marks percentages unavailable when recorded category totals are non-positive', () => {
    const component = new ChartsComponent({} as any, { markForCheck: () => {} } as any, { navigate: () => Promise.resolve(true) } as any);
    (component as any).txOverride = [
      { id: 1, date: '2026-08-02', type: 'expense', category: 'Returned item', amount: 10, kind: 'refund' },
    ];
    (component as any).computeDerived();
    expect(component.allCategoryRows).toEqual([{ label: 'Returned item', value: -10, pct: null }]);
  });

  it('drills chart points into Activity', () => {
    const router = jasmine.createSpyObj('Router', ['navigate']);
    const component = new ChartsComponent({} as any, { markForCheck: () => {} } as any, router as any);
    component.monthlyRows = [{ month: '2026-09', label: 'September 2026', tick: 'Sep', income: 20, expense: 12, net: 8 }];

    component.openMonthlyDrilldown(0, 1);
    expect(router.navigate.calls.mostRecent().args).toEqual([
      ['/finance/spending'], { queryParams: { t: null, v: 'spending', month: '2026-09' } },
    ]);
    expect(component.monthlyRowQuery(component.monthlyRows[0], 0)).toEqual({
      t: null, v: 'income', month: '2026-09',
    });
    expect(component.monthlyRowQuery(component.monthlyRows[0], 1)).toEqual({
      t: null, v: 'spending', month: '2026-09',
    });
  });

  it('keeps a real Other category drillable while the synthetic Other tail only expands', () => {
    const router = jasmine.createSpyObj('Router', ['navigate']);
    const component = new ChartsComponent({} as any, { markForCheck: () => {} } as any, router as any);
    component.allCategoryRows = [
      { label: 'Other', value: 100, pct: 40 },
      ...['A', 'B', 'C', 'D', 'E', 'F'].map((label, index) => ({ label, value: 50 - index, pct: 10 })),
    ];
    const rows = component.categoryRows;
    expect(rows[0].label).toBe('Other');
    expect(rows[6]).toEqual(jasmine.objectContaining({ label: 'Other', synthetic: true }));
    component.openCategoryDrilldown(0);
    expect(router.navigate.calls.mostRecent().args).toEqual([
      ['/finance/spending'], { queryParams: { t: null, v: 'spending', month: 'all', category: 'Other' } },
    ]);
    router.navigate.calls.reset();
    component.openCategoryDrilldown(6);
    expect(component.collapsedCategories).toBeFalse();
    expect(router.navigate).not.toHaveBeenCalled();
  });
});

interface ChartLike {
  config: {
    data: { datasets: Array<{ label?: string; tension?: number; pointRadius?: number; order?: number; backgroundColor?: string }> };
    options: {
      animation?: unknown;
      plugins: {
        legend: { display?: boolean };
        tooltip: {
          enabled?: boolean;
          backgroundColor?: string;
          displayColors?: boolean;
          callbacks?: {
            title?: (items: Array<{ dataIndex: number }>) => string;
            label?: (item: { dataIndex: number; datasetIndex: number }) => string;
          };
          filter?: (item: { dataIndex: number; datasetIndex: number }) => boolean;
        };
      };
      scales?: { x: { ticks: { maxTicksLimit?: number } } };
    };
  };
  destroy: () => void;
  setDatasetVisibility?: (index: number, visible: boolean) => void;
  update?: () => void;
}

interface ChartsInternals {
  incomeChart?: ChartLike;
  categoryChart?: ChartLike;
  portfolioChart?: ChartLike;
  incomeExpenseCanvas: { nativeElement: HTMLCanvasElement };
  categoryCanvas: { nativeElement: HTMLCanvasElement };
  portfolioCanvas: { nativeElement: HTMLCanvasElement };
  updateIncomeExpense: (chart: unknown) => void;
  updateCategorySpending: (chart: unknown) => void;
  updatePortfolio: (chart: unknown) => void;
}

type ChartCtorLike = new (item: never, config: never) => ChartLike;

describe('chart behaviour (F11)', () => {
  let ChartCtor: ChartCtorLike;

  beforeAll(async () => {
    ChartCtor = (await import('chart.js/auto')).default as unknown as ChartCtorLike;
  });

  const stripJoiner = (text: string) => text.replace(/⁠/g, '');
  const internals = (component: ChartsComponent) => component as unknown as ChartsInternals;

  function makeComponent() {
    const router = jasmine.createSpyObj('Router', ['navigate']);
    const component = new ChartsComponent(
      {} as unknown as FinanceService,
      { markForCheck: () => undefined } as unknown as ChangeDetectorRef,
      router as unknown as Router,
    );
    return { component, router };
  }

  function canvasRef() {
    return { nativeElement: document.createElement('canvas') };
  }

  const cashflowRows = () => ([
    { month: '2026-05', label: 'May 2026', tick: 'May', income: 3000, expense: 0, net: 3000 },
    { month: '2026-06', label: 'June 2026', tick: 'Jun', income: 0, expense: 0, net: 0 },
    { month: '2026-10', label: 'October 2026', tick: 'Oct', income: 5000, expense: 59, net: 4941 },
  ]);

  function paintIncome(component: ChartsComponent): ChartLike {
    component.monthlyRows = cashflowRows();
    internals(component).incomeExpenseCanvas = canvasRef();
    internals(component).updateIncomeExpense(ChartCtor);
    return internals(component).incomeChart as ChartLike;
  }

  it('net dataset label Net, tension 0, pointRadius 4, order 0', () => {
    const { component } = makeComponent();
    const chart = paintIncome(component);
    const net = chart.config.data.datasets[2];
    expect(net.label).toBe('Net');
    expect(net.tension).toBe(0);
    expect(net.pointRadius).toBe(4);
    expect(net.order).toBe(0);
    chart.destroy();
  });

  it('spending bar colour has 0.8 alpha', () => {
    const { component } = makeComponent();
    const chart = paintIncome(component);
    expect(chart.config.data.datasets[1].backgroundColor).toContain('0.8');
    chart.destroy();
  });

  it('legend display false on all charts', () => {
    const { component } = makeComponent();
    const income = paintIncome(component);
    component.allCategoryRows = [
      { label: 'Food and Drink', value: 17.25, pct: 29 },
      { label: 'Shopping', value: 41.75, pct: 71 },
    ];
    internals(component).categoryCanvas = canvasRef();
    internals(component).updateCategorySpending(ChartCtor);
    component.allocationRows = [
      { label: 'VOO', value: 700.86, pct: 60 },
      { label: 'BND', value: 467.24, pct: 40 },
    ];
    component.tableOpen.allocation = false;
    internals(component).portfolioCanvas = canvasRef();
    internals(component).updatePortfolio(ChartCtor);
    const charts = [income, internals(component).categoryChart, internals(component).portfolioChart];
    for (const chart of charts) {
      expect(chart?.config.options.plugins.legend.display).toBe(false);
      chart?.destroy();
    }
  });

  it('tooltip enabled with financeTooltip colours', () => {
    const { component } = makeComponent();
    const chart = paintIncome(component);
    const tooltip = chart.config.options.plugins.tooltip;
    expect(tooltip.enabled).toBe(true);
    expect(tooltip.backgroundColor).toBe(cssVar('--text', '#111'));
    expect(tooltip.displayColors).toBe(false);
    chart.destroy();
  });

  it('cashflow tooltip title/label/filter for data and empty months', () => {
    const { component } = makeComponent();
    const chart = paintIncome(component);
    const callbacks = chart.config.options.plugins.tooltip.callbacks;
    expect(callbacks?.title?.([{ dataIndex: 2 }])).toBe('October 2026');
    expect(stripJoiner(callbacks?.label?.({ dataIndex: 2, datasetIndex: 0 }) ?? '')).toBe('Income $5,000.00');
    expect(stripJoiner(callbacks?.label?.({ dataIndex: 2, datasetIndex: 1 }) ?? '')).toBe('Spending $59.00');
    expect(stripJoiner(callbacks?.label?.({ dataIndex: 2, datasetIndex: 2 }) ?? '')).toBe('Net +$4,941.00');
    expect(callbacks?.label?.({ dataIndex: 1, datasetIndex: 0 })).toBe('No activity');
    const filter = chart.config.options.plugins.tooltip.filter;
    expect(filter?.({ dataIndex: 1, datasetIndex: 0 })).toBe(true);
    expect(filter?.({ dataIndex: 1, datasetIndex: 1 })).toBe(false);
    expect(filter?.({ dataIndex: 2, datasetIndex: 1 })).toBe(true);
    chart.destroy();
  });

  it('category tooltip names the share of purchases', () => {
    const { component } = makeComponent();
    component.allCategoryRows = [
      { label: 'Food and Drink', value: 17.25, pct: 100 },
      { label: 'Returns', value: -5, pct: null },
    ];
    internals(component).categoryCanvas = canvasRef();
    internals(component).updateCategorySpending(ChartCtor);
    const chart = internals(component).categoryChart as ChartLike;
    const label = chart.config.options.plugins.tooltip.callbacks?.label;
    expect(stripJoiner(label?.({ dataIndex: 0, datasetIndex: 0 }) ?? '')).toBe('Food and Drink · $17.25 · 100.0% of purchases');
    chart.destroy();
  });

  it('cashflowSummary text', () => {
    const { component } = makeComponent();
    component.monthlyRows = cashflowRows();
    expect(stripJoiner(component.cashflowSummary))
      .toBe('Monthly cashflow, May to October 2026. Net highest in October, +$4,941.00.');
  });

  it('single holding → stat row, no portfolio chart created', () => {
    const { component } = makeComponent();
    component.allocationRows = [{ label: 'VOO', value: 700.86, pct: 100 }];
    expect(component.singleHolding?.label).toBe('VOO');
    internals(component).portfolioCanvas = canvasRef();
    internals(component).updatePortfolio(ChartCtor);
    expect(internals(component).portfolioChart).toBeUndefined();
  });

  it('toggleTable writes pref and hides canvas', () => {
    const { component } = makeComponent();
    const chart = paintIncome(component);
    expect(chart).toBeTruthy();
    component.toggleTable('cashflow');
    expect(localStorage.getItem('finance.chartTable.cashflow')).toBe('1');
    internals(component).updateIncomeExpense(ChartCtor);
    expect(internals(component).incomeChart).toBeUndefined();
    localStorage.removeItem('finance.chartTable.cashflow');
  });

  it('toggleSeries calls setDatasetVisibility', () => {
    const { component } = makeComponent();
    const fake: ChartLike = {
      config: { data: { datasets: [] }, options: { plugins: { legend: {}, tooltip: {} } } },
      destroy: () => undefined,
      setDatasetVisibility: jasmine.createSpy('setDatasetVisibility'),
      update: jasmine.createSpy('update'),
    };
    internals(component).incomeChart = fake;
    component.toggleSeries(2);
    expect(component.hiddenSeries[2]).toBe(true);
    expect(fake.setDatasetVisibility).toHaveBeenCalledWith(2, false);
    expect(fake.update).toHaveBeenCalled();
  });

  it('ngOnDestroy removes the matchMedia listener', () => {
    const original = window.matchMedia;
    const removeSpy = jasmine.createSpy('removeEventListener');
    window.matchMedia = ((query: string) => ({
      matches: false, media: query,
      addEventListener: () => undefined, removeEventListener: removeSpy,
      addListener: () => undefined, removeListener: () => undefined,
      dispatchEvent: () => false, onchange: null,
    })) as unknown as typeof window.matchMedia;
    try {
      const financeService = {
        holdings$: of([]), jobIncomes$: of([]), fixedExpenses$: of([]), subscriptions$: of([]),
        getAllTransactions: () => of([]),
      };
      const component = new ChartsComponent(
        financeService as unknown as FinanceService,
        { markForCheck: () => undefined } as unknown as ChangeDetectorRef,
        { navigate: () => Promise.resolve(true) } as unknown as Router,
      );
      component.embedded = true;
      component.ngOnInit();
      component.ngOnDestroy();
      expect(removeSpy).toHaveBeenCalledWith('change', jasmine.any(Function));
    } finally {
      window.matchMedia = original;
    }
  });

  function stubMatchMedia(matches: (query: string) => boolean) {
    window.matchMedia = ((query: string) => ({
      matches: matches(query), media: query,
      addEventListener: () => undefined, removeEventListener: () => undefined,
      addListener: () => undefined, removeListener: () => undefined,
      dispatchEvent: () => false, onchange: null,
    })) as unknown as typeof window.matchMedia;
  }

  it('maxTicksLimit 4 when matchMedia(max-width: 640px) matches, else 12', () => {
    const original = window.matchMedia;
    let narrow = true;
    stubMatchMedia(query => (query === '(max-width: 640px)' ? narrow : false));
    try {
      const { component } = makeComponent();
      const chart = paintIncome(component);
      expect(chart.config.options.scales?.x.ticks.maxTicksLimit).toBe(4);
      narrow = false;
      internals(component).updateIncomeExpense(ChartCtor);
      expect(chart.config.options.scales?.x.ticks.maxTicksLimit).toBe(12);
      chart.destroy();
    } finally {
      window.matchMedia = original;
    }
  });

  it('animation false when prefers-reduced-motion matches', () => {
    const original = window.matchMedia;
    stubMatchMedia(query => query === '(prefers-reduced-motion: reduce)');
    try {
      const { component } = makeComponent();
      const chart = paintIncome(component);
      expect(chart.config.options.animation).toBe(false);
      chart.destroy();
    } finally {
      window.matchMedia = original;
    }
  });

  it('tooltip backgroundColor equals computed --text', () => {
    document.documentElement.style.setProperty('--text', '#123456');
    try {
      const { component } = makeComponent();
      const chart = paintIncome(component);
      expect(chart.config.options.plugins.tooltip.backgroundColor).toBe('#123456');
      chart.destroy();
    } finally {
      document.documentElement.style.removeProperty('--text');
    }
  });

  it('onChartTap: mouse drills on first click; touch needs two taps on the same key', () => {
    const { component } = makeComponent();
    component.monthlyRows = cashflowRows();
    spyOn(component, 'openMonthlyDrilldown');
    const tap = (pointerType: string) => component.onChartTap('cashflow', 0, 1, {
      native: { pointerType } as unknown as Event,
    });
    tap('mouse');
    expect(component.openMonthlyDrilldown).toHaveBeenCalledWith(0, 1);
    (component.openMonthlyDrilldown as jasmine.Spy).calls.reset();
    tap('touch');
    expect(component.openMonthlyDrilldown).not.toHaveBeenCalled();
    tap('touch');
    expect(component.openMonthlyDrilldown).toHaveBeenCalledWith(0, 1);
  });
});
