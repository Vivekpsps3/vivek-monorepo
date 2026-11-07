import { of, throwError } from 'rxjs';
import { ConfirmService } from '@vivek/ui';
import { Holding } from '../models/transaction.model';
import { PortfolioComponent } from './portfolio.component';
import { MarketRefreshState, MarketRefreshCoordinatorService } from '../services/market-refresh-coordinator.service';
import { buildFidelityImportPreview } from '../utils/fidelity-import.util';

function componentWithFinance(overrides: Record<string, unknown> = {}) {
  const finance = jasmine.createSpyObj('FinanceService', [
    'refreshAllHoldingPrices', 'lookupSharePrice', 'getHoldingImportStages', 'getHoldings', 'getNetWorth',
    'resumeFidelityImportStage',
    'previewFidelityImport', 'getBrokerageAccounts', 'commitFidelityImport', 'getBrokerageImports',
  ]);
  Object.assign(finance, overrides);
  finance.refreshAllHoldingPrices.and.returnValue(of({ holdings: [], updated: 0, failed: 0 }));
  finance.getHoldingImportStages.and.returnValue(of([]));
  finance.getHoldings.and.returnValue(of([]));
  finance.getNetWorth.and.returnValue(of(null));
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
  it('routes explicit price refresh through the shared coordinator', async () => {
    const { component, finance, market } = componentWithFinance();
    expect(finance.lookupSharePrice).not.toHaveBeenCalled();
    component.refreshAllPrices();
    await Promise.resolve();
    expect(market.refreshNow).toHaveBeenCalled();
    expect(finance.refreshAllHoldingPrices).not.toHaveBeenCalled();
    expect(finance.lookupSharePrice).not.toHaveBeenCalled();
  });

  it('rejects a price-check quote dated the day after the Los Angeles day during the Los Angeles evening', () => {
    // Monday 2026-10-12 17:30 in Los Angeles: Los Angeles is on 2026-10-12
    // while UTC is already on 2026-10-13, so a quote dated 2026-10-13 is a
    // future trading date even though it matches the UTC day.
    const { component, finance, toast } = componentWithFinance();
    finance.lookupSharePrice.and.returnValue(of({
      symbol: 'AAPL', price: 125, price_source: 'live_eod', quote_date: '2026-10-13', valid: true,
    }));
    component.newHolding.symbol = 'AAPL';
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date('2026-10-12T17:30:00-07:00'));
    try {
      component.checkSharePrice();
    } finally {
      jasmine.clock().uninstall();
    }
    expect(toast.error).toHaveBeenCalledWith(jasmine.stringContaining('invalid quote'));
    expect(component.newHolding.purchase_price).toBe(0);
  });

  it('accepts a price-check quote dated the Los Angeles day during the Los Angeles evening', () => {
    const { component, finance, toast } = componentWithFinance();
    finance.lookupSharePrice.and.returnValue(of({
      symbol: 'AAPL', price: 125, price_source: 'live_eod', quote_date: '2026-10-12', valid: true,
    }));
    component.newHolding.symbol = 'AAPL';
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date('2026-10-12T17:30:00-07:00'));
    try {
      component.checkSharePrice();
    } finally {
      jasmine.clock().uninstall();
    }
    expect(toast.error).not.toHaveBeenCalled();
    expect(component.newHolding.purchase_price).toBe(125);
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

  it('keeps a stored 0.1234 unit price when the field was not edited', () => {
    const { component, finance } = componentWithFinance();
    finance.updateHolding = jasmine.createSpy('updateHolding').and.returnValue(of({}));
    component.editHolding({
      id: 9,
      symbol: 'ABC',
      shares: 1000,
      purchase_price: 0.1234,
      purchase_date: '2026-01-15',
    } as Holding);
    component.addOrUpdateHolding();
    expect(finance.updateHolding).toHaveBeenCalled();
    expect(finance.updateHolding.calls.mostRecent().args[1].purchase_price).toBe(0.1234);
    expect(component.holdingSaveError).toBe('');
  });

  it('keeps a stored price with more than 4 decimal places when only shares change', () => {
    const { component, finance } = componentWithFinance();
    finance.updateHolding = jasmine.createSpy('updateHolding').and.returnValue(of({}));
    component.editHolding({
      id: 9,
      symbol: 'ABC',
      shares: 1000,
      purchase_price: 0.12345,
      purchase_date: '2026-01-15',
    } as Holding);
    component.newHolding.shares = 1001;
    component.addOrUpdateHolding();
    expect(finance.updateHolding).toHaveBeenCalled();
    expect(finance.updateHolding.calls.mostRecent().args[1].purchase_price).toBe(0.12345);
    expect(finance.updateHolding.calls.mostRecent().args[1].shares).toBe(1001);
    expect(component.holdingSaveError).toBe('');
    expect(component.holdingErrors).toEqual([]);
  });

  it('keeps four decimal places when the unit price was edited', () => {
    const { component, finance } = componentWithFinance();
    finance.updateHolding = jasmine.createSpy('updateHolding').and.returnValue(of({}));
    component.editHolding({
      id: 9,
      symbol: 'ABC',
      shares: 1000,
      purchase_price: 0.1234,
      purchase_date: '2026-01-15',
    } as Holding);
    component.markPurchasePriceDirty();
    component.newHolding.purchase_price = 0.1234;
    component.addOrUpdateHolding();
    expect(finance.updateHolding.calls.mostRecent().args[1].purchase_price).toBe(0.1234);
  });

  it('keeps the holding dialog open with an inline alert when save fails', () => {
    const { component, finance, toast } = componentWithFinance();
    finance.updateHolding = jasmine.createSpy('updateHolding').and.returnValue(throwError(() => ({ error: { detail: 'Synthetic save failed' } })));
    component.editHolding({
      id: 9,
      symbol: 'ABC',
      shares: 1000,
      purchase_price: 0.1234,
      purchase_date: '2026-01-15',
    } as Holding);
    component.addOrUpdateHolding();
    expect(component.showModal).toBeTrue();
    expect(component.holdingSaveError).toBe("Couldn't save. Something went wrong. Try again.");
    expect(component.holdingSaveError).not.toContain('Synthetic');
    expect(component.newHolding.purchase_price).toBe(0.1234);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows one retry toast when deleting a holding fails', async () => {
    const { component, finance, toast } = componentWithFinance();
    finance.deleteHolding = jasmine.createSpy('deleteHolding').and.returnValue(throwError(() => new Error('nope')));
    const holding = {
      id: 9, symbol: 'ABC', shares: 2, purchase_price: 0.12345, purchase_date: '2026-01-15',
    } as Holding;
    await component.deleteHolding(holding);
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
    const [message, action] = toast.error.calls.mostRecent().args;
    expect(message).toBe("Couldn't delete this holding.");
    expect(message).not.toContain('Try again');
    expect(action.label).toBe('Try again');
    expect(finance.deleteHolding).toHaveBeenCalledWith(9, true);
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

    it('maps preview errors, stays on upload, and does not replace existing holdings', () => {
      const { component, finance, toast } = componentWithFinance();
      component.holdings = [{ id: 1, symbol: 'EXISTING' } as Holding];
      component.fidelityImportFile = new File(['bad'], 'bad.csv');
      finance.previewFidelityImport.and.returnValue(throwError(() => new Error('Missing required columns: symbol, quantity')));
      component.runFidelityPreview();
      expect(component.fidelityImportError).toContain("It's missing Symbol and Quantity.");
      expect(component.fidelityImportStep).toBe('upload');
      expect(component.fidelityImportParsing).toBeFalse();
      expect(component.holdings[0].symbol).toBe('EXISTING');
      expect(finance.commitFidelityImport).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('rejects a zero-row preview even when the headers are valid', () => {
      const { component, finance } = componentWithFinance();
      component.fidelityImportFile = new File(['Account Number,Symbol,Quantity'], 'empty.csv');
      finance.previewFidelityImport.and.returnValue(of(buildFidelityImportPreview('empty.csv', 'Account Number,Symbol,Quantity')));
      component.runFidelityPreview();
      expect(component.fidelityImportStep).toBe('upload');
      expect(component.fidelityImportPreview).toBeNull();
      expect(component.fidelityImportError).toContain('It has no positions to import.');
      expect(finance.getBrokerageAccounts).not.toHaveBeenCalled();
      expect(finance.commitFidelityImport).not.toHaveBeenCalled();
    });

    it('keeps upload available when brokerage accounts cannot be loaded', () => {
      const { component, finance } = componentWithFinance();
      component.fidelityImportFile = new File([csv], 'positions.csv');
      finance.previewFidelityImport.and.returnValue(of(buildFidelityImportPreview('positions.csv', csv)));
      finance.getBrokerageAccounts.and.returnValue(throwError(() => new Error('private store error')));
      component.runFidelityPreview();
      expect(component.fidelityImportParsing).toBeFalse();
      expect(component.fidelityImportStep).toBe('upload');
      expect(component.fidelityImportPreview).toBeNull();
      expect(component.fidelityImportError).toBe("Couldn't load your Fidelity accounts. Try again.");
      expect(finance.commitFidelityImport).not.toHaveBeenCalled();
    });

    it('counts only holdings in the selected Fidelity brokerage accounts, including renamed accounts', () => {
      const { component } = componentWithFinance();
      component.knownBrokerageAccounts = [account,
        { ...account, id: 31, account_mask: 'Z456' },
        { ...account, id: 32, broker_slug: 'other' },
      ];
      component.selectedFidelityAccounts.add('Z123');
      component.holdings = [
        { id: 1, symbol: 'OLD', brokerage_account_id: 30, account_display: 'My renamed account' },
        { id: 2, symbol: 'MANUAL', brokerage_account_id: null },
        { id: 3, symbol: 'OTHER_FIDELITY', brokerage_account_id: 31 },
        { id: 4, symbol: 'OTHER_BROKER', brokerage_account_id: 32 },
      ] as Holding[];
      expect(component.existingFidelityHoldingCount).toBe(1);
      component.selectedFidelityAccounts.add('Z456');
      expect(component.existingFidelityHoldingCount).toBe(2);
    });

    it('updates the consequence for selected accounts and incomplete values', () => {
      const { component } = componentWithFinance();
      component.fidelityImportPreview = buildFidelityImportPreview('positions.csv', csv + '\nZ456,THIRD,1,,');
      component.selectedFidelityAccounts.add('Z123');
      expect(component.fidelityReplaceSummary).toBe('2 positions · $\u20601,250.00 · replaces your 0 Fidelity holdings');
      component.selectedFidelityAccounts.add('Z456');
      expect(component.fidelityReplaceSummary).toContain('3 positions · Value incomplete');
    });

    it('counts linked legacy Fidelity accounts using the same identification as staging', () => {
      const { component } = componentWithFinance();
      component.knownBrokerageAccounts = [
        { ...account, broker_slug: '' },
        { ...account, id: 31, broker_slug: '', broker_name: '', label: 'Fidelity retirement' },
        { ...account, id: 32, broker_slug: '', broker_name: '' },
      ];
      component.holdings = [
        { id: 1, symbol: 'LEGACY_NAME', brokerage_account_id: 30 },
        { id: 2, symbol: 'LEGACY_LABEL', brokerage_account_id: 31 },
        { id: 3, symbol: 'LEGACY_DISPLAY', brokerage_account_id: 32, account_display: 'Fidelity ···Z123' },
        { id: 4, symbol: 'MANUAL', brokerage_account_id: null },
      ] as Holding[];
      component.selectedFidelityAccounts.add('Z123');
      expect(component.existingFidelityHoldingCount).toBe(3);
    });

    it('counts exact legacy Fidelity display masks without treating manual or other accounts as replacements', () => {
      const { component } = componentWithFinance();
      component.knownBrokerageAccounts = [account, { ...account, id: 31, broker_slug: 'other' }];
      component.selectedFidelityAccounts.add('Z123');
      component.holdings = [
        { id: 1, symbol: 'LEGACY_UNLINKED', account_display: ' Fidelity ···z123 (Individual) ' },
        { id: 2, symbol: 'LEGACY_UNKNOWN_ID', brokerage_account_id: 99, account_display: 'Fidelity ···Z123' },
        { id: 3, symbol: 'OTHER_MASK', account_display: 'Fidelity ···Z1234' },
        { id: 4, symbol: 'KNOWN_OTHER_BROKER', brokerage_account_id: 31, account_display: 'Fidelity ···Z123' },
        { id: 5, symbol: 'MANUAL', account_display: 'Manual holdings' },
      ] as Holding[];
      expect(component.existingFidelityHoldingCount).toBe(2);
    });

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

import { TestBed, ComponentFixture } from '@angular/core/testing';
import { BehaviorSubject, Subject } from 'rxjs';
import { ToastService } from '@vivek/ui';
import { FinanceService } from '../services/finance.service';

describe('empty states (F10)', () => {
  let fixture: ComponentFixture<PortfolioComponent>;

  beforeEach(async () => {
    const idle: MarketRefreshState = {
      phase: 'idle', automatic: false, totalSymbols: 0, completedSymbols: 0,
      updatedHoldings: 0, updatedEmployerValuations: 0, failures: [], startedAt: null, finishedAt: null,
    };
    const financeStub = {
      holdings$: new BehaviorSubject<Holding[]>([]),
      netWorth$: new BehaviorSubject<unknown>(null),
      isLoading$: new BehaviorSubject<boolean>(false),
      dataChanges$: new Subject<unknown>(),
      getHoldings: () => of([]),
      getNetWorth: () => of(null),
      getHoldingImportStages: () => of([]),
    };
    const marketStub = {
      status$: new BehaviorSubject<MarketRefreshState>(idle),
      refreshNow: () => Promise.resolve(idle),
      refreshSymbol: () => Promise.resolve({ symbol: 'VOO', holdingsUpdated: 0, employerValuationsUpdated: 0, failedRecords: [] }),
    };
    await TestBed.configureTestingModule({
      imports: [PortfolioComponent],
      providers: [
        { provide: FinanceService, useValue: financeStub },
        { provide: MarketRefreshCoordinatorService, useValue: marketStub },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error']) },
        { provide: ConfirmService, useValue: { ask: () => Promise.resolve(true) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PortfolioComponent);
    fixture.detectChanges();
  });

  it('no holdings → No holdings yet with Add holding then Import from Fidelity', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('No holdings yet');
    expect(text).toContain('Add a position by hand or import a Fidelity positions file.');
    const buttons = [...fixture.nativeElement.querySelectorAll('.empty-actions button')]
      .map((el: Element) => el.textContent?.trim());
    expect(buttons).toEqual(['Add holding', 'Import from Fidelity']);
    expect(text).not.toContain('Add your first');
  });
});

describe('PortfolioComponent row copy (F16)', () => {
  it('names the holding source from its brokerage link', () => {
    const { component } = componentWithFinance();
    expect(component.holdingSource({ brokerage_account_id: 4 } as Holding)).toBe('Fidelity');
    expect(component.holdingSource({ brokerage_account_id: null } as Holding)).toBe('Manual');
    expect(component.holdingSource({} as Holding)).toBe('Manual');
  });

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

describe('PortfolioComponent F7 shared quotes', () => {
  it('exposes the saved quote for the form symbol from the shared book', () => {
    const { component } = componentWithFinance();
    component.holdings = [{
      id: 1, symbol: 'VOO', shares: 1, purchase_price: 90, current_price: 111,
      price_source: 'manual', price_as_of: '2026-10-30T20:24:00Z',
    } as Holding];
    component.newHolding.symbol = 'voo';
    expect(component.checkPrice()).toEqual({ price: 111, asOfText: 'Oct 30, 1:24 PM PT' });
    expect(component.asOfText(component.holdings[0])).toBe('Oct 30, 1:24 PM PT');
    component.newHolding.symbol = 'MSFT';
    expect(component.checkPrice()).toBeNull();
  });

  it('routes Check price for a held symbol through the coordinator, not a direct lookup', async () => {
    const { component, finance, market } = componentWithFinance();
    component.holdings = [{
      id: 1, symbol: 'VOO', shares: 1, purchase_price: 90, current_price: 111,
      price_source: 'manual', price_as_of: '2026-10-30T20:24:00Z',
    } as Holding];
    component.newHolding.symbol = 'VOO';
    component.checkSharePrice();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(market.refreshSymbol).toHaveBeenCalledWith('VOO');
    expect(finance.lookupSharePrice).not.toHaveBeenCalled();
  });
});
