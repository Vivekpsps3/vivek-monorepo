import { formatMoney, fromDollars, type MoneySign, type MoneyStyle } from '@vivek/browser';

/** Format a stored dollar amount through integer cents. */
export function formatStoredMoney(
  value: number | null | undefined,
  style: MoneyStyle = 'standard',
  sign: MoneySign = 'auto',
  approx = false,
): string {
  return formatMoney(fromDollars(value), { style, sign, approx });
}

export function formatEstimate(value: number | null | undefined, sign: MoneySign = 'auto'): string {
  return formatStoredMoney(value, 'whole', sign, true);
}
