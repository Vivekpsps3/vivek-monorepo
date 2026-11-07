import { ChangeDetectorRef, ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { FinanceService } from '../services/finance.service';
import { InvestmentInsightsComponent } from './investment-insights.component';

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
