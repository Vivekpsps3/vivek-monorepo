import { ChangeDetectorRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { ThemeService } from '@vivek/ui';
import { FinanceService } from '../services/finance.service';
import { ChartsComponent } from './charts.component';

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
  ensureChartCtor: () => Promise<unknown>;
  paintCharts: () => Promise<void>;
  viewReady: boolean;
}

type ChartCtorLike = new (item: never, config: never) => ChartLike;

describe('chart behaviour (F11)', () => {
  let ChartCtor: ChartCtorLike;

  beforeAll(async () => {
    ChartCtor = (await import('chart.js/auto')).default as unknown as ChartCtorLike;
  });

  beforeEach(() => TestBed.configureTestingModule({
    providers: [{ provide: ThemeService, useValue: { theme$: of('light') } }],
  }));

  const internals = (component: ChartsComponent) => component as unknown as ChartsInternals;

  function makeComponent() {
    const router = jasmine.createSpyObj('Router', ['navigate']);
    const component = TestBed.runInInjectionContext(() => new ChartsComponent(
      {} as unknown as FinanceService,
      { markForCheck: () => undefined } as unknown as ChangeDetectorRef,
      router as unknown as Router,
    ));
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
      const component = TestBed.runInInjectionContext(() => new ChartsComponent(
        financeService as unknown as FinanceService,
        { markForCheck: () => undefined } as unknown as ChangeDetectorRef,
        { navigate: () => Promise.resolve(true) } as unknown as Router,
      ));
      component.embedded = true;
      component.ngOnInit();
      component.ngOnDestroy();
      expect(removeSpy).toHaveBeenCalledWith('change', jasmine.any(Function));
    } finally {
      window.matchMedia = original;
    }
  });

  it('does not paint when the chart loader resolves after the view is destroyed', async () => {
    const { component } = makeComponent();
    const chart = internals(component);
    let release!: (value: ChartCtorLike) => void;
    const held = new Promise<ChartCtorLike>(resolve => { release = resolve; });
    spyOn(chart, 'ensureChartCtor').and.returnValue(held);
    const paint = spyOn(chart, 'updatePortfolio');
    chart.viewReady = true;
    const painting = chart.paintCharts();
    component.ngOnDestroy();
    release(ChartCtor);
    await painting;
    expect(paint).not.toHaveBeenCalled();
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

});
