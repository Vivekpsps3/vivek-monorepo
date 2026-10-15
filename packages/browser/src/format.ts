/** Locale-aware money helpers. Uses runtime locale unless overridden. */

function moneyValue(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

export function formatMoney(
  value: number | null | undefined,
  currency = 'USD',
  locale?: string
): string {
  const amount = moneyValue(value);
  if (amount === null) return '—';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatCompactMoney(
  value: number | null | undefined,
  currency = 'USD',
  locale?: string
): string {
  const amount = moneyValue(value);
  if (amount === null) return '—';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(amount);
}
