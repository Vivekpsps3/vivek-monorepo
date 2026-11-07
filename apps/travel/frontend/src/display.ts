import {
  formatDateRange,
  formatDay,
  formatMoney,
  fromDollars,
} from "@vivek/browser";

export function showDay(value: string | null | undefined): string {
  if (value == null || value === "") return "";
  return formatDay(value);
}

export function showDays(dates: readonly string[]): string {
  return dates.map((date) => formatDay(date)).join(", ");
}

export function showRange(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  return formatDateRange(start, end);
}

/** Stored travel amounts are decimal dollar strings. formatMoney takes cents. */
export function showMoney(
  amount: string | null | undefined,
  currency: string | null | undefined,
): string {
  if (amount == null || amount === "") return "";
  const cents = fromDollars(amount);
  const code = (currency || "").trim().toUpperCase();
  if (cents == null || !/^[A-Z]{3}$/.test(code)) {
    return currency ? `${amount} ${currency}` : amount;
  }
  try {
    return formatMoney(cents, { currency: code });
  } catch {
    return `${amount} ${code}`;
  }
}
