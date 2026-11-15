import { MarketResearchResponse } from '../models/stock-lab.model';
import {
calculatePurchasePlan
} from './stock-lab.util';

const research = (overrides: Partial<MarketResearchResponse> = {}): MarketResearchResponse => ({
  symbol: 'TST',
  valid: true,
  source: 'test',
  fetched_at: '2026-01-02T00:00:00Z',
  cache_status: 'miss',
  warnings: [],
  profile: { name: 'Test Fund', asset_type: 'etf' },
  quote: { current_price: 120, dividend_yield: 0.02 },
  history: [
    { date: '2025-01-02', close: 100 },
    { date: '2025-07-02', close: 110 },
    { date: '2026-01-02', close: 120 },
  ],
  dividends: [
    { date: '2025-04-01', amount: 1 },
    { date: '2025-07-01', amount: 1 },
    { date: '2025-10-01', amount: 1 },
  ],
  splits: [],
  fundamentals: null,
  etf: null,
  analyst: null,
  ...overrides,
});

describe('stock-lab utilities', () => {

  it('calculates purchase planning from budget and target price', () => {
    const result = calculatePurchasePlan(research(), {
      purchase_mode: 'target_price',
      shares: null,
      budget: 1000,
      target_price: 100,
      projection_years: 10,
      growth_rate: 0.08,
      dividend_growth_rate: 0,
      reinvest_dividends: false,
      tax_drag: 0,
      fee_drag: 0,
      inflation_rate: 0.03,
    });

    expect(result.shares).toBe(10);
    expect(result.cash_required).toBe(1000);
    expect(result.position_value).toBe(1200);
    expect(result.annual_dividend_income).toBe(30);
    expect(result.projected_nominal_value).toBeGreaterThan(1200);
    expect(result.projected_real_value).toBeLessThan(result.projected_nominal_value);
  });

});
