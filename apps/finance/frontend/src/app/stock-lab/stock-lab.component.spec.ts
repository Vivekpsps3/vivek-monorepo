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
});
