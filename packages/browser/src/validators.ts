/**
 * Per-entity money and field rules (spec §7.4).
 * Amounts are entered as positive numbers. Direction comes from the entity.
 */
import {
  MAX_AMOUNT_MESSAGE,
  fromDollars,
  isSafeCents,
  parseMoneyInput,
  dollarsFromCountedCents,
  toDollars,
  type Cents,
} from './format';
import { isOnOrBeforeToday, parseDateOnly, todayIsoDate } from './date';

export interface FieldIssue {
  field: string;
  label: string;
  message: string;
}

export type AmountMode = 'nonNegative' | 'positive';

const DECIMAL_MESSAGE = 'Enter an amount with up to 2 decimal places.';

export function issue(field: string, label: string, message: string): FieldIssue {
  return { field, label, message };
}

export function validateMoney(
  raw: unknown,
  options: { allowZero: boolean; negativeMessage: string; emptyMessage: string },
): { cents: Cents } | { error: string } {
  if (raw == null || raw === '') return { error: options.emptyMessage };
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return { error: MAX_AMOUNT_MESSAGE };
    const text = Object.is(raw, -0) ? '0' : String(raw);
    return validateMoney(text, options);
  }
  if (typeof raw !== 'string') return { error: options.emptyMessage };
  const parsed = parseMoneyInput(raw);
  if ('error' in parsed) {
    return { error: parsed.error === DECIMAL_MESSAGE ? DECIMAL_MESSAGE : parsed.error };
  }
  if (parsed.cents < 0) return { error: options.negativeMessage };
  if (!options.allowZero && parsed.cents === 0) return { error: options.negativeMessage };
  return { cents: parsed.cents };
}

/** Per-share prices keep 4 decimal places (§5.2). Empty is optional. */
export function validateUnitPrice(raw: unknown): string | null {
  if (raw == null || String(raw).trim() === '') return null;
  const text = typeof raw === 'number' ? (Object.is(raw, -0) ? '0' : String(raw)) : String(raw).trim();
  if (/^[-\u2212]/.test(text)) return "Cost basis can't be negative.";
  if (!/^\d+(\.\d+)?$/.test(text)) return 'Enter a price with up to 4 decimal places.';
  const fraction = text.split('.')[1] ?? '';
  if (fraction.length > 4) return 'Enter a price with up to 4 decimal places.';
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0) return "Cost basis can't be negative.";
  return null;
}

export function unitPriceToNumber(raw: unknown): number | null {
  if (validateUnitPrice(raw)) return null;
  if (raw == null || String(raw).trim() === '') return null;
  return typeof raw === 'number' ? raw : Number(String(raw).trim());
}

/** Null when the stored dollar amount can be included in a total. */
export function countableCents(value: unknown, mode: AmountMode): Cents | null {
  if (value == null || value === '') return 0;
  const numeric = typeof value === 'number' ? value : Number(String(value).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(numeric)) return null;
  const cents = fromDollars(numeric);
  if (cents == null) return null;
  if (mode === 'nonNegative' && cents < 0) return null;
  if (mode === 'positive' && cents <= 0) return null;
  return cents;
}

export function amountProblem(value: unknown, mode: AmountMode): 'over-max' | 'negative' | 'invalid' | null {
  if (value == null || value === '') return null;
  const numeric = typeof value === 'number' ? value : Number(String(value).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(numeric)) return 'invalid';
  const cents = fromDollars(numeric);
  if (cents == null || !isSafeCents(cents)) return 'over-max';
  if (mode === 'nonNegative' && cents < 0) return 'negative';
  if (mode === 'positive' && cents <= 0) return 'negative';
  return null;
}

export function needsFixing(value: unknown, mode: AmountMode): boolean {
  return amountProblem(value, mode) != null;
}

export function excludedAmountNote(count: number): string | null {
  if (!count) return null;
  return count === 1
    ? 'Excludes 1 entry with an invalid amount'
    : `Excludes ${count} entries with an invalid amount`;
}

export function sumCountableDollars(values: unknown[], mode: AmountMode): { total: number; excluded: number } {
  let cents = 0;
  let excluded = 0;
  for (const value of values) {
    if (value == null || value === '') continue;
    const part = countableCents(value, mode);
    if (part == null) {
      excluded += 1;
      continue;
    }
    cents += part;
  }
  const total = dollarsFromCountedCents(cents);
  return { total: Number.isFinite(total) ? total : 0, excluded };
}

function moneyIssue(
  raw: unknown,
  field: string,
  label: string,
  allowZero: boolean,
  message: string,
): FieldIssue | null {
  const parsed = validateMoney(raw, { allowZero, negativeMessage: message, emptyMessage: message });
  if ('error' in parsed) {
    if (parsed.error === MAX_AMOUNT_MESSAGE || parsed.error === DECIMAL_MESSAGE) {
      return issue(field, label, parsed.error);
    }
    return issue(field, label, message);
  }
  return null;
}

export function validateAsset(input: { name: unknown; value: unknown }): FieldIssue[] {
  const errors: FieldIssue[] = [];
  const name = String(input.name ?? '').trim();
  const nameError = nameIssue(name);
  if (nameError) errors.push(nameError);
  const valueError = moneyIssue(input.value, 'value', 'Value', true, 'Enter a value of $0 or more.');
  if (valueError) errors.push(valueError);
  return errors;
}

export function validateDebt(input: { name: unknown; amount: unknown }): FieldIssue[] {
  const errors: FieldIssue[] = [];
  const nameError = nameIssue(input.name);
  if (nameError) errors.push(nameError);
  const amountError = moneyIssue(input.amount, 'amount', 'Amount owed', true, 'Enter what you owe as a positive amount.');
  if (amountError) errors.push(amountError);
  return errors;
}

export function validateSymbol(raw: unknown): string | null {
  const symbol = String(raw ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9.-]{1,10}$/.test(symbol)) return 'Enter a ticker like VOO.';
  return null;
}

export function validateShares(raw: unknown): string | null {
  const text = String(raw ?? '').trim();
  if (!text) return 'Enter more than 0 shares.';
  if (!/^\d+(\.\d{1,6})?$/.test(text)) return 'Enter more than 0 shares.';
  const shares = Number(text);
  if (!Number.isFinite(shares) || shares <= 0) return 'Enter more than 0 shares.';
  return null;
}

export function validateHolding(input: {
  symbol: unknown;
  shares: unknown;
  costBasis: unknown;
  purchaseDate?: unknown;
  requirePurchaseDate?: boolean;
}): FieldIssue[] {
  const errors: FieldIssue[] = [];
  const symbolError = validateSymbol(input.symbol);
  if (symbolError) errors.push(issue('symbol', 'Symbol', symbolError));
  const sharesError = validateShares(input.shares);
  if (sharesError) errors.push(issue('shares', 'Shares', sharesError));
  const cost = input.costBasis;
  if (cost != null && String(cost).trim() !== '') {
    const priceError = validateUnitPrice(cost);
    if (priceError) errors.push(issue('costBasis', 'Cost basis', priceError));
  }
  if (input.requirePurchaseDate && !parseDateOnly(String(input.purchaseDate ?? ''))) {
    errors.push(issue('purchaseDate', 'Purchase date', 'Enter a purchase date.'));
  }
  return errors;
}

export function validateTransaction(input: { amount: unknown; date: unknown; category: unknown }, today = todayIsoDate()): FieldIssue[] {
  const errors: FieldIssue[] = [];
  const date = String(input.date ?? '');
  if (!parseDateOnly(date)) errors.push(issue('date', 'Date', 'Enter a date.'));
  else if (maxAhead(date, today)) errors.push(issue('date', 'Date', 'Use a date within a year.'));
  if (!String(input.category ?? '').trim()) errors.push(issue('category', 'Category', 'Enter a category.'));
  const amountError = moneyIssue(
    input.amount,
    'amount',
    'Amount',
    false,
    'Enter an amount above $0. Choose Refund or Income for money coming in.',
  );
  if (amountError) errors.push(amountError);
  return errors;
}

function maxAhead(iso: string, today: string): boolean {
  const [year, month, day] = today.split('-').map(Number);
  const limit = new Date(year + 1, month - 1, day);
  const parsed = parseDateOnly(iso);
  if (!parsed) return true;
  return parsed.getTime() > limit.getTime();
}

export function validateDueDay(raw: unknown): string | null {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  if (!/^\d{1,2}$/.test(text)) return 'Enter a day from 1 to 31. Short months use their last day.';
  const day = Number(text);
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    return 'Enter a day from 1 to 31. Short months use their last day.';
  }
  return null;
}

export function validateBill(input: { name: unknown; category: unknown; amount: unknown; dueDay: unknown }): FieldIssue[] {
  const errors: FieldIssue[] = [];
  const billName = nameIssue(input.name);
  if (billName) errors.push(billName);
  if (!String(input.category ?? '').trim()) errors.push(issue('category', 'Category', 'Enter a category.'));
  const amountError = moneyIssue(input.amount, 'amount', 'Amount', false, 'Enter an amount above $0.');
  if (amountError) errors.push(amountError);
  const dueError = validateDueDay(input.dueDay);
  if (dueError) errors.push(issue('dueDay', 'Due day', dueError));
  return errors;
}

export function validateSubscription(input: { name: unknown; amount: unknown }): FieldIssue[] {
  const errors: FieldIssue[] = [];
  const subscriptionName = nameIssue(input.name);
  if (subscriptionName) errors.push(subscriptionName);
  const amountError = moneyIssue(input.amount, 'amount', 'Amount', false, 'Enter an amount above $0.');
  if (amountError) errors.push(amountError);
  return errors;
}

export function validateJob(input: {
  employer: unknown;
  basePay: unknown;
  payFrequency: unknown;
  hoursPerWeek: unknown;
  paydayFrequency: unknown;
  nextPayday: unknown;
  taxes: unknown;
  deductions: unknown;
}): FieldIssue[] {
  const errors: FieldIssue[] = [];
  const employer = String(input.employer ?? '').trim();
  if (!employer) errors.push(issue('employer', 'Employer', 'Enter the employer.'));
  else if (employer.length > 80) errors.push(issue('employer', 'Employer', 'Use 80 characters or fewer.'));
  const payError = moneyIssue(input.basePay, 'basePay', 'Base pay', false, 'Enter yearly pay above $0.');
  if (payError) errors.push(payError);
  if (String(input.payFrequency ?? '') === 'hourly') {
    const hours = Number(input.hoursPerWeek);
    if (!Number.isFinite(hours) || hours < 1 || hours > 168) {
      errors.push(issue('hoursPerWeek', 'Hours per week', 'Enter hours from 1 to 168.'));
    }
  }
  if (String(input.paydayFrequency ?? '').trim()) {
    if (!parseDateOnly(String(input.nextPayday ?? ''))) {
      errors.push(issue('nextPayday', 'Next payday', 'Enter the next payday to place paychecks on the calendar.'));
    }
  }
  const taxError = moneyIssue(blankAsZero(input.taxes), 'taxes', 'Taxes', true, "Taxes can't be negative.");
  if (taxError) errors.push(taxError);
  const deductionError = moneyIssue(blankAsZero(input.deductions), 'deductions', 'Deductions', true, "Deductions can't be negative.");
  if (deductionError) errors.push(deductionError);
  return errors;
}

function nameIssue(raw: unknown, field = 'name', label = 'Name'): FieldIssue | null {
  const name = String(raw ?? '').trim();
  if (!name) return issue(field, label, 'Enter a name.');
  if (name.length > 80) return issue(field, label, 'Use 80 characters or fewer.');
  return null;
}

function blankAsZero(value: unknown): unknown {
  if (value == null || value === '') return 0;
  return value;
}

export function validatePlanningPaths(raw: unknown): string | null {
  const paths = Number(raw);
  if (!Number.isInteger(paths) || paths < 100 || paths > 5000) return 'Choose 100 to 5,000 paths.';
  return null;
}

export function validateGrowthPercent(raw: unknown): string | null {
  const text = String(raw ?? '').trim().replace(/%$/, '').replace('\u2212', '-');
  const rate = Number(text);
  if (!Number.isFinite(rate) || rate < -20 || rate > 30) return 'Enter a yearly growth rate from \u221220% to 30%.';
  return null;
}

export function isRecordedDate(value: string | null | undefined, today = todayIsoDate()): boolean {
  return isOnOrBeforeToday(value, today);
}

export function centsToStoredDollars(cents: Cents): number {
  return toDollars(cents);
}
