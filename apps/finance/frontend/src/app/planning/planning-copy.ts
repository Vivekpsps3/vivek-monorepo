import { formatDate, formatMoney, fromDollars } from '@vivek/browser';
import type { PlanningInputsPreview } from '../models/planning.model';

export type PlanningInputs = PlanningInputsPreview;

/** Plain-language source lines; never the internal source keys. */
export function planningSourceLabel(kind: 'net_worth' | 'income' | 'spending'): string {
  switch (kind) {
    case 'net_worth':
      return 'From your assets and debts';
    case 'income':
      return 'From your active jobs';
    case 'spending':
      return 'From your bills and subscriptions';
  }
}

/**
 * "as of Oct 22" for a date-only value; "as of 7:38 AM PT" for a same-day
 * instant and "as of Oct 22, 7:38 AM PT" for an instant on another day
 * (Pacific). F7 seam: the spec takes this from F7's `formatAsOf` in
 * `utils/quote-book.ts`, which isn't on main yet; the phrase semantics are
 * the ones the F14/F18 specs quote, implemented here until it lands.
 */
export function asOfPhrase(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return `as of ${formatDate(iso, 'table', now)}`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
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

export interface DateWarning {
  text: string;
  link: string;
  queryParams: Record<string, string>;
}

/** Readable "no date" warnings with an [Add a date] link, in display order. */
export function dateWarnings(inputs: PlanningInputs | null): DateWarning[] {
  if (!inputs) return [];
  const warnings: DateWarning[] = [];
  const positions = inputs.undated_portfolio_positions || 0;
  if (positions > 0) {
    warnings.push({
      text: positions === 1 ? '1 holding has no position date.' : `${positions} holdings have no position date.`,
      link: '/finance/have',
      queryParams: { t: 'holdings' },
    });
  }
  const balances = (inputs.undated_asset_balances || 0) + (inputs.undated_liability_balances || 0);
  if (balances > 0) {
    warnings.push({
      text: balances === 1 ? '1 balance has no date.' : `${balances} balances have no date.`,
      link: '/finance/have',
      queryParams: { t: 'assets' },
    });
  }
  return warnings;
}

export function spendingBasisSentence(
  mode: 'recurring' | 'components' | 'manual',
  recurringAnnual: number,
): string {
  switch (mode) {
    case 'recurring':
      return `Use your bills and subscriptions (${formatMoney(fromDollars(recurringAnnual))} a year). Card purchases aren't included.`;
    case 'components':
      return 'Add up categories yourself.';
    case 'manual':
      return 'Enter one yearly total.';
  }
}
