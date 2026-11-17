import { ConfirmService } from '@vivek/ui';
import { of,throwError } from 'rxjs';
import { Holding } from '../models/transaction.model';
import { MarketRefreshCoordinatorService,MarketRefreshState } from '../services/market-refresh-coordinator.service';
import { buildFidelityImportPreview } from '../utils/fidelity-import.util';
import { PortfolioComponent } from './portfolio.component';

function componentWithFinance(overrides: Record<string, unknown> = {}) {
  const finance = jasmine.createSpyObj('FinanceService', [
    'refreshAllHoldingPrices', 'lookupSharePrice', 'getHoldingImportStages', 'getHoldings',
    'resumeFidelityImportStage',
    'previewFidelityImport', 'getBrokerageAccounts', 'commitFidelityImport', 'getBrokerageImports',
  ]);
  Object.assign(finance, overrides);
  finance.refreshAllHoldingPrices.and.returnValue(of({ holdings: [], updated: 0, failed: 0 }));
  finance.getHoldingImportStages.and.returnValue(of([]));
  finance.getHoldings.and.returnValue(of([]));
  finance.resumeFidelityImportStage.and.returnValue(of({ inserted: 1, status: 'activated' }));
  finance.getBrokerageAccounts.and.returnValue(of([]));
  finance.getBrokerageImports.and.returnValue(of([]));
  const market = jasmine.createSpyObj<MarketRefreshCoordinatorService>('MarketRefreshCoordinatorService', ['refreshNow', 'refreshSymbol']);
  const idle: MarketRefreshState = {
    phase: 'idle', automatic: false, totalSymbols: 0, completedSymbols: 0,
    updatedHoldings: 0, updatedEmployerValuations: 0, failures: [], startedAt: null, finishedAt: null,
  };
  (market as any).status$ = of(idle);
  market.refreshNow.and.resolveTo({ ...idle, phase: 'complete' });
  market.refreshSymbol.and.resolveTo({ symbol: 'VOO', holdingsUpdated: 1, employerValuationsUpdated: 0, failedRecords: [] });
  const toast = jasmine.createSpyObj('ToastService', ['success', 'error']);
  const confirm = jasmine.createSpyObj<ConfirmService>('ConfirmService', ['ask']);
  confirm.ask.and.resolveTo(true);
  const component = new PortfolioComponent(finance, market, toast, confirm, { markForCheck: () => {} } as any);
  return { component, finance, market, toast, confirm };
}

describe('PortfolioComponent', () => {

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

  it('shows one retry toast when undoing a holding delete fails and keeps the record', async () => {
    const { component, finance, toast } = componentWithFinance();
    finance.deleteHolding = jasmine.createSpy('deleteHolding').and.returnValue(of({ ok: true }));
    finance.addHolding = jasmine.createSpy('addHolding').and.returnValue(throwError(() => new Error('nope')));
    const holding = {
      id: 9, symbol: 'ABC', shares: 2, purchase_price: 0.12345, purchase_date: '2026-01-15',
    } as Holding;
    await component.deleteHolding(holding);
    const undo = toast.success.calls.mostRecent().args[1] as () => void;
    undo();
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error.calls.mostRecent().args[0]).toBe("Couldn't restore this holding.");
    expect(toast.error.calls.mostRecent().args[1].label).toBe('Try again');
    expect(finance.addHolding).toHaveBeenCalledWith(jasmine.objectContaining({
      symbol: 'ABC', shares: 2, purchase_price: 0.12345, purchase_date: '2026-01-15',
    }), true);
    const retry = toast.error.calls.mostRecent().args[1].run as () => void;
    finance.addHolding.calls.reset();
    toast.error.calls.reset();
    retry();
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(finance.addHolding.calls.mostRecent().args[0].purchase_price).toBe(0.12345);
  });

  it('resumes a verified staged Fidelity replacement from the explicit recovery action', () => {
    const { component, finance, toast } = componentWithFinance();
    const stage = {
      id: 77, source: 'fidelity', filename: 'positions.csv', status: 'interrupted',
      account_masks: ['Z1'], expected_row_count: 2, account_replacements: [], created_at: '2026-10-11T00:00:00Z',
    } as any;
    component.resumeFidelityStage(stage);
    expect(finance.resumeFidelityImportStage).toHaveBeenCalledWith(77);
    expect(toast.success).toHaveBeenCalledWith('Imported 1 Fidelity position');
  });

  describe('Fidelity import', () => {
    const csv = 'Account Number,Symbol,Quantity,Last Price,Current Value\nZ123,TEST1,10,100,1000\nZ123,TEST2,5,50,250';
    const account = { id: 30, broker_slug: 'fidelity', broker_name: 'Fidelity', account_mask: 'Z123' };

    it('asks with Replace and the scoped body, then reports the imported count', async () => {
      const { component, finance, confirm, toast } = componentWithFinance();
      component.holdings = [{ id: 1, symbol: 'OLD', brokerage_account_id: 30 } as Holding];
      component.fidelityImportFile = new File([csv], 'positions.csv');
      const preview = buildFidelityImportPreview('positions.csv', csv);
      finance.previewFidelityImport.and.returnValue(of(preview));
      finance.getBrokerageAccounts.and.returnValue(of([account]));
      finance.commitFidelityImport.and.returnValue(of({ inserted: 2, holdings_replaced: 1, accounts_replaced: 1, accounts: [] }));
      component.runFidelityPreview();
      await component.commitFidelityImport();
      expect(confirm.ask).toHaveBeenCalledWith('Replace Fidelity holdings?',
        '2 positions replace your 1 Fidelity holding. Manual holdings stay.', 'Replace', 'Cancel');
      expect(finance.commitFidelityImport).toHaveBeenCalledWith('positions.csv', preview.rows, ['Z123']);
      expect(toast.success).toHaveBeenCalledWith('Imported 2 Fidelity positions');
    });

    it('does not commit when the confirmation is cancelled', async () => {
      const { component, finance, confirm } = componentWithFinance();
      component.fidelityImportFile = new File([csv], 'positions.csv');
      component.fidelityImportPreview = buildFidelityImportPreview('positions.csv', csv);
      component.selectedFidelityAccounts.add('Z123');
      confirm.ask.and.resolveTo(false);
      await component.commitFidelityImport();
      expect(finance.commitFidelityImport).not.toHaveBeenCalled();
      expect(component.fidelityImportPreview).not.toBeNull();
    });
  });
});


describe('PortfolioComponent row copy (F16)', () => {

  it('delete asks with the symbol and toasts it back with undo', async () => {
    const { component, finance, toast, confirm } = componentWithFinance();
    finance.deleteHolding = jasmine.createSpy('deleteHolding').and.returnValue(of({}));
    const holding = {
      id: 9, symbol: 'VOO', shares: 2, purchase_price: 100, purchase_date: '2026-01-15',
    } as Holding;
    await component.deleteHolding(holding);
    expect(confirm.ask).toHaveBeenCalledWith(
      'Delete VOO?',
      'This removes it from your portfolio. You can undo right after.',
      'Delete',
      'Cancel',
    );
    expect(toast.success).toHaveBeenCalledWith('VOO deleted', jasmine.any(Function));
  });
});
