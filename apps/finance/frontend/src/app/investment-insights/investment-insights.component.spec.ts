import { TestBed } from '@angular/core/testing';
import { NetWorth } from '../models/transaction.model';
import { InvestmentInsightsComponent } from './investment-insights.component';

describe('InvestmentInsightsComponent', () => {
  const createComponent = () =>
    TestBed.runInInjectionContext(() => new InvestmentInsightsComponent({} as any, { markForCheck: () => undefined } as any));

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
