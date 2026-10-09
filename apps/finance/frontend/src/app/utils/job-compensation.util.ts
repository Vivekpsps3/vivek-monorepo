import { JobIncome, JobIncomeCreate } from '../models/transaction.model';
import { todayIsoDate } from './date.util';

type JobPay = Pick<JobIncomeCreate, 'pay_frequency' | 'base_pay' | 'hours_per_week' | 'effective_date' | 'end_date' | 'promotions' | 'compensation_payments' | 'annual_bonus' | 'annual_equity' | 'annual_other' | 'annual_taxes' | 'annual_deductions'>;
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

export interface EmployerCompensation extends CompensationTotals {
  employer: string;
  jobs: number;
}

export function compensationByEmployer(rows: JobIncome[], start: string, end: string): EmployerCompensation[] {
  const employers = new Map<string, EmployerCompensation>();
  for (const row of rows) {
    const name = row.employer.trim();
    const key = name.toLocaleLowerCase();
    const total = employers.get(key) || { employer: name, jobs: 0, base: 0, bonus: 0, equity: 0, other: 0, gross: 0, net: 0 };
    const pay = jobCompensationBetween(row, start, end);
    total.jobs += 1;
    for (const field of ['base', 'bonus', 'equity', 'other', 'gross', 'net'] as const) total[field] += pay[field];
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
  return null;
}
