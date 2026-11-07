import { formatDate } from '@vivek/browser';
import { computeCashflowSummary } from '../crypto/client-finance';
import type {
  Asset,
  FixedExpense,
  Holding,
  Liability,
  Subscription,
  Transaction,
} from '../models/transaction.model';

export interface DueItem {
  date: string;
  name: string;
  amount: number;
}

export interface FirstStep {
  id: 'balance' | 'holdings' | 'activity' | 'recurring';
  label: string;
  done: boolean;
}

function isValidIsoDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/** "as of 7:38 AM PT" today, "as of Oct 22, 7:38 AM PT" on another day (Pacific). */
function asOfPhrase(iso: string, now: Date): string {
  const parsed = new Date(iso);
  const zone = 'America/Los_Angeles';
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
  const dayOf = (d: Date): string => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d);
    const get = (type: string): string => parts.find(part => part.type === type)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  };
  if (dayOf(parsed) === dayOf(now)) return `as of ${time} PT`;
  return `as of ${formatDate(dayOf(parsed), 'table', now)}, ${time} PT`;
}

/**
 * "Balances Oct 22 · Prices as of 7:38 AM PT"; '' when there's nothing to date.
 *
 * F7 seam: the spec reads F7's `quoteBook(holdings)` for the prices part.
 * The book is derived from the holdings themselves (a symbol counts as
 * priced when it has a finite positive `current_price` and its
 * `price_source` isn't 'unavailable'; the entry's as-of is `price_as_of`),
 * so the newest priced as-of is computed from those fields here until
 * `utils/quote-book.ts` lands on main.
 */
export function homeAsOfLine(
  assets: readonly Asset[],
  liabilities: readonly Liability[],
  holdings: readonly Holding[],
  now: Date = new Date(),
): string {
  const parts: string[] = [];
  const balanceDates = [...assets, ...liabilities]
    .map(row => row.as_of_date)
    .filter(isValidIsoDate)
    .sort();
  if (balanceDates.length) {
    parts.push(`Balances ${formatDate(balanceDates[balanceDates.length - 1], 'table', now)}`);
  }
  if (holdings.length) {
    const priced = holdings.filter(holding => {
      const price = Number(holding.current_price);
      return (holding.price_source ?? '') !== 'unavailable' && Number.isFinite(price) && price > 0;
    });
    const priceDates = priced
      .map(holding => holding.price_as_of)
      .filter((value): value is string => !!value && !Number.isNaN(Date.parse(value)))
      .sort();
    if (priceDates.length) {
      parts.push(`Prices ${asOfPhrase(priceDates[priceDates.length - 1], now)}`);
    } else if (!priced.length) {
      parts.push('Holdings at purchase price');
    }
    // Priced but undated holdings add no part: the line never guesses a date.
  }
  return parts.join(' · ');
}

/** Unposted bill and subscription occurrences from today through today + days − 1, sorted by date then name. */
export function dueSoon(
  today: string,
  days: number,
  transactions: Transaction[],
  fixed: FixedExpense[],
  subs: Subscription[],
): DueItem[] {
  const end = isoAddDays(today, days - 1);
  return computeCashflowSummary(today, end, transactions, [], fixed, subs)
    .counted_occurrences.map(occurrence => ({
      date: occurrence.date,
      name: occurrence.name,
      amount: occurrence.amount,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

export function firstSteps(s: {
  assets: number;
  liabilities: number;
  holdings: number;
  transactions: number;
  jobIncomes: number;
  fixed: number;
  subs: number;
}): FirstStep[] {
  return [
    { id: 'balance', label: 'Add a balance', done: s.assets + s.liabilities > 0 },
    { id: 'holdings', label: 'Add holdings', done: s.holdings > 0 },
    { id: 'activity', label: 'Add activity', done: s.transactions > 0 },
    { id: 'recurring', label: 'Add pay and bills', done: s.jobIncomes + s.fixed + s.subs > 0 },
  ];
}

/** Date-only arithmetic in UTC, so DST never shifts the day. */
export function isoAddDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
