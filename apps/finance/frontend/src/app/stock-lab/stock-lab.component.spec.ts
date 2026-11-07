import { ChangeDetectorRef } from '@angular/core';
import { Subject, of } from 'rxjs';
import { ToastService } from '@vivek/ui';
import { Holding } from '../models/transaction.model';
import { StockLabComponent } from './stock-lab.component';
import { FinanceService } from '../services/finance.service';
import { MarketResearchService } from '../services/market-research.service';
import { StockLabScenarioService } from '../services/stock-lab-scenario.service';
import { MarketResearchResponse } from '../models/stock-lab.model';

describe('StockLabComponent', () => {
  it('ignores a slower prior market response after the selected symbol changes', () => {
    const first = new Subject<any>();
    const second = new Subject<any>();
    const market = jasmine.createSpyObj('MarketResearchService', ['getBatch']);
    market.getBatch.and.returnValues(first, second);
    const scenarios = jasmine.createSpyObj('StockLabScenarioService', ['createDefaultScenario']);
    scenarios.createDefaultScenario.and.returnValue({
      id: 0, primary_symbol: 'VOO', comparison_symbols: [], selected_owned_symbols: [],
      include_owned_symbols: false,
    });
    const finance = { holdings$: new Subject<any>() };
    const cdr = jasmine.createSpyObj('ChangeDetectorRef', ['markForCheck']);
    const component = new StockLabComponent(market, scenarios, finance as any, {} as any, cdr);

    component.loadMarketData(false);
    component.setPrimarySymbol('SCHD');
    component.loadMarketData(false);
    second.next({ results: [{ symbol: 'SCHD' }], failed: [] });
    first.next({ results: [{ symbol: 'VOO' }], failed: [] });

    expect(component.research.map(row => row.symbol)).toEqual(['SCHD']);
  });

  it('shows scenario rates as percentages while keeping stored values decimal', () => {
    const market = jasmine.createSpyObj('MarketResearchService', ['getBatch']);
    const scenarios = jasmine.createSpyObj('StockLabScenarioService', ['createDefaultScenario']);
    scenarios.createDefaultScenario.and.returnValue({
      id: 0, primary_symbol: 'VOO', comparison_symbols: [], selected_owned_symbols: [],
      include_owned_symbols: false, base_growth_rate: 0.07, dividend_growth_rate: 0.04, inflation_rate: 0.025,
    });
    const component = new StockLabComponent(
      market, scenarios, { holdings$: new Subject<any>() } as any, {} as any,
      jasmine.createSpyObj('ChangeDetectorRef', ['markForCheck'])
    );

    expect(component.asPercent(component.scenario.base_growth_rate)).toBe(7);
    expect(component.asPercent(component.scenario.dividend_growth_rate)).toBe(4);
    expect(component.asPercent(component.scenario.inflation_rate)).toBe(2.5);
    component.setRatePercent('base_growth_rate', '8.5');
    expect(component.scenario.base_growth_rate).toBe(0.085);
    expect(component.scenario.dividend_growth_rate).toBe(0.04);
  });

  function lab(overrides: { market?: ReturnType<typeof jasmine.createSpyObj>; scenarios?: ReturnType<typeof jasmine.createSpyObj>; toast?: ReturnType<typeof jasmine.createSpyObj> } = {}) {
    const market = overrides.market ?? jasmine.createSpyObj('MarketResearchService', ['getBatch']);
    const scenarios = overrides.scenarios ?? jasmine.createSpyObj('StockLabScenarioService', ['createDefaultScenario', 'list', 'save', 'delete']);
    if (!overrides.scenarios) {
      scenarios.createDefaultScenario.and.returnValue({
        id: 0, primary_symbol: 'VOO', comparison_symbols: [], selected_owned_symbols: [], include_owned_symbols: false,
      });
    }
    const toast = overrides.toast ?? jasmine.createSpyObj('ToastService', ['error', 'success']);
    const component = new StockLabComponent(
      market, scenarios, { holdings$: new Subject() } as never,
      toast, jasmine.createSpyObj('ChangeDetectorRef', ['markForCheck']),
    );
    return { component, market, scenarios, toast };
  }

  it('shows one fixed market error and does not toast the raw detail', () => {
    const failed = new Subject<never>();
    const market = jasmine.createSpyObj('MarketResearchService', ['getBatch']);
    market.getBatch.and.returnValue(failed);
    const { component, toast } = lab({ market });
    component.loadMarketData(false);
    failed.error({ error: { detail: 'Unexpected synthetic endpoint /api/market/research/batch' }, message: 'Http failure' });
    expect(component.error).toBe("Market data couldn't be loaded. Check your connection and try again.");
    expect(component.error).not.toContain('Unexpected');
    expect(component.error).not.toContain('Http failure');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('replaces a failed batch symbol with the same fixed copy', () => {
    const batch = new Subject<{ results: unknown[]; failed: Array<{ symbol: string; error: string }> }>();
    const market = jasmine.createSpyObj('MarketResearchService', ['getBatch']);
    market.getBatch.and.returnValue(batch);
    const { component, toast } = lab({ market });
    component.loadMarketData(false);
    batch.next({ results: [], failed: [{ symbol: 'VOO', error: 'Unexpected synthetic endpoint' }] });
    expect(component.error).toBe("Market data couldn't be loaded. Check your connection and try again.");
    expect(String(component.error)).not.toContain('Unexpected');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows one fixed message when scenario load, save, and delete fail', async () => {
    const scenarios = jasmine.createSpyObj('StockLabScenarioService', ['createDefaultScenario', 'list', 'save', 'delete']);
    scenarios.createDefaultScenario.and.returnValue({
      id: 0, primary_symbol: 'VOO', comparison_symbols: [], selected_owned_symbols: [], include_owned_symbols: false,
    });
    scenarios.list.and.rejectWith({ error: { detail: 'raw load' }, message: 'Http failure' });
    scenarios.save.and.rejectWith({ error: { detail: 'raw save' }, message: 'Http failure' });
    scenarios.delete.and.rejectWith({ error: { detail: 'raw delete' }, message: 'Http failure' });
    const { component, toast } = lab({ scenarios });

    await component.loadScenarios();
    expect(component.error).toBe("Couldn't load saved scenarios.");
    expect(component.error).not.toContain('raw');

    component.scenario = { ...component.scenario, id: 4 };
    await component.saveScenario();
    expect(component.error).toBe("Couldn't save this scenario.");
    expect(toast.success).not.toHaveBeenCalled();

    await component.deleteScenario();
    expect(component.error).toBe("Couldn't delete this scenario.");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('names a price time and keeps the cache words out (F18)', () => {
    const market = jasmine.createSpyObj('MarketResearchService', ['getBatch']);
    const scenarios = jasmine.createSpyObj('StockLabScenarioService', ['createDefaultScenario']);
    scenarios.createDefaultScenario.and.returnValue({
      id: 0, primary_symbol: 'VOO', comparison_symbols: [], selected_owned_symbols: [],
      include_owned_symbols: false,
    });
    const finance = { holdings$: new Subject<unknown>() };
    const cdr = jasmine.createSpyObj('ChangeDetectorRef', ['markForCheck']);
    const component = new StockLabComponent(
      market as unknown as MarketResearchService,
      scenarios as unknown as StockLabScenarioService,
      finance as unknown as FinanceService,
      {} as unknown as ToastService,
      cdr as unknown as ChangeDetectorRef,
    );
    component.research = [{
      symbol: 'VOO',
      fetched_at: '2026-10-22T10:24:00-07:00',
      cache_status: 'hit',
      quote: { current_price: 700.81 },
    } as unknown as MarketResearchResponse];

    const line = component.priceAsOf(component.primaryResearch?.fetched_at);
    expect(line).toContain('Price as of');
    expect(line).not.toContain('stored');
    expect(line).not.toContain('fetched');
    const fact = component.evidenceCards.find(card => card.label === 'Public market data');
    expect(fact?.detail).toContain('as of');
    expect(fact?.detail).not.toContain('cached');
    expect(fact?.detail).not.toContain('fetched');
  });
});

describe('StockLabComponent F7 no-fetch behaviour', () => {
  function labWithHoldings() {
    const market = jasmine.createSpyObj('MarketResearchService', ['getBatch']);
    const scenarios = jasmine.createSpyObj('StockLabScenarioService', ['createDefaultScenario', 'list']);
    scenarios.createDefaultScenario.and.returnValue({
      id: 0, primary_symbol: 'VOO', comparison_symbols: [], selected_owned_symbols: [], include_owned_symbols: false,
    });
    scenarios.list.and.resolveTo([]);
    const finance = {
      holdings$: new Subject<Holding[]>(),
      getHoldings: () => of<Holding[]>([]),
    } as unknown as FinanceService;
    const toast = {} as unknown as ToastService;
    const component = new StockLabComponent(
      market, scenarios, finance, toast,
      jasmine.createSpyObj('ChangeDetectorRef', ['markForCheck'])
    );
    return { market, scenarios, component };
  }

  it('does not fetch market data on init', async () => {
    const { market, component } = labWithHoldings();
    component.ngOnInit();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(market.getBatch).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });

  it('renders the saved-quote line from a saved holding and feeds the saved price to the purchase plan', () => {
    const { component } = labWithHoldings();
    component.holdings = [{
      id: 1, symbol: 'VOO', shares: 2, purchase_price: 90, purchase_date: null, current_price: 111,
      price_source: 'manual', price_as_of: '2026-10-30T20:24:00Z',
    }];
    expect(component.savedQuoteLine).toBe('Saved price for VOO: 111 · Oct 30, 1:24 PM PT');
    component.research = [{
      symbol: 'VOO', valid: true, source: 'synthetic', fetched_at: '', cache_status: 'hit',
      warnings: [], profile: null, quote: null, history: [], dividends: [], splits: [], fundamentals: null,
      etf: null, analyst: null,
    } satisfies MarketResearchResponse];
    component.scenario = {
      ...component.scenario, purchase_mode: 'shares', shares: 2, budget: 0, target_price: 0,
      projection_years: 0, base_growth_rate: 0, custom_growth_rate: null,
      dividend_growth_rate: 0, reinvest_dividends: false, tax_drag: 0, fee_drag: 0, inflation_rate: 0,
    };
    expect(component.purchasePlan?.position_value).toBe(222);
  });
});
