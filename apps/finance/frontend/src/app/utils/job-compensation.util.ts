import {
  JobIncome,
  JobIncomeCreate,
  JobStockGrant,
  JobStockPurchase,
  JobStockValuation,
} from '../models/transaction.model';
import { todayIsoDate } from './date.util';

type JobPay = Pick<JobIncomeCreate, 'pay_frequency' | 'base_pay' | 'hours_per_week' | 'effective_date' | 'end_date' | 'promotions' | 'compensation_payments' | 'annual_bonus' | 'annual_equity' | 'annual_other' | 'annual_taxes' | 'annual_deductions'>;
type JobStocks = Pick<JobIncomeCreate, 'effective_date' | 'stock_symbol' | 'stock_grants' | 'stock_purchases' | 'stock_valuations'>;
const DAY_MS = 86_400_000;

export function initialAnnualBasePay(row: JobPay): number {
  const base = Number(row.base_pay) || 0;
  switch (row.pay_frequency) {
    case 'monthly': return base * 12;
    case 'semimonthly': return base * 24;
    case 'biweekly': return base * 26;
    case 'weekly': return base * 52;
    case 'hourly': return base * (row.hours_per_week ?? 40) * 52;
    default: return base;
  }
}

export function annualBasePayAt(row: JobPay, date = todayIsoDate()): number {
  const promotion = [...(row.promotions || [])]
    .filter(item => item.date >= row.effective_date && item.date <= date && (!row.end_date || item.date <= row.end_date))
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  return promotion ? Number(promotion.annual_base_pay) : initialAnnualBasePay(row);
}

export function isCurrentJob(row: Pick<JobIncome, 'is_active' | 'effective_date' | 'end_date'>, date = todayIsoDate()): boolean {
  return row.is_active && (!row.effective_date || row.effective_date <= date) && (!row.end_date || row.end_date >= date);
}

export interface CompensationTotals {
  base: number;
  bonus: number;
  equity: number;
  other: number;
  gross: number;
  net: number;
}

export interface StockGrantSnapshot {
  realizedProceeds: number;
  sharesSold: number;
  remainingShares: number;
  valuationPrice: number;
  valuationDate: string;
  hasDatedValuation: boolean;
  remainingValue: number;
  totalValue: number;
}

export interface StockPurchaseSnapshot extends StockGrantSnapshot {
  employeeContribution: number;
  hasMarketPriceAtPurchase: boolean;
}

export interface StockSnapshot {
  realizedProceeds: number;
  remainingShares: number;
  remainingValue: number;
  totalValue: number;
  /** ESPP purchase basis supplied by the employee, not compensation. */
  employeeContributions: number;
}

/** Inclusive employment and query dates. Keep the cashflow convention of annual pay / 365.25. */
export function jobCompensationBetween(row: JobPay, start: string, end: string): CompensationTotals {
  const totals: CompensationTotals = { base: 0, bonus: 0, equity: 0, other: 0, gross: 0, net: 0 };
  if (!start || !end || end < start) return totals;
  const from = start > row.effective_date ? start : row.effective_date;
  const to = row.end_date && row.end_date < end ? row.end_date : end;
  const days = from <= to ? (Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / DAY_MS + 1 : 0;
  const promotions = [...(row.promotions || [])]
    .filter(item => item.date > from && item.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date));
  let cursor = from;
  let rate = annualBasePayAt(row, from);
  for (const promotion of promotions) {
    const segmentDays = (Date.parse(promotion.date + 'T00:00:00Z') - Date.parse(cursor + 'T00:00:00Z')) / DAY_MS;
    totals.base += rate * segmentDays / 365.25;
    cursor = promotion.date;
    rate = Number(promotion.annual_base_pay);
  }
  if (days > 0) {
    totals.base += rate * ((Date.parse(to + 'T00:00:00Z') - Date.parse(cursor + 'T00:00:00Z')) / DAY_MS + 1) / 365.25;
  }
  totals.bonus = (Number(row.annual_bonus) || 0) * days / 365.25;
  totals.equity = (Number(row.annual_equity) || 0) * days / 365.25;
  totals.other = (Number(row.annual_other) || 0) * days / 365.25;
  for (const payment of row.compensation_payments || []) {
    // A final bonus or equity payment can arrive after employment ends.
    if (payment.date >= start && payment.date <= end) totals[payment.kind] += Number(payment.amount) || 0;
  }
  totals.gross = totals.base + totals.bonus + totals.equity + totals.other;
  totals.net = totals.gross - ((Number(row.annual_taxes) || 0) + (Number(row.annual_deductions) || 0)) * days / 365.25;
  return totals;
}

/** Returns the latest usable price through the requested date. Invalid and future prices are ignored. */
export function latestStockValuationOnOrBefore(
  valuations: JobStockValuation[] = [],
  cutoff: string,
  lotDate = '0000-01-01',
  stockSymbol?: string | null
): JobStockValuation | undefined {
  if (!isValidIsoDate(cutoff)) return undefined;
  return [...valuations]
    .filter(item => isValidIsoDate(item.date)
      && item.date <= cutoff
      && (item.date >= lotDate || (Boolean(item.symbol) && isValidIsoDate(item.observed_date || '') && item.observed_date! >= lotDate && item.observed_date! <= cutoff))
      && (!item.symbol || item.symbol.trim().toUpperCase() === (stockSymbol || '').trim().toUpperCase())
      && Number.isFinite(Number(item.price_per_share))
      && Number(item.price_per_share) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1);
}

/** Replaces every same-day mark so one date has exactly one effective price. */
export function replaceStockValuation(
  valuations: JobStockValuation[] = [],
  valuation: JobStockValuation
): JobStockValuation[] {
  return [
    ...valuations.filter(item => item.date !== valuation.date),
    valuation,
  ].sort((a, b) => a.date.localeCompare(b.date));
}

/** Uses grant price until a dated company valuation on or after the award date is available. */
export function stockGrantSnapshot(
  grant: JobStockGrant,
  valuations: JobStockValuation[] = [],
  cutoff: string,
  stockSymbol?: string | null
): StockGrantSnapshot {
  const fallbackPrice = Number(grant.price_at_grant) || 0;
  if (!isValidIsoDate(cutoff) || !isValidIsoDate(grant.date) || cutoff < grant.date) {
    return { realizedProceeds: 0, sharesSold: 0, remainingShares: 0, valuationPrice: fallbackPrice, valuationDate: grant.date, hasDatedValuation: false, remainingValue: 0, totalValue: 0 };
  }
  const latest = latestStockValuationOnOrBefore(valuations, cutoff, grant.date, stockSymbol);
  const sales = (grant.sales || []).filter(item => isValidIsoDate(item.date) && item.date >= grant.date && item.date <= cutoff);
  const sharesSold = sales.reduce((sum, item) => sum + (Number(item.shares) || 0), 0);
  const realizedProceeds = sales.reduce((sum, item) => sum + (Number(item.cash_proceeds) || 0), 0);
  const remainingShares = Math.max(0, (Number(grant.quantity) || 0) - sharesSold);
  const valuationPrice = latest ? Number(latest.price_per_share) : fallbackPrice;
  const remainingValue = remainingShares * valuationPrice;
  return {
    realizedProceeds,
    sharesSold,
    remainingShares,
    valuationPrice,
    valuationDate: latest?.date || grant.date,
    hasDatedValuation: Boolean(latest),
    remainingValue,
    totalValue: realizedProceeds + remainingValue,
  };
}

/** Uses the employee's actual ESPP purchase price until a dated company valuation is available. */
export function stockPurchaseSnapshot(
  purchase: JobStockPurchase,
  valuations: JobStockValuation[] = [],
  cutoff: string,
  stockSymbol?: string | null
): StockPurchaseSnapshot {
  const paidPrice = Number(purchase.price_paid_per_share) || 0;
  const marketPrice = Number(purchase.market_price_at_purchase);
  const hasMarketPriceAtPurchase = purchase.market_price_at_purchase != null
    && Number.isFinite(marketPrice)
    && marketPrice >= 0;
  const fallbackPrice = hasMarketPriceAtPurchase ? marketPrice : paidPrice;
  if (!isValidIsoDate(cutoff) || !isValidIsoDate(purchase.date) || cutoff < purchase.date) {
    return {
      realizedProceeds: 0,
      sharesSold: 0,
      remainingShares: 0,
      valuationPrice: fallbackPrice,
      valuationDate: purchase.date,
      hasDatedValuation: false,
      remainingValue: 0,
      totalValue: 0,
      employeeContribution: 0,
      hasMarketPriceAtPurchase,
    };
  }
  const latest = latestStockValuationOnOrBefore(valuations, cutoff, purchase.date, stockSymbol);
  const sales = (purchase.sales || []).filter(item => isValidIsoDate(item.date) && item.date >= purchase.date && item.date <= cutoff);
  const sharesSold = sales.reduce((sum, item) => sum + (Number(item.shares) || 0), 0);
  const realizedProceeds = sales.reduce((sum, item) => sum + (Number(item.cash_proceeds) || 0), 0);
  const remainingShares = Math.max(0, (Number(purchase.quantity) || 0) - sharesSold);
  const valuationPrice = latest ? Number(latest.price_per_share) : fallbackPrice;
  const remainingValue = remainingShares * valuationPrice;
  return {
    realizedProceeds,
    sharesSold,
    remainingShares,
    valuationPrice,
    valuationDate: latest?.date || purchase.date,
    hasDatedValuation: Boolean(latest),
    remainingValue,
    totalValue: realizedProceeds + remainingValue,
    employeeContribution: (Number(purchase.quantity) || 0) * paidPrice,
    hasMarketPriceAtPurchase,
  };
}

export function stockSnapshotAt(row: JobStocks, cutoff: string): StockSnapshot {
  const total: StockSnapshot = { realizedProceeds: 0, remainingShares: 0, remainingValue: 0, totalValue: 0, employeeContributions: 0 };
  for (const grant of row.stock_grants || []) {
    const snapshot = stockGrantSnapshot(grant, row.stock_valuations || [], cutoff, row.stock_symbol);
    total.realizedProceeds += snapshot.realizedProceeds;
    total.remainingShares += snapshot.remainingShares;
    total.remainingValue += snapshot.remainingValue;
    total.totalValue += snapshot.totalValue;
  }
  for (const purchase of row.stock_purchases || []) {
    const snapshot = stockPurchaseSnapshot(purchase, row.stock_valuations || [], cutoff, row.stock_symbol);
    total.realizedProceeds += snapshot.realizedProceeds;
    total.remainingShares += snapshot.remainingShares;
    total.remainingValue += snapshot.remainingValue;
    total.totalValue += snapshot.totalValue;
    total.employeeContributions += snapshot.employeeContribution;
  }
  return total;
}

export function stockPortfolioValueAt(row: JobStocks, cutoff: string): number {
  return stockSnapshotAt(row, cutoff).totalValue;
}

/** Stock compensation excludes employee-funded ESPP contributions; award grants retain their full basis. */
export function stockCompensationValueAt(row: JobStocks, cutoff: string): number {
  const snapshot = stockSnapshotAt(row, cutoff);
  return snapshot.totalValue - snapshot.employeeContributions;
}

function dayBefore(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
}

/** Period stock compensation is the change in total economic value, so grant basis is counted once. */
export function stockCompensationBetween(row: JobStocks, start: string, end: string): number {
  if (!isValidIsoDate(start) || !isValidIsoDate(end) || end < start) return 0;
  return stockCompensationValueAt(row, end) - stockCompensationValueAt(row, dayBefore(start));
}

/** Sale proceeds are cash events; grant value and unrealized gains remain outside cashflow. */
export function stockSalesProceedsBetween(row: JobStocks, start: string, end: string): number {
  if (!start || !end || end < start) return 0;
  const grantProceeds = (row.stock_grants || []).reduce((total, grant) => total + (grant.sales || [])
    .filter(sale => sale.date >= start && sale.date <= end)
    .reduce((sum, sale) => sum + (Number(sale.cash_proceeds) || 0), 0), 0);
  const purchaseProceeds = (row.stock_purchases || []).reduce((total, purchase) => total + (purchase.sales || [])
    .filter(sale => sale.date >= start && sale.date <= end)
    .reduce((sum, sale) => sum + (Number(sale.cash_proceeds) || 0), 0), 0);
  return grantProceeds + purchaseProceeds;
}

export interface EmployerCompensation extends CompensationTotals {
  employer: string;
  jobs: number;
  stock_compensation: number;
  /** Cash-only take-home estimate; stock compensation is shown pre-tax in gross. */
  net: number;
  /** All sale proceeds locked through the selected through-date. */
  stockCashProceeds: number;
  /** Remaining grant shares at the selected through-date valuation. */
  stockRemainingValue: number;
  /** Employee-funded ESPP purchase basis, shown separately from compensation. */
  stockEmployeeContributions: number;
}

export function compensationByEmployer(rows: JobIncome[], start: string, end: string): EmployerCompensation[] {
  const employers = new Map<string, EmployerCompensation>();
  for (const row of rows) {
    const name = row.employer.trim();
    const key = name.toLocaleLowerCase();
    const total = employers.get(key) || {
      employer: name, jobs: 0, base: 0, bonus: 0, equity: 0, other: 0,
      gross: 0, net: 0, stock_compensation: 0, stockCashProceeds: 0, stockRemainingValue: 0, stockEmployeeContributions: 0,
    };
    const pay = jobCompensationBetween(row, start, end);
    const stocks = stockSnapshotAt(row, end);
    const stockCompensation = stockCompensationBetween(row, start, end);
    total.jobs += 1;
    for (const field of ['base', 'bonus', 'equity', 'other', 'net'] as const) total[field] += pay[field];
    total.stock_compensation += stockCompensation;
    total.stockCashProceeds += stocks.realizedProceeds;
    total.stockRemainingValue += stocks.remainingValue;
    total.stockEmployeeContributions += stocks.employeeContributions;
    total.gross += pay.gross + stockCompensation;
    employers.set(key, total);
  }
  return [...employers.values()].sort((a, b) => b.gross - a.gross || a.employer.localeCompare(b.employer));
}

export function isValidIsoDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const time = Date.parse(date + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date;
}

export function jobHistoryError(row: JobIncomeCreate): string | null {
  if (!isValidIsoDate(row.effective_date)) return 'A valid start date is required.';
  if (row.end_date && (!isValidIsoDate(row.end_date) || row.end_date < row.effective_date)) return 'End date must be on or after the start date.';
  const stockSymbol = row.stock_symbol?.trim();
  if (stockSymbol && !/^[A-Z0-9.\-]{1,10}$/i.test(stockSymbol)) return 'Stock ticker must be 1–10 letters, numbers, dots, or hyphens.';
  const dates = new Set<string>();
  for (const promotion of row.promotions || []) {
    if (!isValidIsoDate(promotion.date) || promotion.date <= row.effective_date || (row.end_date && promotion.date > row.end_date)) return 'Promotion dates must be after the start date and on or before the end date.';
    if (dates.has(promotion.date)) return 'Use one promotion per date.';
    dates.add(promotion.date);
    if (!Number.isFinite(promotion.annual_base_pay) || promotion.annual_base_pay < 0) return 'Promotion pay must be non-negative.';
  }
  for (const payment of row.compensation_payments || []) {
    if (!isValidIsoDate(payment.date) || payment.date < row.effective_date) return 'Payment dates must be on or after the start date.';
    if (!['bonus', 'equity', 'other'].includes(payment.kind) || !Number.isFinite(payment.amount) || payment.amount < 0) return 'Payment amounts must be non-negative.';
  }
  const valuationDates = new Set<string>();
  for (const valuation of row.stock_valuations || []) {
    if (!isValidIsoDate(valuation.date)) return 'Stock valuation dates must be valid calendar dates.';
    const isTaggedMarketQuote = Boolean(valuation.symbol) && valuation.source !== 'manual';
    if (isTaggedMarketQuote) {
      const observedDate = valuation.observed_date || '';
      if (!/^[A-Z0-9.\-]{1,10}$/i.test(valuation.symbol || '')
        || !isValidIsoDate(observedDate)
        || observedDate > todayIsoDate()
        || valuation.date > observedDate) {
        return 'Market quote dates and ticker must be valid and cannot be in the future.';
      }
      if (valuation.price_as_of != null) {
        const fetchedAt = Date.parse(valuation.price_as_of);
        const endOfObservedDate = Date.parse(`${observedDate}T23:59:59.999Z`);
        if (!Number.isFinite(fetchedAt) || fetchedAt > endOfObservedDate) return 'Market quote fetch time must be valid and no later than its observed date.';
      }
    } else if (valuation.date < row.effective_date) {
      return 'Manual stock valuation dates must be on or after the job start date.';
    }
    if (valuationDates.has(valuation.date)) return 'Use one stock valuation per date.';
    valuationDates.add(valuation.date);
    if (!Number.isFinite(valuation.price_per_share) || valuation.price_per_share < 0) return 'Stock valuation prices must be non-negative.';
  }
  for (const grant of row.stock_grants || []) {
    if (!isValidIsoDate(grant.date) || grant.date < row.effective_date) return 'Stock grant dates must be on or after the job start date.';
    if (!['bonus', 'equity'].includes(grant.origin)) return 'Stock grant origin must be bonus or equity.';
    if (!Number.isFinite(grant.quantity) || grant.quantity <= 0 || !Number.isFinite(grant.price_at_grant) || grant.price_at_grant <= 0) return 'Stock grant shares and grant price must be positive.';
    let soldShares = 0;
    for (const sale of [...(grant.sales || [])].sort((a, b) => a.date.localeCompare(b.date))) {
      if (!isValidIsoDate(sale.date) || sale.date < grant.date) return 'Stock sale dates must be on or after the grant date.';
      if (!Number.isFinite(sale.shares) || sale.shares <= 0 || !Number.isFinite(sale.cash_proceeds) || sale.cash_proceeds < 0) return 'Stock sale shares must be positive and proceeds must be non-negative.';
      soldShares += sale.shares;
      if (soldShares > grant.quantity + 1e-8) return 'Stock sales cannot exceed the grant share quantity.';
    }
  }
  for (const purchase of row.stock_purchases || []) {
    if (!isValidIsoDate(purchase.date) || purchase.date < row.effective_date) return 'ESPP purchase dates must be on or after the job start date.';
    if (!Number.isFinite(purchase.quantity) || purchase.quantity <= 0 || !Number.isFinite(purchase.price_paid_per_share) || purchase.price_paid_per_share < 0) return 'ESPP shares must be positive and the employee purchase price must be non-negative.';
    if (purchase.market_price_at_purchase != null && (!Number.isFinite(purchase.market_price_at_purchase) || purchase.market_price_at_purchase < 0)) return 'ESPP market price at purchase must be non-negative.';
    let soldShares = 0;
    for (const sale of [...(purchase.sales || [])].sort((a, b) => a.date.localeCompare(b.date))) {
      if (!isValidIsoDate(sale.date) || sale.date < purchase.date) return 'ESPP sale dates must be on or after the purchase date.';
      if (!Number.isFinite(sale.shares) || sale.shares <= 0 || !Number.isFinite(sale.cash_proceeds) || sale.cash_proceeds < 0) return 'ESPP sale shares must be positive and proceeds must be non-negative.';
      soldShares += sale.shares;
      if (soldShares > purchase.quantity + 1e-8) return 'ESPP sales cannot exceed the purchased share quantity.';
    }
  }
  return null;
}
