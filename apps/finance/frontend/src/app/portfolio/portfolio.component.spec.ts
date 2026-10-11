import { of } from 'rxjs';
import { Holding } from '../models/transaction.model';
import { PortfolioComponent } from './portfolio.component';

function componentWithFinance(overrides: Record<string, unknown> = {}) {
  const finance = jasmine.createSpyObj('FinanceService', [
    'refreshAllHoldingPrices', 'lookupSharePrice', 'getHoldingImportStages',
    'resumeFidelityImportStage', 'confirmHoldingPosition',
  ]);
  Object.assign(finance, overrides);
  finance.refreshAllHoldingPrices.and.returnValue(of({ holdings: [], updated: 0, failed: 0 }));
  finance.getHoldingImportStages.and.returnValue(of([]));
  finance.resumeFidelityImportStage.and.returnValue(of({ inserted: 1, status: 'activated' }));
  finance.confirmHoldingPosition.and.returnValue(of({}));
  const toast = jasmine.createSpyObj('ToastService', ['success', 'error']);
  const component = new PortfolioComponent(finance, toast, {} as any, { markForCheck: () => {} } as any);
  return { component, finance, toast };
}

describe('PortfolioComponent', () => {
  it('does not request market quotes until the explicit refresh action is invoked', () => {
    const { component, finance } = componentWithFinance();
    expect(finance.lookupSharePrice).not.toHaveBeenCalled();
    component.refreshAllPrices();
    expect(finance.refreshAllHoldingPrices).toHaveBeenCalled();
    expect(finance.lookupSharePrice).not.toHaveBeenCalled();
  });

  it('keeps gains unavailable for unknown basis and labels undated imports', () => {
    const { component } = componentWithFinance();
    const unknown: Holding = {
      id: 1, symbol: 'ABC', shares: 2, purchase_price: null as any, purchase_date: null as any,
      current_price: 125, value: 250, price_source: 'import_market_value', cost_basis_status: 'unknown',
    } as Holding;
    component.holdings = [unknown];
    expect(component.getGain(unknown)).toBeNull();
    expect(component.getTotalGain()).toBeNull();
    expect(component.priceFreshness(unknown)).toBe('Imported');
    expect(component.dateLabel(null)).toBe('Date unknown');
  });

  it('shows the stale quote age while keeping the warning badge state', () => {
    const { component } = componentWithFinance();
    const stale: Holding = {
      id: 2, symbol: 'ABC', shares: 1, purchase_price: 10, current_price: 11, value: 11,
      price_source: 'live_eod', quote_date: '2026-10-07',
    } as Holding;
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date('2026-10-11T12:00:00Z'));
    expect(component.priceFreshness(stale)).toBe('Stale · 4 days old');
    expect(component.priceSourceBadgeVariant(stale)).toBe('warning');
    jasmine.clock().uninstall();
  });

  it('resumes a verified staged Fidelity replacement from the explicit recovery action', () => {
    const { component, finance, toast } = componentWithFinance();
    const stage = {
      id: 77, source: 'fidelity', filename: 'positions.csv', status: 'interrupted',
      account_masks: ['Z1'], expected_row_count: 2, account_replacements: [], created_at: '2026-10-11T00:00:00Z',
    } as any;
    component.resumeFidelityStage(stage);
    expect(finance.resumeFidelityImportStage).toHaveBeenCalledWith(77);
    expect(toast.success).toHaveBeenCalledWith('Activated 1 Fidelity position(s)');
  });

  it('confirms a position date independently of refreshing its price', () => {
    const { component, finance } = componentWithFinance();
    const holding = { id: 9, symbol: 'VOO' } as Holding;
    component.confirmPosition(holding);
    expect(finance.confirmHoldingPosition).toHaveBeenCalledWith(9, jasmine.any(String));
    expect(finance.refreshAllHoldingPrices).not.toHaveBeenCalled();
  });
});
