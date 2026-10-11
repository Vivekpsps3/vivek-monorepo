import {
  assetReviewIntervalDays,
  assetReviewState,
  holdingGain,
  holdingGainPercent,
  liabilityReviewIntervalDays,
  portfolioDateSummary,
  positionReviewState,
  quoteFreshness,
  quoteFreshnessLabel,
  totalPortfolioGain,
  totalPortfolioValue,
} from './portfolio.util';
import { Asset, Holding, Liability } from '../models/transaction.model';

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

  it('computes gain', () => {
    expect(holdingGain(h)).toBe(40);
  });

  it('computes gain percent', () => {
    expect(holdingGainPercent(h)).toBe(20);
  });

  it('sums portfolio value', () => {
    expect(totalPortfolioValue([h])).toBe(240);
  });

  it('makes gains unavailable when cost basis is unknown', () => {
    const unknown = { ...h, purchase_price: null, cost_basis_status: 'unknown' } as unknown as Holding;
    expect(holdingGain(unknown)).toBeNull();
    expect(holdingGainPercent(unknown)).toBeNull();
    expect(totalPortfolioGain([h, unknown])).toBeNull();
  });

  it('treats an explicit zero cost basis as known while omitting percentage gain', () => {
    const zeroBasis = { ...h, purchase_price: 0, cost_basis_status: 'known' } as unknown as Holding;
    expect(holdingGain(zeroBasis)).toBe(240);
    expect(holdingGainPercent(zeroBasis)).toBeNull();
  });

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
    expect(quoteFreshness({ ...recent, quote_date: null } as Holding, '2026-10-11')).toBe('Live');
    expect(quoteFreshness({ ...recent, quote_date: null, price_as_of: '2026-10-07T23:00:00Z' } as Holding, '2026-10-11')).toBe('Stale');
  });

  it('keeps imported, provisional, and unavailable provenance visible without a source date', () => {
    expect(quoteFreshness({ ...h, price_source: 'import_market_value' } as Holding, '2026-10-11')).toBe('Imported');
    expect(quoteFreshness({ ...h, price_source: 'provisional_cost_basis' } as Holding, '2026-10-11')).toBe('Provisional');
    expect(quoteFreshness({ ...h, price_source: 'unavailable' } as Holding, '2026-10-11')).toBe('Unavailable');
  });

  it('keeps position review age separate from refreshed quote age', () => {
    const row = { ...h, price_source: 'live_eod', position_as_of: '2026-09-10', quote_date: '2026-10-11' } as Holding;
    expect(positionReviewState(row, '2026-10-11')).toBe('due');
    expect(quoteFreshness(row, '2026-10-11')).toBe('Live');
    expect(positionReviewState({ ...row, position_as_of: null } as Holding, '2026-10-11')).toBe('unknown');
    expect(positionReviewState({ ...row, position_as_of: '2026-09-11' } as Holding, '2026-10-11')).toBe('due');
    expect(positionReviewState({ ...row, position_as_of: '2026-10-01', position_review_interval_days: 45 } as Holding, '2026-10-11')).toBe('current');
    expect(positionReviewState({ ...row, position_as_of: '2026-08-27', position_review_interval_days: 45 } as Holding, '2026-10-11')).toBe('due');
  });

  it('uses category-based balance review defaults and honors overrides', () => {
    const cash = { ...({ category: 'checking' } as Asset), as_of_date: '2026-10-01', review_interval_days: null };
    const home = { ...({ category: 'real_estate' } as Asset), as_of_date: '2026-04-01' };
    const debt = { ...({} as Liability), as_of_date: '2026-10-01' };
    expect(assetReviewIntervalDays(cash)).toBe(30);
    expect(assetReviewIntervalDays(home)).toBe(180);
    expect(liabilityReviewIntervalDays(debt)).toBe(30);
    expect(assetReviewState(cash, '2026-10-31')).toBe('due');
    expect(assetReviewState({ ...cash, review_interval_days: 60 } as Asset, '2026-10-31')).toBe('current');
  });

  it('reports unknown source dates instead of substituting the current date', () => {
    expect(portfolioDateSummary(['2026-10-10', null])).toBe('2026-10-10 · 1 unknown');
    expect(portfolioDateSummary([null, 'invalid'])).toBe('Date unknown');
  });
});
