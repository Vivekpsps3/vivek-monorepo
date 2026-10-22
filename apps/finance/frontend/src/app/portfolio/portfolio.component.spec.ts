import { of, throwError } from 'rxjs';
import { Holding } from '../models/transaction.model';
import { PortfolioComponent } from './portfolio.component';
import { MarketRefreshState, MarketRefreshCoordinatorService } from '../services/market-refresh-coordinator.service';

function componentWithFinance(overrides: Record<string, unknown> = {}) {
  const finance = jasmine.createSpyObj('FinanceService', [
    'refreshAllHoldingPrices', 'lookupSharePrice', 'getHoldingImportStages', 'getHoldings', 'getNetWorth',
    'resumeFidelityImportStage',
  ]);
  Object.assign(finance, overrides);
  finance.refreshAllHoldingPrices.and.returnValue(of({ holdings: [], updated: 0, failed: 0 }));
  finance.getHoldingImportStages.and.returnValue(of([]));
  finance.getHoldings.and.returnValue(of([]));
  finance.getNetWorth.and.returnValue(of(null));
  finance.resumeFidelityImportStage.and.returnValue(of({ inserted: 1, status: 'activated' }));
  const market = jasmine.createSpyObj<MarketRefreshCoordinatorService>('MarketRefreshCoordinatorService', ['refreshNow', 'refreshSymbol']);
  const idle: MarketRefreshState = {
    phase: 'idle', automatic: false, totalSymbols: 0, completedSymbols: 0,
    updatedHoldings: 0, updatedEmployerValuations: 0, failures: [], startedAt: null, finishedAt: null,
  };
  (market as any).status$ = of(idle);
  market.refreshNow.and.resolveTo({ ...idle, phase: 'complete' });
  market.refreshSymbol.and.resolveTo({ symbol: 'VOO', holdingsUpdated: 1, employerValuationsUpdated: 0, failedRecords: [] });
  const toast = jasmine.createSpyObj('ToastService', ['success', 'error']);
  const component = new PortfolioComponent(finance, market, toast, {} as any, { markForCheck: () => {} } as any);
  return { component, finance, market, toast };
}

describe('PortfolioComponent', () => {
  it('routes explicit price refresh through the shared coordinator', async () => {
    const { component, finance, market } = componentWithFinance();
    expect(finance.lookupSharePrice).not.toHaveBeenCalled();
    component.refreshAllPrices();
    await Promise.resolve();
    expect(market.refreshNow).toHaveBeenCalled();
    expect(finance.refreshAllHoldingPrices).not.toHaveBeenCalled();
    expect(finance.lookupSharePrice).not.toHaveBeenCalled();
  });

  it('shows a load error instead of the empty-vault state when holdings fail to load', () => {
    const { component, finance } = componentWithFinance();
    finance.holdings$ = of([]);
    finance.netWorth$ = of(null);
    finance.isLoading$ = of(false);
    finance.getHoldings.and.returnValue(throwError(() => new Error('vault request failed')));
    component.ngOnInit();
    expect(component.holdingsLoadError).toContain('vault request failed');
    expect(component.loading).toBeFalse();
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
    expect(component.dateLabel(null)).toBe('No date');
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
    expect(toast.success).toHaveBeenCalledWith('Activated 1 Fidelity position');
  });

});
