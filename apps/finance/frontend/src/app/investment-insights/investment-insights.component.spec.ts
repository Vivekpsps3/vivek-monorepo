import { ChangeDetectorRef, ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { FinanceService } from '../services/finance.service';
import { InvestmentInsightsComponent } from './investment-insights.component';
import { NetWorth } from '../models/transaction.model';

describe('InvestmentInsightsComponent', () => {
  const createComponent = () =>
    TestBed.runInInjectionContext(() => new InvestmentInsightsComponent({} as any, { markForCheck: () => undefined } as any));

  it('uses 7% annual growth initially and after reset', () => {
    const component = createComponent();

    expect(component.annualGrowthRate).toBe(7);
    component.annualGrowthRate = 12;
    component.resetAssumptions();
    expect(component.annualGrowthRate).toBe(7);
  });

  it('compares a contribution increase with the same starting value, return, and horizon', () => {
    const component = createComponent();
    component.netWorth = { portfolio: 10_000 } as any;
    component.annualGrowthRate = 0;
    component.projectionYears = 1;
    component.monthlyContribution = 500;
    component.monthlyContributionIncrease = 150;

    expect(component.projectedValue).toBe(16_000);
    expect(component.scenarioMonthlyContribution).toBe(650);
    expect(component.scenarioProjectedValue).toBe(17_800);
    expect(component.contributionScenarioDifference).toBe(1_800);
  });

  it('renders when the conditional projection canvas is attached', () => {
    const component = createComponent();
    const render = spyOn<any>(component, 'renderProjectionChart');

    component.projectionChartCanvas = new ElementRef(document.createElement('canvas'));

    expect(render).toHaveBeenCalled();
  });

  it('leads with the answer in plain words (F20)', () => {
    const component = createComponent();
    component.netWorth = { portfolio: 700.86 } as unknown as NetWorth;

    // Money formatting inserts a word joiner after the currency symbol.
    // Note: the issue's table says $5,688; the (unchanged) projection
    // engine computes 5688.53, which whole-dollar formatting rounds to
    // $5,689 — asserted as the engine actually renders it.
    expect(component.answerTitle.replace(/⁠/g, '')).toBe('About $5,689 in 30 years');
    expect(component.answerDetail.replace(/⁠/g, '')).toBe('Starting from $700.86 · 7% a year · $0.00 a month');
    expect(component.projectionSummary).toContain("in today's dollars");
  });

  it('yearRows cover every projected year after year zero (F20)', () => {
    const component = createComponent();
    component.netWorth = { portfolio: 700.86 } as unknown as NetWorth;

    expect(component.yearRows.length).toBe(component.projectionYears);
    expect(component.yearRows[0].year).toBe(1);
    expect(component.yearRows.at(-1)?.value).toBeCloseTo(component.projectedValue, 6);
  });

  it('legend toggles hide series and the table choice persists (F20)', () => {
    const component = createComponent();
    component.netWorth = { portfolio: 700.86 } as unknown as NetWorth;
    localStorage.removeItem('finance.chartTable.projection');

    expect(component.legendItems.map(item => item.label)).toEqual(['Projected value', "In today's dollars"]);
    component.toggleSeries('Projected value');
    expect(component.legendItems[0].hidden).toBeTrue();
    component.toggleSeries('Projected value');
    expect(component.legendItems[0].hidden).toBeFalse();

    expect(component.isCustomGrowth).toBeFalse();
    component.annualGrowthRate = 6;
    expect(component.isCustomGrowth).toBeTrue();

    component.toggleTable();
    expect(component.tableOpen).toBeTrue();
    expect(localStorage.getItem('finance.chartTable.projection')).toBe('1');
    component.toggleTable();
    expect(localStorage.getItem('finance.chartTable.projection')).toBe('0');
  });
});

describe('empty states (F10)', () => {
  it('addHolding navigates to Have with the holdings tab', () => {
    const router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    router.navigate.and.resolveTo(true);
    TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: router }] });
    const component = TestBed.runInInjectionContext(() => new InvestmentInsightsComponent(
      {} as unknown as FinanceService,
      { markForCheck: () => undefined } as unknown as ChangeDetectorRef,
    ));
    component.addHolding();
    expect(router.navigate).toHaveBeenCalledWith(['/finance/have'], { queryParams: { t: 'holdings' } });
  });
});
