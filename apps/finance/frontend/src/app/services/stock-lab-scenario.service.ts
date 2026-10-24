import { Injectable } from '@angular/core';
import { EncryptedStoreService } from '../crypto/encrypted-store.service';
import { StockLabScenario } from '../models/stock-lab.model';

@Injectable({ providedIn: 'root' })
export class StockLabScenarioService {
  constructor(private encStore: EncryptedStoreService) {}

  createDefaultScenario(symbol = 'VOO'): StockLabScenario {
    const now = new Date().toISOString();
    const primary = symbol.trim().toUpperCase();
    return {
      id: 0,
      name: `${primary} scenario`,
      primary_symbol: primary,
      comparison_symbols: [],
      include_owned_symbols: true,
      selected_owned_symbols: [],
      purchase_mode: 'budget',
      shares: null,
      budget: 1000,
      target_price: null,
      cost_basis: null,
      recurring_contribution: null,
      projection_years: 10,
      bear_growth_rate: 0.03,
      base_growth_rate: 0.08,
      bull_growth_rate: 0.12,
      custom_growth_rate: null,
      dividend_growth_rate: 0,
      reinvest_dividends: true,
      tax_drag: 0,
      fee_drag: 0,
      inflation_rate: 0.03,
      created_at: now,
      updated_at: now,
    };
  }

  list(): Promise<StockLabScenario[]> {
    return this.encStore.getStockLabScenarios({ silent: true });
  }

  save(scenario: StockLabScenario): Promise<StockLabScenario> {
    return this.encStore.saveStockLabScenario(scenario, scenario.id || undefined, { silent: true });
  }

  delete(id: number): Promise<void> {
    return this.encStore.deleteStockLabScenario(id, { silent: true });
  }
}
