import { Holding } from '../models/transaction.model';
import {
financeSnapshot,
priceFreshnessSummary
} from './finance-hub-snapshot';

function holding(partial: Partial<Holding>): Holding {
  return {
    id: 1,
    symbol: 'AAPL',
    shares: 1,
    purchase_price: 10,
    purchase_date: '2024-01-01',
    ...partial,
  };
}

describe('hub finance summary', () => {
  const today = '2026-10-15';

  it('describes stale and unknown prices without changing values', () => {
    const fresh = holding({ quote_date: '2026-10-14', price_source: 'live_eod', market_value: 10 });
    const stale = holding({ id: 2, symbol: 'MSFT', quote_date: '2026-10-01', price_source: 'live_eod', market_value: 10 });
    const undated = holding({ id: 3, symbol: 'CASH', quote_date: null, price_source: 'manual', market_value: 10 });

    expect(priceFreshnessSummary([fresh], today)).toBe('Prices are current');
    expect(priceFreshnessSummary([fresh, stale], today)).toBe('Some prices are stale');
    expect(priceFreshnessSummary([undated], today)).toBe('Some price dates are unknown');
    expect(financeSnapshot([], [], [stale]).portfolio).toBe(10);
  });

});
