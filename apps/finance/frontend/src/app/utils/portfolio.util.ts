import { Asset, Holding, Liability } from '../models/transaction.model';

export type ReviewState = 'current' | 'due' | 'unknown';
export type QuoteState = 'Live' | 'Stale' | 'Cached' | 'Imported' | 'Provisional' | 'Unavailable' | 'Unknown';

type ValuedHolding = Holding & {
  cost_basis_status?: 'known' | 'unknown';
  quote_date?: string | null;
  market_date?: string | null;
  price_as_of?: string | null;
  position_as_of?: string | null;
  position_review_interval_days?: number | null;
};

/** Return the provider's source/trading date, never the request or fetch timestamp. */
export function actualQuoteDate(holding: Holding): string | null {
  const row = holding as ValuedHolding;
  return row.quote_date ?? row.market_date ?? null;
}

export function holdingGain(h: Holding): number | null {
  const row = h as ValuedHolding;
  if (row.cost_basis_status === 'unknown' || h.purchase_price == null || h.value == null) return null;
  const cost = Number(h.shares) * Number(h.purchase_price);
  const value = Number(h.value);
  return Number.isFinite(cost) && Number.isFinite(value) ? value - cost : null;
}

export function holdingGainPercent(h: Holding): number | null {
  if (h.purchase_price == null || h.purchase_price <= 0) return null;
  const gain = holdingGain(h);
  const cost = Number(h.shares) * Number(h.purchase_price);
  return gain == null || !Number.isFinite(cost) || cost <= 0 ? null : (gain / cost) * 100;
}

export function totalPortfolioValue(holdings: Holding[]): number {
  return holdings.reduce((sum, h) => sum + (Number.isFinite(Number(h.value)) ? Number(h.value) : 0), 0);
}

export function totalPortfolioGain(holdings: Holding[]): number | null {
  let total = 0;
  for (const holding of holdings) {
    const gain = holdingGain(holding);
    if (gain == null) return null;
    total += gain;
  }
  return total;
}

export function hasUnvaluedPositions(holdings: Holding[]): boolean {
  return holdings.some(row => row.value == null || !Number.isFinite(Number(row.value)));
}

export function quoteFreshness(holding: Holding, asOf = todayDate()): QuoteState {
  const source = String(holding.price_source || '');
  // Imported and provisional values describe their provenance independently of
  // whether the source file supplied a date. Keep that label visible while the
  // adjacent date column says "Date unknown".
  if (source === 'import_market_price' || source === 'import_market_value') return 'Imported';
  if (source === 'provisional_cost_basis' || source === 'fallback_purchase') return 'Provisional';
  if (source === 'error' || source === 'unavailable') return 'Unavailable';

  const quoteDate = actualQuoteDate(holding);
  const age = calendarAgeDays(quoteDate, asOf);
  if (age == null || age < 0) return 'Unknown';
  if (age > 3) return 'Stale';

  if (source === 'live' || source === 'live_eod') return 'Live';
  if (source === 'cached' || source === 'sqlite_eod' || source.startsWith('redis')) return 'Cached';
  return 'Unknown';
}

export function quoteFreshnessLabel(holding: Holding, asOf = todayDate()): string {
  const state = quoteFreshness(holding, asOf);
  if (state !== 'Stale') return state;
  const quoteDate = actualQuoteDate(holding);
  const age = calendarAgeDays(quoteDate, asOf);
  return age == null ? 'Stale' : `Stale · ${age} days old`;
}

export function positionReviewState(holding: Holding, asOf = todayDate()): ReviewState {
  const row = holding as ValuedHolding;
  const age = calendarAgeDays(row.position_as_of, asOf);
  if (age == null || age < 0) return 'unknown';
  const interval = reviewIntervalOverride(row.position_review_interval_days) ?? 30;
  return age >= interval ? 'due' : 'current';
}

export function assetReviewIntervalDays(asset: Asset): number {
  const override = reviewIntervalOverride((asset as Asset & { review_interval_days?: number | null }).review_interval_days);
  if (override != null) return override;
  return ['cash', 'checking', 'savings'].includes(String(asset.category).toLowerCase()) ? 30 : 180;
}

export function liabilityReviewIntervalDays(liability: Liability): number {
  const override = reviewIntervalOverride((liability as Liability & { review_interval_days?: number | null }).review_interval_days);
  return override ?? 30;
}

export function assetReviewState(asset: Asset, asOf = todayDate()): ReviewState {
  return balanceReviewState(asset.as_of_date, assetReviewIntervalDays(asset), asOf);
}

export function liabilityReviewState(liability: Liability, asOf = todayDate()): ReviewState {
  return balanceReviewState(liability.as_of_date, liabilityReviewIntervalDays(liability), asOf);
}

export function balanceReviewState(asOfDate: string | null | undefined, intervalDays: number, today = todayDate()): ReviewState {
  const age = calendarAgeDays(asOfDate, today);
  if (age == null || age < 0 || !Number.isFinite(intervalDays) || intervalDays <= 0) return 'unknown';
  return age >= intervalDays ? 'due' : 'current';
}

export function calendarAgeDays(date: string | null | undefined, today = todayDate()): number | null {
  if (!isIsoDate(date) || !isIsoDate(today)) return null;
  return (Date.parse(today + 'T00:00:00Z') - Date.parse(date + 'T00:00:00Z')) / 86_400_000;
}

export function portfolioDateSummary(values: Array<string | null | undefined>): string {
  const dates = values.filter(isIsoDate).sort();
  const unknownCount = values.length - dates.length;
  if (!dates.length) return 'Date unknown';
  const uniqueDates = Array.from(new Set(dates));
  const range = uniqueDates.length === 1 ? uniqueDates[0] : uniqueDates[0] + ' to ' + uniqueDates[uniqueDates.length - 1];
  return unknownCount ? range + ' · ' + unknownCount + ' unknown' : range;
}

function reviewIntervalOverride(value: number | null | undefined): number | null {
  const interval = Number(value);
  return Number.isInteger(interval) && interval > 0 ? interval : null;
}

function isIsoDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function todayDate(): string {
  const date = new Date();
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}
