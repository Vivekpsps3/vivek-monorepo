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

export function computeNetWorth(
  assets: Asset[],
  liabilities: Liability[],
  holdings: Holding[]
): NetWorth {
  const other_assets = assets.reduce((sum, a) => sum + (Number(a.current_value) || 0), 0);
  const portfolio_sources: Record<string, string> = {};
  const portfolio_breakdown: Record<string, number> = {};
  let portfolio = 0;
  for (const h of holdings) {
    const price = Number(h.current_price ?? h.purchase_price) || 0;
    const shares = Number(h.shares) || 0;
    const value = price * shares;
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
    portfolio_sources: holdings.length ? portfolio_sources : undefined,
    portfolio_breakdown: holdings.length ? portfolio_breakdown : undefined,
  };
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
  return { ...row, monthly_amount: monthly, annual_amount: monthly * 12 };
}

export function enrichSubscription(row: Subscription): Subscription {
  const monthly = monthlyAmount(Number(row.amount) || 0, row.frequency);
  return { ...row, monthly_amount: monthly, annual_amount: monthly * 12 };
}

export function enrichHolding(row: Holding): Holding {
  const shares = Number(row.shares) || 0;
  const purchase = Number(row.purchase_price) || 0;
  const current = Number(row.current_price ?? row.purchase_price) || 0;
  return {
    ...row,
    current_price: current,
    value: shares * current,
  };
}

function addMonths(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const targetMonth = month - 1 + months;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  return `${targetYear}-${String(normalizedMonth + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

function occurrencesBetween(start: string, frequency: string, rangeStart: string, rangeEnd: string, endDate?: string | null): string[] {
  if (rangeEnd < rangeStart) return [];
  const advance = (date: string) => {
    if (frequency === 'weekly') return addDays(date, 7);
    if (frequency === 'biweekly') return addDays(date, 14);
    if (frequency === 'quarterly') return addMonths(date, 3);
    if (frequency === 'annual') return addMonths(date, 12);
    return addMonths(date, 1);
  };
  let cursor = start;
  while (cursor < rangeStart) cursor = advance(cursor);
  const occurrences: string[] = [];
  while (cursor <= rangeEnd && (!endDate || cursor <= endDate)) {
    occurrences.push(cursor);
    cursor = advance(cursor);
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
    const amt = Number(tx.amount) || 0;
    if (tx.type === 'income') transaction_income += amt;
    else transaction_expenses += Math.abs(amt);
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
    .flatMap(row => occurrencesBetween(row.start_date, row.frequency, start, end, row.end_date).map(date => ({ date, name: row.name, category: row.category, amount: Number(row.amount) || 0 })));
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
  subscriptions: Subscription[]
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
    return {
      month,
      income: summary.total_income,
      expense: summary.total_expenses,
      net: summary.net_cashflow,
    };
  });
}
