import { ChangeDetectorRef } from '@angular/core';
import { ToastService } from '@vivek/ui';
import { Subject } from 'rxjs';
import { MarketResearchResponse } from '../models/stock-lab.model';
import { FinanceService } from '../services/finance.service';
import { MarketResearchService } from '../services/market-research.service';
import { StockLabScenarioService } from '../services/stock-lab-scenario.service';
import { StockLabComponent } from './stock-lab.component';

describe('StockLabComponent', () => {

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

  it('does not apply a scenario saved after the research view closed', async () => {
    let resolveSave: (value: unknown) => void = () => undefined;
    const market = jasmine.createSpyObj('MarketResearchService', ['getBatch']);
    const scenarios = jasmine.createSpyObj('StockLabScenarioService', ['createDefaultScenario', 'save', 'list']);
    const fresh = {
      id: 0, name: 'VOO scenario', primary_symbol: 'VOO', comparison_symbols: [],
      selected_owned_symbols: [], include_owned_symbols: false, budget: 1000, projection_years: 10,
    };
    scenarios.createDefaultScenario.and.returnValue({ ...fresh });
    scenarios.save.and.returnValue(new Promise(resolve => { resolveSave = resolve; }));
    scenarios.list.and.resolveTo([]);
    const component = new StockLabComponent(
      market as unknown as MarketResearchService,
      scenarios as unknown as StockLabScenarioService,
      { holdings$: new Subject<unknown>() } as unknown as FinanceService,
      {} as unknown as ToastService,
      jasmine.createSpyObj('ChangeDetectorRef', ['markForCheck']),
    );
    component.scenario = { ...fresh, primary_symbol: 'MSFT', name: 'MSFT scenario' } as unknown as typeof component.scenario;
    const pending = component.saveScenario();
    (component as unknown as { researchEpoch: number }).researchEpoch = 1;
    component.scenario = { ...fresh } as unknown as typeof component.scenario;
    resolveSave({ ...fresh, id: 9, primary_symbol: 'MSFT' });
    await pending;
    expect(component.scenario.primary_symbol).toBe('VOO');
  });
});
