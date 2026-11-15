import { Holding } from '../models/transaction.model';
import {
holdingGain,
holdingGainPercent,
quoteFreshness,
quoteFreshnessLabel
} from './portfolio.util';

describe('portfolio.util', () => {
  const h: Holding = {
    id: 1,
    symbol: 'AAPL',
    shares: 2,
    purchase_price: 100,
    purchase_date: '2026-01-01',
    current_price: 120,
    value: 240,
  };

  it('calculates percentage gain from exact market value rather than rounded last price', () => {
    const imported = { ...h, shares: 3, purchase_price: 30, current_price: 33.33, value: 100 } as Holding;
    expect(holdingGain(imported)).toBe(10);
    expect(holdingGainPercent(imported)).toBeCloseTo((10 / 90) * 100, 8);
  });

  it('marks quote freshness from market date, not fetch time', () => {
    const recent = { ...h, price_source: 'live_eod', quote_date: '2026-10-08', price_as_of: '2026-10-11T08:00:00Z' } as Holding;
    const stale = { ...recent, quote_date: '2026-10-07' } as Holding;
    const unknown = { ...recent, quote_date: null, price_as_of: null } as Holding;
    expect(quoteFreshness(recent, '2026-10-11')).toBe('Live');
    expect(quoteFreshness(stale, '2026-10-11')).toBe('Stale');
    expect(quoteFreshness(unknown, '2026-10-11')).toBe('Unknown');
    expect(quoteFreshness({ ...recent, quote_date: 'not-a-date' } as Holding, '2026-10-11')).toBe('Unknown');
    expect(quoteFreshness({ ...recent, quote_date: '2026-10-08' } as Holding, '2026-10-11')).toBe('Live');
    expect(quoteFreshness({ ...recent, quote_date: '2026-10-07' } as Holding, '2026-10-11')).toBe('Stale');
    expect(quoteFreshnessLabel({ ...recent, quote_date: '2026-10-07' } as Holding, '2026-10-11')).toBe('Stale · 4 days old');
    const fetchedRecentlyWithoutSourceDate = { ...recent, quote_date: null, price_as_of: '2026-10-11T08:00:00Z' } as Holding;
    expect(quoteFreshness(fetchedRecentlyWithoutSourceDate, '2026-10-11')).toBe('Unknown');
    expect(quoteFreshnessLabel(fetchedRecentlyWithoutSourceDate, '2026-10-11')).toBe('Unknown');
    expect(quoteFreshness({ ...recent, quote_date: null, market_date: '2026-10-07' } as Holding, '2026-10-11')).toBe('Stale');
  });

});
