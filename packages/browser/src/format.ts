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
const WORD_JOINER = '\u2060';

/**
 * Decision pending Vivek. true: plural(0) is "No X" (spec §5).
 * false: "0 X", which reads more naturally mid-sentence.
 */
export const PLURAL_ZERO_IS_NO = true;

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

/**
 * Cents from a decimal string. Half-away rounding goes through roundHalfAwayFromZero
 * so 1.005 and −0.005 are not subject to binary float multiplication.
 */
function centsFromDecimalText(text: string): Cents | null {
  const trimmed = text.trim();
  const negative = trimmed.startsWith('-') || trimmed.startsWith(MINUS_SIGN);
  const unsigned = trimmed.replace(/^[+\-\u2212]/, '');
  if (!/^\d+(\.\d+)?$/.test(unsigned)) return null;
  const [whole, fraction = ''] = unsigned.split('.');
  if (whole.length > 15) return null;
  const hundredths = Number((fraction + '00').slice(0, 2));
  const extra = fraction.length > 2 ? Number(`0.${fraction.slice(2)}`) : 0;
  const magnitude = Number(whole) * 100 + hundredths + extra;
  if (!Number.isFinite(magnitude)) return null;
  const cents = roundHalfAwayFromZero(negative ? -magnitude : magnitude);
  if (!isSafeCents(cents)) return null;
  return cents === 0 ? 0 : cents;
}

/** Migrate a stored dollar amount to integer cents. Does not rewrite the record. */
export function fromDollars(dollars: unknown): Cents | null {
  if (dollars == null || dollars === '') return null;
  if (typeof dollars === 'number') {
    if (!Number.isFinite(dollars)) return null;
    const text = Object.is(dollars, -0) ? '0' : String(dollars);
    if (!/^[+-]?\d+(\.\d+)?$/.test(text)) return null;
    return centsFromDecimalText(text);
  }
  if (typeof dollars === 'string') {
    const trimmed = dollars.trim();
    if (!/^[+-]?\d+(\.\d+)?$/.test(trimmed)) return null;
    return centsFromDecimalText(trimmed);
  }
  return null;
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

/** Digits, thousands-grouped commas, optional $, up to 2 decimals. Rejects 1e20 and "1,2,3". */
export function parseMoneyInput(raw: string): ParsedMoney | MoneyParseError {
  const trimmed = raw.trim();
  if (!trimmed) return { error: 'Enter an amount.' };
  if (/e/i.test(trimmed)) return { error: MAX_AMOUNT_MESSAGE };
  const negative = /^[-\u2212]/.test(trimmed);
  let unsigned = trimmed.replace(/^[+\-\u2212]/, '').replace(/[$\s]/g, '');
  if (unsigned.includes(',')) {
    if (!/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(unsigned)) return { error: MAX_AMOUNT_MESSAGE };
    unsigned = unsigned.replace(/,/g, '');
  }
  if (!/^\d+(\.\d+)?$/.test(unsigned)) return { error: MAX_AMOUNT_MESSAGE };
  const [whole, fraction = ''] = unsigned.split('.');
  if (fraction.length > 2) return { error: 'Enter an amount with up to 2 decimal places.' };
  const significant = `${whole.replace(/^0+/, '')}${fraction}`.length;
  if (significant > 15 || whole.length > 15) return { error: MAX_AMOUNT_MESSAGE };
  const cents = centsFromDecimalText(`${negative ? '-' : ''}${unsigned}`);
  if (cents == null || !isSafeCents(cents)) return { error: MAX_AMOUNT_MESSAGE };
  return { cents };
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
  const text = prefix ? `${prefix}${WORD_JOINER}${body}` : body;
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
  const visible = formatMoney(value, opts).replaceAll(WORD_JOINER, '');
  if (visible === '—') return 'not available';
  if (value != null && value < 0 && visible.startsWith(MINUS_SIGN)) {
    return `minus ${visible.slice(MINUS_SIGN.length)}`;
  }
  return null;
}

export function plural(
  count: number,
  singular: string,
  pluralFormOrOptions?: string | { plural?: string; zeroIsNo?: boolean },
): string {
  const options = pluralFormOrOptions && typeof pluralFormOrOptions === 'object' ? pluralFormOrOptions : undefined;
  const pluralForm = typeof pluralFormOrOptions === 'string' ? pluralFormOrOptions : options?.plural;
  const zeroIsNo = options?.zeroIsNo ?? PLURAL_ZERO_IS_NO;
  const n = Number.isFinite(count) ? Math.abs(Math.trunc(count)) : 0;
  const category = new Intl.PluralRules(DEFAULT_MONEY_LOCALE).select(n);
  const word = category === 'one' ? singular : (pluralForm ?? `${singular}s`);
  if (n === 0 && zeroIsNo) return `No ${word}`;
  return `${n.toLocaleString(DEFAULT_MONEY_LOCALE)} ${word}`;
}

/** Percent text with the true minus sign. Null is an em dash. */
export function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const scale = 10 ** digits;
  const rounded = roundHalfAwayFromZero(value * scale) / scale;
  const body = Math.abs(rounded).toLocaleString(DEFAULT_MONEY_LOCALE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${rounded < 0 ? MINUS_SIGN : ''}${body}%`;
}

function displayedAmount(cents: number, style: MoneyStyle): { amount: number; digits: number; compact: boolean } {
  if (style === 'whole') {
    return { amount: roundHalfAwayFromZero(cents / 100), digits: 0, compact: false };
  }
  if (style === 'compact') {
    const rounded = roundHalfAwayFromZero(cents / 10) / 10;
    return { amount: rounded === 0 ? 0 : rounded, digits: 1, compact: true };
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
  const visible = parts.filter(part => part.type !== 'minusSign' && part.type !== 'plusSign');
  let text = '';
  for (let index = 0; index < visible.length; index += 1) {
    const part = visible[index];
    if (!part) continue;
    if (part.type !== 'currency') {
      text += part.value;
      continue;
    }
    const previous = visible[index - 1];
    const next = visible[index + 1];
    if (previous && sticksToCurrency(previous.type)) text += WORD_JOINER;
    text += part.value;
    if (next && sticksToCurrency(next.type)) text += WORD_JOINER;
  }
  return text;
}

function sticksToCurrency(type: Intl.NumberFormatPartTypes): boolean {
  return (
    type === 'integer' ||
    type === 'group' ||
    type === 'decimal' ||
    type === 'fraction' ||
    type === 'compact' ||
    type === 'literal'
  );
}

export { formatDay, formatDateRange, formatRelativeDay } from '../runtime/calendar-format.mjs';
