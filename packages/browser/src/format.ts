/**
 * Money is formatted from integer cents. Stored vault JSON still uses dollar
 * numbers; convert at the boundary with fromDollars / toDollars.
 * Decision D4: MAX_CENTS. Decision D6: standard cents for actuals, whole dollars
 * for estimates (style: 'whole', approx: true).
 */

export const MAX_CENTS = 99_999_999_999_999;
export const MAX_AMOUNT_MESSAGE = 'Enter an amount up to $999,999,999,999.99.';
export const DEFAULT_MONEY_LOCALE = 'en-US';
export const MINUS_SIGN = '\u2212';

export type Cents = number;

export type MoneyStyle = 'standard' | 'whole' | 'compact';
export type MoneySign = 'auto' | 'always' | 'never';

export interface FormatMoneyOptions {
  style?: MoneyStyle;
  sign?: MoneySign;
  approx?: boolean;
  locale?: string;
  currency?: string;
}

export function roundHalfAwayFromZero(value: number): number {
  if (!Number.isFinite(value)) return Number.NaN;
  const negative = value < 0;
  const absolute = Math.abs(value);
  const whole = Math.floor(absolute);
  const fraction = absolute - whole;
  const rounded = fraction >= 0.5 ? whole + 1 : whole;
  const signed = negative ? -rounded : rounded;
  return signed === 0 ? 0 : signed;
}

export function isSafeCents(value: number): value is Cents {
  return Number.isSafeInteger(value) && Math.abs(value) <= MAX_CENTS;
}

/** Migrate a stored dollar amount to integer cents. Does not rewrite the record. */
export function fromDollars(dollars: number | null | undefined): Cents | null {
  if (dollars == null) return null;
  const amount = typeof dollars === 'number' ? dollars : Number(dollars);
  if (!Number.isFinite(amount)) return null;
  const cents = roundHalfAwayFromZero(amount * 100);
  return isSafeCents(cents) ? cents : null;
}

/**
 * Dollar number for the existing encrypted JSON shape.
 * Cent-aligned values that JSON can represent round-trip through fromDollars.
 */
export function toDollars(cents: Cents): number {
  if (!isSafeCents(cents)) {
    throw new RangeError(MAX_AMOUNT_MESSAGE);
  }
  return cents / 100;
}

/**
 * Convert a summed cent total for display. Individual inputs stay inside
 * MAX_CENTS; a total of many valid rows can pass that ceiling and still be
 * an exact safe integer. Never throws.
 */
export function dollarsFromCountedCents(cents: number): number {
  if (!Number.isSafeInteger(cents)) return Number.NaN;
  return cents / 100;
}

export function sumCents(values: Array<Cents | null | undefined>): Cents {
  let total = 0;
  for (const value of values) {
    if (value == null || !isSafeCents(value)) continue;
    total += value;
  }
  return total;
}

export interface ParsedMoney {
  cents: Cents;
}

export interface MoneyParseError {
  error: string;
}

/** Digits, optional grouping commas, optional $, up to 2 decimals. Rejects 1e20. */
export function parseMoneyInput(raw: string): ParsedMoney | MoneyParseError {
  const trimmed = raw.trim();
  if (!trimmed) return { error: 'Enter an amount.' };
  if (/e/i.test(trimmed)) return { error: MAX_AMOUNT_MESSAGE };
  const negative = /^[-\u2212]/.test(trimmed);
  const unsigned = trimmed.replace(/^[+\-\u2212]/, '').replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d+)?$/.test(unsigned)) return { error: MAX_AMOUNT_MESSAGE };
  const [whole, fraction = ''] = unsigned.split('.');
  if (fraction.length > 2) return { error: 'Enter an amount with up to 2 decimal places.' };
  const significant = `${whole.replace(/^0+/, '')}${fraction}`.length;
  if (significant > 15 || whole.length > 15) return { error: MAX_AMOUNT_MESSAGE };
  const cents = roundHalfAwayFromZero(Number(unsigned) * 100);
  const signed = negative ? -cents : cents;
  if (!isSafeCents(signed)) return { error: MAX_AMOUNT_MESSAGE };
  return { cents: signed === 0 ? 0 : signed };
}

export function formatMoney(
  value: Cents | null | undefined,
  opts: FormatMoneyOptions = {},
): string {
  if (value == null || !Number.isFinite(value) || !Number.isSafeInteger(value) || Math.abs(value) > MAX_CENTS) {
    return '—';
  }
  const style = opts.style ?? 'standard';
  const sign = opts.sign ?? 'auto';
  const locale = opts.locale ?? DEFAULT_MONEY_LOCALE;
  const currency = opts.currency ?? 'USD';
  const displayed = displayedAmount(value, style);
  const body = currencyBody(Math.abs(displayed.amount), locale, currency, displayed.digits, displayed.compact);
  const isZero = displayed.amount === 0;
  let prefix = '';
  if (!isZero) {
    if (value < 0 && sign !== 'never') prefix = MINUS_SIGN;
    else if (value > 0 && sign === 'always') prefix = '+';
  }
  const text = `${prefix}${body}`;
  return opts.approx ? `about ${text}` : text;
}

export function formatCompactMoney(
  value: Cents | null | undefined,
  opts: FormatMoneyOptions = {},
): string {
  return formatMoney(value, { ...opts, style: 'compact', approx: false });
}

/** Screen-reader label. Null when the visible text is already enough. */
export function moneyAriaLabel(
  value: Cents | null | undefined,
  opts: FormatMoneyOptions = {},
): string | null {
  const visible = formatMoney(value, opts);
  if (visible === '—') return 'not available';
  if (value != null && value < 0 && visible.startsWith(MINUS_SIGN)) {
    return `minus ${visible.slice(MINUS_SIGN.length)}`;
  }
  return null;
}

export function plural(
  count: number,
  singular: string,
  pluralForm?: string,
): string {
  const n = Number.isFinite(count) ? Math.abs(Math.trunc(count)) : 0;
  const category = new Intl.PluralRules(DEFAULT_MONEY_LOCALE).select(n);
  const word = category === 'one' ? singular : (pluralForm ?? `${singular}s`);
  if (n === 0) return `No ${word}`;
  return `${n.toLocaleString(DEFAULT_MONEY_LOCALE)} ${word}`;
}

function displayedAmount(cents: number, style: MoneyStyle): { amount: number; digits: number; compact: boolean } {
  if (style === 'whole') {
    return { amount: roundHalfAwayFromZero(cents / 100), digits: 0, compact: false };
  }
  if (style === 'compact') {
    return { amount: cents / 100, digits: 1, compact: true };
  }
  return { amount: cents / 100, digits: 2, compact: false };
}

function currencyBody(
  amount: number,
  locale: string,
  currency: string,
  digits: number,
  compact: boolean,
): string {
  const parts = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'symbol',
    notation: compact ? 'compact' : 'standard',
    signDisplay: 'never',
    minimumFractionDigits: compact ? 0 : digits,
    maximumFractionDigits: compact ? 1 : digits,
  }).formatToParts(amount);
  return parts
    .filter(part => part.type !== 'minusSign' && part.type !== 'plusSign')
    .map(part => part.value)
    .join('');
}
