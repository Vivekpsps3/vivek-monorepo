import {
  Asset,
  CashflowOccurrence,
  CashflowSummary,
  FixedExpense,
  Holding,
  IncomeCashflowOccurrence,
  JobIncome,
  Liability,
  NetWorth,
  Subscription,
  Transaction,
} from '../models/transaction.model';
import {
  annualBasePayAt,
  estimatedPaycheckNet,
  hasPaydaySchedule,
  jobCompensationBetween,
  paydayDatesBetween,
} from '../utils/job-compensation.util';
import { countableCents, dollarsFromCountedCents, fromDollars, roundHalfAwayFromZero, todayIsoDate, type Cents } from '@vivek/browser';

/**
 * Decision pending Vivek.
 * true: a legacy transaction whose sign isn't allowed is excluded and badged.
 * false: count the absolute value, which is what main did before F1.
 * The default never applies abs and never drops the row without a badge.
 */
export const FLAG_DISALLOWED_TRANSACTION_SIGNS = true;

function dollarsFromCents(cents: Cents): number {
  const dollars = dollarsFromCountedCents(cents);
  return Number.isFinite(dollars) ? dollars : 0;
}

/** Count a stored dollar amount, or flag it when it cannot be summed safely. */
function takeCents(value: unknown, mode: 'nonNegative' | 'positive'): { cents: Cents; excluded: boolean } {
  if (value == null || value === '') return { cents: 0, excluded: false };
  const cents = countableCents(value, mode);
  if (cents == null) return { cents: 0, excluded: true };
  return { cents, excluded: false };
}

function holdingDollars(holding: Holding): number | null {
  const shares = Number(holding.shares) || 0;
  const exactValue = holding.market_value == null ? null : Number(holding.market_value);
  const enrichedValue = holding.value == null ? null : Number(holding.value);
  const price = holding.current_price ?? holding.purchase_price;
  if (exactValue != null && Number.isFinite(exactValue)) return exactValue;
  if (enrichedValue != null && Number.isFinite(enrichedValue)) return enrichedValue;
  if (price == null || !Number.isFinite(Number(price))) return null;
  return Number(price) * shares;
}

export function computeNetWorth(
  assets: Asset[],
  liabilities: Liability[],
  holdings: Holding[]
): NetWorth {
  let excluded = 0;
  let otherCents = 0;
  for (const asset of assets) {
    const taken = takeCents(asset.current_value, 'nonNegative');
    otherCents += taken.cents;
    if (taken.excluded) excluded += 1;
  }
  const portfolio_sources: Record<string, string> = {};
  const portfolio_breakdown: Record<string, number> = {};
  let portfolioCents = 0;
  const activeHoldings = holdings.filter(h => h.lifecycle_status !== 'inactive' && h.lifecycle_status !== 'staged');
  for (const holding of activeHoldings) {
    const dollars = holdingDollars(holding);
    const taken = dollars == null ? { cents: 0, excluded: false } : takeCents(dollars, 'nonNegative');
    portfolioCents += taken.cents;
    if (taken.excluded) excluded += 1;
    const symbol = (holding.symbol || '').trim().toUpperCase() || `holding-${holding.id}`;
    portfolio_sources[symbol] = holding.price_source || 'manual';
    const previous = fromDollars(portfolio_breakdown[symbol] ?? 0) ?? 0;
    portfolio_breakdown[symbol] = dollarsFromCents(previous + taken.cents);
  }
  let liabilityCents = 0;
  for (const liability of liabilities) {
    const taken = takeCents(liability.balance_owed, 'nonNegative');
    liabilityCents += taken.cents;
    if (taken.excluded) excluded += 1;
  }
  const other_assets = dollarsFromCents(otherCents);
  const portfolio = dollarsFromCents(portfolioCents);
  const liab = dollarsFromCents(liabilityCents);
  const totalAssetsCents = otherCents + portfolioCents;
  const totalCents = totalAssetsCents - liabilityCents;
  return {
    other_assets,
    portfolio,
    liabilities: liab,
    total_assets: dollarsFromCents(totalAssetsCents),
    total: dollarsFromCents(totalCents),
    as_of: new Date().toISOString(),
    portfolio_sources: activeHoldings.length ? portfolio_sources : undefined,
    portfolio_breakdown: activeHoldings.length ? portfolio_breakdown : undefined,
    excluded_invalid_amounts: excluded,
  };
}

export interface TransactionEffects {
  income: number;
  spending: number;
  /** Present when the stored amount is left out of totals. */
  excluded?: boolean;
}

function directedEffects(tx: Transaction, amount: number): TransactionEffects {
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

/** Shared recorded-ledger semantics. Legacy rows without `kind` keep their income/expense behavior. */
export function transactionEffects(
  tx: Transaction,
  options?: { flagDisallowed?: boolean },
): TransactionEffects {
  const flagDisallowed = options?.flagDisallowed ?? FLAG_DISALLOWED_TRANSACTION_SIGNS;
  const raw = Number(tx.amount);
  const cents = Number.isFinite(raw) ? fromDollars(raw) : null;
  const signDisallowed = cents != null && cents < 0;
  if (cents == null || (signDisallowed && flagDisallowed)) {
    return { income: 0, spending: 0, excluded: true };
  }
  if (signDisallowed) {
    const absolute = fromDollars(Math.abs(raw));
    return directedEffects(tx, absolute == null ? 0 : dollarsFromCents(absolute));
  }
  return directedEffects(tx, dollarsFromCents(cents));
}

export function transactionIncome(tx: Transaction): number {
  return transactionEffects(tx).income;
}

export function transactionSpending(tx: Transaction): number {
  return transactionEffects(tx).spending;
}

function monthlyAmount(amount: number, frequency: string): number {
  const cents = fromDollars(Number(amount));
  if (cents == null) return 0;
  const scaled = (numerator: number, denominator: number) =>
    dollarsFromCents(roundHalfAwayFromZero((cents * numerator) / denominator));
  switch (frequency) {
    case 'annual':
      return scaled(1, 12);
    case 'quarterly':
      return scaled(1, 3);
    case 'biweekly':
      return scaled(26, 12);
    case 'weekly':
      return scaled(52, 12);
    case 'semimonthly':
      return dollarsFromCents(cents * 2);
    case 'hourly':
      return scaled(40 * 52, 12);
    case 'monthly':
    default:
      return dollarsFromCents(cents);
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

const SAME_PAY_STREAM = 0.2;
const BILL_MATCH_DAYS = 4;

function dayDistance(left: string, right: string): number {
  return Math.abs(Date.parse(`${left}T00:00:00Z`) - Date.parse(`${right}T00:00:00Z`)) / 86_400_000;
}

function amountsMatch(posted: number, expected: number): boolean {
  const scale = Math.max(Math.abs(posted), Math.abs(expected), 1);
  return Math.abs(posted - expected) <= Math.max(1, scale * 0.02);
}

/**
 * Pay that shows up both as a deposit and as job pay is one stream when the
 * two totals are within 20%. A much smaller or larger deposit is other income
 * and stays in the total.
 */
export function unifyIncome(observed: number, scheduled: number): number {
  const posted = Math.round(observed * 100) / 100;
  const repeating = Math.round(scheduled * 100) / 100;
  if (posted <= 0 || repeating <= 0) return Math.round((posted + repeating) * 100) / 100;
  const scale = Math.max(posted, repeating);
  if (Math.abs(posted - repeating) / scale <= SAME_PAY_STREAM) return Math.max(posted, repeating);
  return Math.round((posted + repeating) * 100) / 100;
}

export function incomeStreamsMatch(observed: number, scheduled: number): boolean {
  if (observed <= 0 || scheduled <= 0) return false;
  return Math.abs(observed - scheduled) / Math.max(observed, scheduled) <= SAME_PAY_STREAM;
}

/** Bills already posted as a transaction within four days and 2% (or $1). Each posted row matches at most one bill. */
export function unmatchedScheduledExpenses(
  transactions: Transaction[],
  occurrences: CashflowOccurrence[],
  start: string,
  end: string,
): CashflowOccurrence[] {
  const posted = transactions
    .filter(tx => tx.date >= start && tx.date <= end)
    .map(tx => ({ date: tx.date, spending: transactionEffects(tx).spending, used: false }))
    .filter(tx => tx.spending > 0);
  const unmatched: CashflowOccurrence[] = [];
  for (const occurrence of occurrences) {
    let best = -1;
    let bestScore = Number.POSITIVE_INFINITY;
    posted.forEach((tx, index) => {
      if (tx.used) return;
      const days = dayDistance(tx.date, occurrence.date);
      if (days > BILL_MATCH_DAYS || !amountsMatch(tx.spending, occurrence.amount)) return;
      const score = days * 1000 + Math.abs(tx.spending - occurrence.amount);
      if (score < bestScore) {
        bestScore = score;
        best = index;
      }
    });
    if (best >= 0) posted[best].used = true;
    else unmatched.push(occurrence);
  }
  return unmatched;
}

export function computeCashflowSummary(
  start: string,
  end: string,
  transactions: Transaction[],
  jobIncomes: JobIncome[],
  fixedExpenses: FixedExpense[],
  subscriptions: Subscription[]
): CashflowSummary {
  const income_occurrences: IncomeCashflowOccurrence[] = [];
  let transactionIncomeCents = 0;
  let transactionExpenseCents = 0;
  const money = (value: number) => {
    const cents = fromDollars(value);
    return cents == null ? 0 : dollarsFromCents(cents);
  };
  const pushIncome = (
    id: string,
    date: string | null,
    kind: IncomeCashflowOccurrence['kind'],
    label: string,
    name: string,
    detail: string,
    amount: number,
  ) => {
    const rounded = money(amount);
    if (rounded !== 0) income_occurrences.push({ id, date, kind, label, name, detail, amount: rounded });
  };
  for (const tx of transactions) {
    if (tx.date < start || tx.date > end) continue;
    const effect = transactionEffects(tx);
    if (!effect.excluded) {
      transactionIncomeCents += fromDollars(effect.income) ?? 0;
      transactionExpenseCents += fromDollars(effect.spending) ?? 0;
    }
    if (effect.income > 0) {
      pushIncome(
        `posted:${tx.id}`,
        tx.date,
        'posted',
        'Recorded income',
        tx.merchant?.trim() || tx.description?.trim() || tx.category || 'Income transaction',
        [tx.category, tx.source === 'import' ? 'Imported transaction' : 'Recorded transaction'].filter(Boolean).join(' · '),
        effect.income,
      );
    }
  }
  const daysInRange = Math.max(1, (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 + 1);
  for (const row of jobIncomes) {
    if (row.is_active) {
      const compensation = jobCompensationBetween(row, start, end);
      const employmentStart = start > row.effective_date ? start : row.effective_date;
      const employmentEnd = row.end_date && row.end_date < end ? row.end_date : end;
      const employmentDays = employmentStart <= employmentEnd
        ? (Date.parse(`${employmentEnd}T00:00:00Z`) - Date.parse(`${employmentStart}T00:00:00Z`)) / 86_400_000 + 1
        : 0;
      const employer = row.employer || 'Job';
      const payments = (row.compensation_payments || []).filter(payment => payment.date >= start && payment.date <= end);

      if (hasPaydaySchedule(row)) {
        paydayDatesBetween(row, start, end).forEach((date, index) => {
          pushIncome(
            `paycheck:${row.id}:${date}:${index}`,
            date,
            'paycheck',
            'Projected paycheck',
            employer,
            `${row.payday_frequency} pay schedule · estimated net`,
            estimatedPaycheckNet(row, date),
          );
        });
        const proratedDays = employmentDays / 365.25;
        pushIncome(`estimate:${row.id}:bonus`, null, 'estimate', 'Annual bonus estimate', employer,
          'Undated estimate; no payout date recorded', (Number(row.annual_bonus) || 0) * proratedDays);
        pushIncome(`estimate:${row.id}:equity`, null, 'estimate', 'Annual equity estimate', employer,
          'Undated estimate; no payout or vesting date recorded', (Number(row.annual_equity) || 0) * proratedDays);
        pushIncome(`estimate:${row.id}:other`, null, 'estimate', 'Other annual pay estimate', employer,
          'Undated estimate; no payout date recorded', (Number(row.annual_other) || 0) * proratedDays);
      } else {
        const proratedDays = employmentDays / 365.25;
        pushIncome(`estimate:${row.id}:base`, null, 'estimate', 'Base pay estimate', employer,
          'Pay dates not set · accrued estimate with unknown timing', compensation.base);
        pushIncome(`estimate:${row.id}:bonus`, null, 'estimate', 'Annual bonus estimate', employer,
          'Undated estimate; no payout date recorded', (Number(row.annual_bonus) || 0) * proratedDays);
        pushIncome(`estimate:${row.id}:equity`, null, 'estimate', 'Annual equity estimate', employer,
          'Undated estimate; no payout or vesting date recorded', (Number(row.annual_equity) || 0) * proratedDays);
        pushIncome(`estimate:${row.id}:other`, null, 'estimate', 'Other annual pay estimate', employer,
          'Undated estimate; no payout date recorded', (Number(row.annual_other) || 0) * proratedDays);
        pushIncome(`estimate:${row.id}:withholding`, null, 'estimate', 'Estimated taxes and deductions', employer,
          'Undated estimate deducted from projected job pay', -((Number(row.annual_taxes) || 0) + (Number(row.annual_deductions) || 0)) * proratedDays);
      }

      payments.forEach((payment, index) => pushIncome(
        `compensation:${row.id}:${payment.date}:${payment.kind}:${index}`,
        payment.date,
        'compensation',
        payment.kind === 'bonus' ? 'Dated bonus payment' : payment.kind === 'equity' ? 'Dated equity payment' : 'Dated other payment',
        employer,
        payment.label?.trim() || 'Recorded payment',
        Number(payment.amount) || 0,
      ));
    }

    // Sale proceeds are dated cash events even after a job is disabled.
    (row.stock_grants || []).forEach((grant, grantIndex) => (grant.sales || []).forEach((sale, saleIndex) => {
      if (sale.date < start || sale.date > end) return;
      const symbol = row.stock_symbol?.trim();
      const shares = Number(sale.shares) || 0;
      pushIncome(`grant-sale:${row.id}:${grantIndex}:${saleIndex}`, sale.date, 'stock_sale', 'Stock grant sale', row.employer || 'Former employer',
        `${grant.label?.trim() || (grant.origin === 'bonus' ? 'Stock bonus' : 'Equity grant')}${symbol ? ` · ${symbol}` : ''} · ${shares} shares sold`,
        Number(sale.cash_proceeds) || 0);
    }));
    (row.stock_purchases || []).forEach((purchase, purchaseIndex) => (purchase.sales || []).forEach((sale, saleIndex) => {
      if (sale.date < start || sale.date > end) return;
      const symbol = row.stock_symbol?.trim();
      const shares = Number(sale.shares) || 0;
      pushIncome(`espp-sale:${row.id}:${purchaseIndex}:${saleIndex}`, sale.date, 'stock_sale', 'ESPP sale', row.employer || 'Former employer',
        `${purchase.label?.trim() || 'Employee share plan'}${symbol ? ` · ${symbol}` : ''} · ${shares} shares sold`,
        Number(sale.cash_proceeds) || 0);
    }));
  }
  const planned_income = money(income_occurrences
    .filter(row => row.kind !== 'posted' && row.kind !== 'overlap')
    .reduce((sum, row) => sum + row.amount, 0));
  const occurrenceAmount = (raw: unknown): number | null => {
    const cents = countableCents(raw, 'positive');
    return cents == null ? null : dollarsFromCents(cents);
  };
  const fixedOccurrences = fixedExpenses
    .filter(row => row.is_active)
    .flatMap(row => {
      const amount = occurrenceAmount(row.amount);
      if (amount == null) return [];
      return occurrencesBetween(row.start_date, row.frequency, start, end, row.end_date, row.due_day)
        .map(date => ({ date, name: row.name, category: row.category, amount }));
    });
  const subscriptionOccurrences = subscriptions
    .filter(row => row.is_active)
    .flatMap(row => {
      const amount = occurrenceAmount(row.amount);
      if (amount == null) return [];
      return occurrencesBetween(row.next_bill_date, row.frequency, start, end, row.end_date)
        .map(date => ({ date, name: row.name, category: row.category, amount }));
    });
  const centsOf = (rows: Array<{ amount: number }>) => rows.reduce((sum, row) => sum + (fromDollars(row.amount) ?? 0), 0);
  const fixed_total = centsOf(fixedOccurrences);
  const sub_total = centsOf(subscriptionOccurrences);
  const roundedIncome = planned_income;
  const roundedFixed = dollarsFromCents(fixed_total);
  const roundedSubscriptions = dollarsFromCents(sub_total);
  // Use the same per-row rounding shown in Home so the visible source lines
  // reconcile exactly with the ledger side of the monthly total.
  const observed_income = money(income_occurrences
    .filter(row => row.kind === 'posted')
    .reduce((sum, row) => sum + row.amount, 0));
  const observed_expenses = dollarsFromCents(transactionExpenseCents);
  const observed_net_cashflow = dollarsFromCents((fromDollars(observed_income) ?? 0) - transactionExpenseCents);
  const scheduled_income = roundedIncome;
  const scheduled_expenses = dollarsFromCents(fixed_total + sub_total);
  const scheduled_net_cashflow = dollarsFromCents((fromDollars(scheduled_income) ?? 0) - fixed_total - sub_total);
  const counted_occurrences = unmatchedScheduledExpenses(
    transactions,
    [...fixedOccurrences, ...subscriptionOccurrences],
    start,
    end,
  );
  const repeatingCents = centsOf(counted_occurrences);
  // One cashflow: posted activity plus repeating pay and bills that are not already posted.
  const total_income = unifyIncome(observed_income, scheduled_income);
  const income_overlap_adjustment = money(total_income - observed_income - scheduled_income);
  if (income_overlap_adjustment !== 0) {
    income_occurrences.push({
      id: 'income-overlap-adjustment',
      date: null,
      kind: 'overlap',
      label: 'Possible income overlap adjustment',
      name: 'Monthly aggregate adjustment',
      detail: 'Recorded and projected totals are within 20%; the larger total is used and the smaller is subtracted. This is not matched to a specific deposit.',
      amount: income_overlap_adjustment,
    });
  }
  income_occurrences.sort((a, b) => (a.date || '9999-12-31').localeCompare(b.date || '9999-12-31') || a.label.localeCompare(b.label));
  const total_expenses = dollarsFromCents(transactionExpenseCents + repeatingCents);
  const net_cashflow = dollarsFromCents((fromDollars(total_income) ?? 0) - transactionExpenseCents - repeatingCents);
  return {
    start_date: start,
    end_date: end,
    transaction_income: dollarsFromCents(transactionIncomeCents),
    transaction_expenses: observed_expenses,
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
    possible_income_overlap: incomeStreamsMatch(observed_income, scheduled_income),
    income_overlap_adjustment,
    possible_expense_overlap: counted_occurrences.length < fixedOccurrences.length + subscriptionOccurrences.length,
    total_income,
    income_occurrences,
    total_expenses,
    net_cashflow,
    savings_rate: total_income > 0 ? (net_cashflow / total_income) * 100 : null,
    average_daily_spend: total_expenses / daysInRange,
    fixed_occurrences: fixedOccurrences.sort((a, b) => a.date.localeCompare(b.date)),
    subscription_occurrences: subscriptionOccurrences.sort((a, b) => a.date.localeCompare(b.date)),
    counted_occurrences,
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
  view: 'unified' | 'recorded' | 'scheduled' = 'unified'
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
