import {
  Asset,
  CashflowSummary,
  FixedExpense,
  Holding,
  JobIncome,
  Liability,
  NetWorth,
  Subscription,
  Transaction,
} from '../models/transaction.model';
import { annualBasePayAt, jobCompensationBetween, stockSalesProceedsBetween } from '../utils/job-compensation.util';
import { todayIsoDate } from '../utils/date.util';

export function computeNetWorth(
  assets: Asset[],
  liabilities: Liability[],
  holdings: Holding[]
): NetWorth {
  const other_assets = assets.reduce((sum, a) => sum + (Number(a.current_value) || 0), 0);
  const portfolio_sources: Record<string, string> = {};
  const portfolio_breakdown: Record<string, number> = {};
  let portfolio = 0;
  const activeHoldings = holdings.filter(h => h.lifecycle_status !== 'inactive' && h.lifecycle_status !== 'staged');
  for (const h of activeHoldings) {
    const shares = Number(h.shares) || 0;
    const exactValue = h.market_value == null ? null : Number(h.market_value);
    const enrichedValue = h.value == null ? null : Number(h.value);
    const price = h.current_price ?? h.purchase_price;
    const value = exactValue != null && Number.isFinite(exactValue)
      ? exactValue
      : enrichedValue != null && Number.isFinite(enrichedValue)
        ? enrichedValue
        : price == null || !Number.isFinite(Number(price))
          ? 0
          : Number(price) * shares;
    portfolio += value;
    const symbol = (h.symbol || '').trim().toUpperCase() || `holding-${h.id}`;
    portfolio_sources[symbol] = h.price_source || 'manual';
    portfolio_breakdown[symbol] = (portfolio_breakdown[symbol] || 0) + value;
  }
  const liab = liabilities.reduce((sum, l) => sum + (Number(l.balance_owed) || 0), 0);
  return {
    other_assets,
    portfolio,
    liabilities: liab,
    total_assets: other_assets + portfolio,
    total: other_assets + portfolio - liab,
    as_of: new Date().toISOString(),
    portfolio_sources: activeHoldings.length ? portfolio_sources : undefined,
    portfolio_breakdown: activeHoldings.length ? portfolio_breakdown : undefined,
  };
}

export interface TransactionEffects {
  income: number;
  spending: number;
}

/** Shared recorded-ledger semantics. Legacy rows without `kind` keep their income/expense behavior. */
export function transactionEffects(tx: Transaction): TransactionEffects {
  const amount = Math.abs(Number(tx.amount) || 0);
  switch (tx.kind) {
    case 'purchase': return { income: 0, spending: amount };
    case 'refund': return { income: 0, spending: -amount };
    case 'income': return { income: amount, spending: 0 };
    case 'payment':
    case 'transfer':
    case 'ambiguous_credit': return { income: 0, spending: 0 };
    default:
      return tx.type === 'income' ? { income: amount, spending: 0 } : { income: 0, spending: amount };
  }
}

export function transactionIncome(tx: Transaction): number {
  return transactionEffects(tx).income;
}

export function transactionSpending(tx: Transaction): number {
  return transactionEffects(tx).spending;
}

function monthlyAmount(amount: number, frequency: string): number {
  switch (frequency) {
    case 'annual':
      return amount / 12;
    case 'quarterly':
      return amount / 3;
    case 'biweekly':
      return (amount * 26) / 12;
    case 'weekly':
      return (amount * 52) / 12;
    case 'semimonthly':
      return amount * 2;
    case 'hourly':
      return amount * 40 * 52 / 12;
    case 'monthly':
    default:
      return amount;
  }
}

export function enrichJobIncome(row: JobIncome): JobIncome {
  const annual_base_pay = annualBasePayAt(row);
  const monthly_gross = annual_base_pay / 12;
  const annual_bonus = Number(row.annual_bonus) || 0;
  const annual_equity = Number(row.annual_equity) || 0;
  const annual_other = Number(row.annual_other) || 0;
  const annual_taxes = Number(row.annual_taxes) || 0;
  const annual_deductions = Number(row.annual_deductions) || 0;
  const annual_gross = annual_base_pay + annual_bonus + annual_equity + annual_other;
  const annual_net = annual_gross - annual_taxes - annual_deductions;
  const monthly_net = annual_net / 12;
  return {
    ...row,
    pay_periods_per_year: row.pay_periods_per_year || 12,
    annual_base_pay,
    annual_gross,
    monthly_gross,
    period_gross: monthly_gross,
    period_net: monthly_net,
    annual_net,
    monthly_net,
  };
}

export function enrichFixedExpense(row: FixedExpense): FixedExpense {
  const monthly = monthlyAmount(Number(row.amount) || 0, row.frequency);
  return {
    ...row,
    next_due_date: row.is_active ? nextDueDate(row.start_date, row.frequency, row.due_day, row.end_date) : null,
    monthly_amount: monthly,
    annual_amount: monthly * 12,
  };
}

export function enrichSubscription(row: Subscription): Subscription {
  const monthly = monthlyAmount(Number(row.amount) || 0, row.frequency);
  return {
    ...row,
    next_due_date: row.is_active ? nextDueDate(row.next_bill_date, row.frequency, null, row.end_date) : null,
    monthly_amount: monthly,
    annual_amount: monthly * 12,
  };
}

export function enrichHolding(row: Holding): Holding {
  const shares = Number(row.shares) || 0;
  const priceSource = row.price_source === 'unavailable' ? null : row.current_price ?? row.purchase_price;
  const current = priceSource == null || !Number.isFinite(Number(priceSource)) ? null : Number(priceSource);
  const importedValue = row.market_value == null ? null : Number(row.market_value);
  const value = importedValue != null && Number.isFinite(importedValue)
    ? importedValue
    : current == null
      ? null
      : shares * current;
  return {
    ...row,
    current_price: current == null ? undefined : current,
    value,
  };
}

interface IsoDateParts {
  year: number;
  month: number;
  day: number;
}

const DAY_MS = 86_400_000;

function isoDateParts(value: string | null | undefined): IsoDateParts | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return null;
  const [year, month, day] = value.split('-').map(Number);
  return { year, month, day };
}

function recurrenceIntervalDays(frequency: string): number | null {
  if (frequency === 'weekly') return 7;
  if (frequency === 'biweekly') return 14;
  return null;
}

function recurrenceIntervalMonths(frequency: string): number {
  if (frequency === 'quarterly') return 3;
  if (frequency === 'annual') return 12;
  return 1;
}

function normalizedDueDay(dueDay: number | null | undefined, fallback: number): number {
  const value = Number(dueDay);
  return Number.isInteger(value) && value >= 1 && value <= 31 ? value : fallback;
}

function addDays(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function anchoredOccurrence(
  start: string,
  frequency: string,
  index: number,
  dueDay?: number | null,
): string {
  const anchor = isoDateParts(start)!;
  const intervalDays = recurrenceIntervalDays(frequency);
  if (intervalDays !== null) return addDays(start, intervalDays * index);

  const intervalMonths = recurrenceIntervalMonths(frequency);
  const monthIndex = anchor.year * 12 + anchor.month - 1 + intervalMonths * index;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(normalizedDueDay(dueDay, anchor.day), lastDay);
  return `${String(targetYear).padStart(4, '0')}-${String(targetMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function recurrenceIndexAtOrAfter(start: string, target: string, frequency: string): number {
  const intervalDays = recurrenceIntervalDays(frequency);
  if (intervalDays !== null) {
    const days = (Date.parse(`${target}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS;
    return Math.max(0, Math.floor(days / intervalDays));
  }

  const anchor = isoDateParts(start)!;
  const targetDate = isoDateParts(target)!;
  const months = (targetDate.year - anchor.year) * 12 + targetDate.month - anchor.month;
  return Math.max(0, Math.floor(months / recurrenceIntervalMonths(frequency)));
}

function firstOccurrenceOnOrAfter(
  start: string,
  frequency: string,
  dueDay: number | null | undefined,
  target: string,
): { index: number; date: string } {
  let index = recurrenceIndexAtOrAfter(start, target, frequency);
  let occurrence = anchoredOccurrence(start, frequency, index, dueDay);
  while (occurrence < target) {
    index += 1;
    occurrence = anchoredOccurrence(start, frequency, index, dueDay);
  }
  return { index, date: occurrence };
}

/** Finds the next scheduled date, or null when no date remains before the end date. */
export function nextDueDate(
  start: string | null | undefined,
  frequency: string,
  dueDay?: number | null,
  endDate?: string | null,
  asOf = todayIsoDate(),
): string | null {
  if (!start || !isoDateParts(start) || !isoDateParts(asOf)) return null;
  if (endDate && !isoDateParts(endDate)) return null;
  const target = start > asOf ? start : asOf;
  const occurrence = firstOccurrenceOnOrAfter(start, frequency, dueDay, target).date;
  return endDate && occurrence > endDate ? null : occurrence;
}

function occurrencesBetween(
  start: string,
  frequency: string,
  rangeStart: string,
  rangeEnd: string,
  endDate?: string | null,
  dueDay?: number | null,
): string[] {
  if (rangeEnd < rangeStart || !isoDateParts(start) || !isoDateParts(rangeStart) || !isoDateParts(rangeEnd)) return [];
  if (endDate && !isoDateParts(endDate)) return [];
  const target = start > rangeStart ? start : rangeStart;
  const first = firstOccurrenceOnOrAfter(start, frequency, dueDay, target);
  let index = first.index;
  let cursor = first.date;
  const occurrences: string[] = [];
  while (cursor <= rangeEnd && (!endDate || cursor <= endDate)) {
    occurrences.push(cursor);
    index += 1;
    cursor = anchoredOccurrence(start, frequency, index, dueDay);
  }
  return occurrences;
}

export function computeCashflowSummary(
  start: string,
  end: string,
  transactions: Transaction[],
  jobIncomes: JobIncome[],
  fixedExpenses: FixedExpense[],
  subscriptions: Subscription[]
): CashflowSummary {
  let transaction_income = 0;
  let transaction_expenses = 0;
  for (const tx of transactions) {
    if (tx.date < start || tx.date > end) continue;
    const effect = transactionEffects(tx);
    transaction_income += effect.income;
    transaction_expenses += effect.spending;
  }
  const daysInRange = Math.max(1, (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 + 1);
  const scheduledEmploymentIncome = jobIncomes
    .filter(row => row.is_active)
    .reduce((sum, row) => sum + jobCompensationBetween(row, start, end).net, 0);
  // A recorded share sale is a dated cash event, even when the former job is disabled.
  const stockSaleIncome = jobIncomes.reduce((sum, row) => sum + stockSalesProceedsBetween(row, start, end), 0);
  const planned_income = scheduledEmploymentIncome + stockSaleIncome;
  const fixedOccurrences = fixedExpenses
    .filter(row => row.is_active)
    .flatMap(row => occurrencesBetween(row.start_date, row.frequency, start, end, row.end_date, row.due_day).map(date => ({ date, name: row.name, category: row.category, amount: Number(row.amount) || 0 })));
  const subscriptionOccurrences = subscriptions
    .filter(row => row.is_active)
    .flatMap(row => occurrencesBetween(row.next_bill_date, row.frequency, start, end, row.end_date).map(date => ({ date, name: row.name, category: row.category, amount: Number(row.amount) || 0 })));
  const fixed_total = fixedOccurrences.reduce((sum, row) => sum + row.amount, 0);
  const sub_total = subscriptionOccurrences.reduce((sum, row) => sum + row.amount, 0);
  const roundedIncome = Math.round(planned_income * 100) / 100;
  const roundedFixed = Math.round(fixed_total * 100) / 100;
  const roundedSubscriptions = Math.round(sub_total * 100) / 100;
  const observed_income = Math.round(transaction_income * 100) / 100;
  const observed_expenses = Math.round(transaction_expenses * 100) / 100;
  const observed_net_cashflow = Math.round((observed_income - observed_expenses) * 100) / 100;
  const scheduled_income = roundedIncome;
  const scheduled_expenses = Math.round((roundedFixed + roundedSubscriptions) * 100) / 100;
  const scheduled_net_cashflow = Math.round((scheduled_income - scheduled_expenses) * 100) / 100;
  // Combined outlook always sums observed + scheduled (additive). Overlap flags warn when both planes are non-zero.
  const total_income = Math.round((transaction_income + roundedIncome) * 100) / 100;
  const total_expenses = Math.round((transaction_expenses + roundedFixed + roundedSubscriptions) * 100) / 100;
  const net_cashflow = Math.round((total_income - total_expenses) * 100) / 100;
  return {
    start_date: start,
    end_date: end,
    transaction_income,
    transaction_expenses,
    planned_income: roundedIncome,
    fixed_expenses: roundedFixed,
    subscriptions: roundedSubscriptions,
    observed_income,
    observed_expenses,
    observed_net_cashflow,
    scheduled_income,
    scheduled_expenses,
    scheduled_net_cashflow,
    combined_outlook_net_cashflow: net_cashflow,
    possible_income_overlap: observed_income > 0 && scheduled_income > 0,
    possible_expense_overlap: observed_expenses > 0 && scheduled_expenses > 0,
    total_income,
    total_expenses,
    net_cashflow,
    savings_rate: total_income > 0 ? (net_cashflow / total_income) * 100 : null,
    average_daily_spend: total_expenses / daysInRange,
    fixed_occurrences: fixedOccurrences.sort((a, b) => a.date.localeCompare(b.date)),
    subscription_occurrences: subscriptionOccurrences.sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export function monthEnd(month: string): string {
  const [year, monthNum] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
  return `${month}-${String(last).padStart(2, '0')}`;
}

export function lastCalendarMonths(count: number, from = new Date()): string[] {
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const cursor = new Date(from.getFullYear(), from.getMonth() - i, 1);
    months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

export function monthlyCashflowSeries(
  months: string[],
  transactions: Transaction[],
  jobIncomes: JobIncome[],
  fixedExpenses: FixedExpense[],
  subscriptions: Subscription[],
  view: 'recorded' | 'scheduled' | 'combined' = 'recorded'
): { month: string; income: number; expense: number; net: number }[] {
  return months.map(month => {
    const summary = computeCashflowSummary(
      `${month}-01`,
      monthEnd(month),
      transactions,
      jobIncomes,
      fixedExpenses,
      subscriptions
    );
    const income = view === 'recorded' ? summary.observed_income
      : view === 'scheduled' ? summary.scheduled_income : summary.total_income;
    const expense = view === 'recorded' ? summary.observed_expenses
      : view === 'scheduled' ? summary.scheduled_expenses : summary.total_expenses;
    return {
      month,
      income,
      expense,
      net: income - expense,
    };
  });
}
