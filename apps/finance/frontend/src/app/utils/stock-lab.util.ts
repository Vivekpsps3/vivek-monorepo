import {
  DividendCadence,
  MarketDividendEvent,
  MarketPricePoint,
  MarketResearchResponse,
  PurchasePlanResult,
  ReturnPeriodRow,
  ScorecardItem,
  StockLabPurchaseMode,
} from '../models/stock-lab.model';

export const PERIODS = [
  { key: '1m', label: '1 month', months: 1 },
  { key: '6m', label: '6 months', months: 6 },
  { key: '1y', label: '1 year', months: 12 },
  { key: '2y', label: '2 years', months: 24 },
  { key: '3y', label: '3 years', months: 36 },
  { key: '5y', label: '5 years', months: 60 },
  { key: '10y', label: '10 years', months: 120 },
] as const;

export interface PurchasePlanInput {
  purchase_mode: StockLabPurchaseMode;
  shares: number | null;
  budget: number | null;
  target_price: number | null;
  projection_years: number;
  growth_rate: number;
  dividend_growth_rate: number;
  reinvest_dividends: boolean;
  tax_drag: number;
  fee_drag: number;
  inflation_rate: number;
}

function addMonths(date: Date, months: number): Date {
  const out = new Date(date);
  out.setMonth(out.getMonth() + months);
  return out;
}

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function nearestOnOrBefore(history: MarketPricePoint[], target: Date): MarketPricePoint | null {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  let best: MarketPricePoint | null = null;
  for (const point of sorted) {
    if (parseDate(point.date) <= target) best = point;
    else break;
  }
  return best;
}

function yearsBetween(start: string, end: string): number {
  const ms = parseDate(end).getTime() - parseDate(start).getTime();
  return Math.max(ms / (365.25 * 24 * 60 * 60 * 1000), 0);
}

export function calculateReturnPeriods(
  research: MarketResearchResponse,
  asOf = new Date()
): ReturnPeriodRow[] {
  const history = [...research.history].sort((a, b) => a.date.localeCompare(b.date));
  const end = history.at(-1) ?? null;
  return PERIODS.map(period => {
    const target = addMonths(asOf, -period.months);
    const start = nearestOnOrBefore(history, target);
    if (!start || !end || start.close <= 0) {
      return {
        key: period.key,
        label: period.label,
        available: false,
        start_date: null,
        end_date: end?.date ?? null,
        start_price: null,
        end_price: end?.close ?? null,
        price_return: null,
        price_return_pct: null,
        dividend_return: 0,
        dividend_return_pct: null,
        total_return: null,
        total_return_pct: null,
        annualized_price_return_pct: null,
        annualized_total_return_pct: null,
      };
    }
    const dividendReturn = research.dividends
      .filter(div => div.date > start.date && div.date <= end.date)
      .reduce((sum, div) => sum + Number(div.amount || 0), 0);
    const priceReturn = end.close - start.close;
    const totalReturn = priceReturn + dividendReturn;
    const years = yearsBetween(start.date, end.date);
    const priceReturnPct = priceReturn / start.close;
    const totalReturnPct = totalReturn / start.close;
    return {
      key: period.key,
      label: period.label,
      available: true,
      start_date: start.date,
      end_date: end.date,
      start_price: start.close,
      end_price: end.close,
      price_return: priceReturn,
      price_return_pct: priceReturnPct,
      dividend_return: dividendReturn,
      dividend_return_pct: dividendReturn / start.close,
      total_return: totalReturn,
      total_return_pct: totalReturnPct,
      annualized_price_return_pct: years >= 1 ? Math.pow(1 + priceReturnPct, 1 / years) - 1 : null,
      annualized_total_return_pct: years >= 1 ? Math.pow(1 + totalReturnPct, 1 / years) - 1 : null,
    };
  });
}

export function detectDividendCadence(dividends: MarketDividendEvent[]): DividendCadence {
  if (dividends.length === 0) return 'none';
  if (dividends.length < 3) return 'irregular';
  const sorted = [...dividends].sort((a, b) => a.date.localeCompare(b.date));
  const gaps = sorted.slice(1).map((div, index) => {
    const prev = parseDate(sorted[index].date).getTime();
    const curr = parseDate(div.date).getTime();
    return (curr - prev) / (24 * 60 * 60 * 1000);
  });
  const ratioIn = (min: number, max: number) => gaps.filter(gap => gap >= min && gap <= max).length / gaps.length;
  if (ratioIn(25, 35) >= 0.65) return 'monthly';
  if (ratioIn(80, 100) >= 0.65) return 'quarterly';
  if (ratioIn(330, 400) >= 0.65) return 'annual';
  return 'irregular';
}

export function trailingTwelveMonthDividend(research: MarketResearchResponse): number {
  const end = research.history.at(-1)?.date ?? new Date().toISOString().slice(0, 10);
  const start = addMonths(parseDate(end), -12).toISOString().slice(0, 10);
  return research.dividends
    .filter(div => div.date > start && div.date <= end)
    .reduce((sum, div) => sum + Number(div.amount || 0), 0);
}

export function calculatePurchasePlan(
  research: MarketResearchResponse,
  input: PurchasePlanInput,
  savedPrice?: number | null
): PurchasePlanResult {
  const currentPrice = Math.max(0.01, Number(research.quote?.current_price ?? savedPrice ?? research.history.at(-1)?.close ?? 0));
  const effectivePurchasePrice = input.purchase_mode === 'target_price'
    ? Math.max(0.01, Number(input.target_price || currentPrice))
    : currentPrice;
  const shares = input.purchase_mode === 'shares'
    ? Math.max(0, Number(input.shares || 0))
    : Math.max(0, Number(input.budget || 0)) / effectivePurchasePrice;
  const cashRequired = shares * effectivePurchasePrice;
  const ttmDividend = trailingTwelveMonthDividend(research);
  const netGrowth = Number(input.growth_rate || 0) - Number(input.tax_drag || 0) - Number(input.fee_drag || 0);
  let projected = shares * currentPrice;
  let annualDividend = shares * ttmDividend;
  for (let year = 0; year < Math.max(0, Math.round(input.projection_years)); year += 1) {
    projected *= 1 + netGrowth;
    if (input.reinvest_dividends) projected += annualDividend;
    annualDividend *= 1 + Number(input.dividend_growth_rate || 0);
  }
  return {
    effective_purchase_price: effectivePurchasePrice,
    shares,
    cash_required: cashRequired,
    position_value: shares * currentPrice,
    break_even_price: effectivePurchasePrice,
    annual_dividend_income: shares * ttmDividend,
    projected_nominal_value: projected,
    projected_real_value: projected / Math.pow(1 + Math.max(0, Number(input.inflation_rate || 0)), Math.max(0, input.projection_years)),
  };
}

export function buildScorecard(research: MarketResearchResponse, ownedExposurePct: number): ScorecardItem[] {
  const oneYear = calculateReturnPeriods(research).find(row => row.key === '1y');
  const cadence = detectDividendCadence(research.dividends);
  const historyScore = Math.min(100, Math.round((research.history.length / 252) * 30));
  const growthScore = oneYear?.total_return_pct == null ? 35 : Math.max(0, Math.min(100, Math.round(50 + oneYear.total_return_pct * 100)));
  const incomeScore = cadence === 'none' ? 10 : cadence === 'irregular' ? 45 : 75;
  const concentrationPenalty = ownedExposurePct > 20 ? 25 : ownedExposurePct > 10 ? 10 : 0;
  return [
    {
      label: 'Growth fit',
      score: growthScore,
      tone: growthScore >= 65 ? 'success' : growthScore >= 40 ? 'warning' : 'danger',
      note: oneYear?.available ? 'Based on one-year total return.' : 'Price history is sparse.',
    },
    {
      label: 'Income fit',
      score: incomeScore,
      tone: incomeScore >= 65 ? 'success' : incomeScore >= 40 ? 'warning' : 'default',
      note: cadence === 'none' ? 'No dividend history found.' : `Dividend cadence appears ${cadence}.`,
    },
    {
      label: 'Risk fit',
      score: Math.max(0, 75 - concentrationPenalty),
      tone: concentrationPenalty > 0 ? 'warning' : 'success',
      note: concentrationPenalty > 0 ? 'Owned exposure may create concentration risk.' : 'No concentration warning from current holdings.',
    },
    {
      label: 'Data confidence',
      score: research.warnings.length ? Math.max(20, historyScore) : Math.max(60, historyScore),
      tone: research.warnings.length || historyScore < 40 ? 'warning' : 'success',
      note: research.warnings.length ? research.warnings[0] : 'Provider returned usable market data.',
    },
  ];
}
