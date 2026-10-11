import { ElementRef } from '@angular/core';
import { InvestmentInsightsComponent } from './investment-insights.component';

describe('InvestmentInsightsComponent', () => {
  const createComponent = () =>
    new InvestmentInsightsComponent({} as any, { markForCheck: () => undefined } as any);

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
