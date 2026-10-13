import { Subject } from 'rxjs';
import { StockLabComponent } from './stock-lab.component';

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
});
