import { formatDate, formatMoney, fromDollars, plural } from '@vivek/browser';
import type { PlanningInputsPreview } from '../models/planning.model';
import { formatStoredMoney } from '../shared/stored-money';

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
  linkText: string;
  queryParams: Record<string, string>;
}

export interface PlanningFactLine {
  label: string;
  small: string;
}

export interface PlanningFactsCopy {
  netWorth: PlanningFactLine;
  portfolio: PlanningFactLine;
  takeHome: PlanningFactLine & { amount: string };
  scheduled: PlanningFactLine;
}

/** Parenthetical counts stay numeric so zero participation is visible. */
function countPhrase(count: number | null | undefined, singular: string): string {
  return plural(count ?? 0, singular, { zeroIsNo: false });
}

/**
 * Facts-card wording from the typed preview. This does not scan records;
 * the service already counted them.
 */
export function planningFactsCopy(inputs: PlanningInputs | null, now: Date = new Date()): PlanningFactsCopy {
  const balanceAsOf = asOfPhrase(inputs?.oldest_balance_as_of, now);
  const quoteAsOf = asOfPhrase(inputs?.oldest_portfolio_quote_date, now);
  const netWorthCounts = `${countPhrase(inputs?.asset_count, 'asset')}, ${countPhrase(inputs?.debt_count, 'debt')}`;
  const jobCounts = countPhrase(inputs?.active_job_count, 'active job');
  const billCounts = `${countPhrase(inputs?.active_bill_count, 'bill')}, ${countPhrase(inputs?.active_subscription_count, 'subscription')}`;
  const incomeSource = `${planningSourceLabel('income')} (${jobCounts})`;
  const annual = (inputs?.avg_monthly_income || 0) * 12;
  const incomeIsNet = inputs?.income_is_net === true;
  return {
    netWorth: {
      label: 'Net worth',
      small: balanceAsOf
        ? `${planningSourceLabel('net_worth')} (${netWorthCounts}) · ${balanceAsOf}`
        : `${planningSourceLabel('net_worth')} (${netWorthCounts})`,
    },
    portfolio: {
      label: 'Portfolio',
      small: quoteAsOf
        ? `From your holdings (${countPhrase(inputs?.holding_count, 'holding')}) · prices ${quoteAsOf}`
        : `From your holdings (${countPhrase(inputs?.holding_count, 'holding')})`,
    },
    takeHome: incomeIsNet
      ? {
          label: 'Take-home',
          amount: `${formatStoredMoney(annual)} a year`,
          small: incomeSource,
        }
      : {
          label: 'Yearly pay',
          amount: `${formatStoredMoney(annual)} a year before taxes`,
          small: `${incomeSource}. Take-home: not set`,
        },
    scheduled: {
      label: 'Scheduled costs',
      small: `${planningSourceLabel('spending')} (${billCounts})`,
    },
  };
}

/** Missing-date warnings in display order. Price dates keep the Check prices link. */
export function dateWarnings(inputs: PlanningInputs | null): DateWarning[] {
  if (!inputs) return [];
  const warnings: DateWarning[] = [];
  const positions = inputs.undated_portfolio_positions || 0;
  if (positions > 0) {
    warnings.push({
      text: positions === 1 ? '1 holding has no position date.' : `${positions} holdings have no position date.`,
      link: '/finance/have',
      linkText: 'Add a date',
      queryParams: { t: 'holdings' },
    });
  }
  const balances = (inputs.undated_asset_balances || 0) + (inputs.undated_liability_balances || 0);
  if (balances > 0) {
    warnings.push({
      text: balances === 1 ? '1 balance has no date.' : `${balances} balances have no date.`,
      link: '/finance/have',
      linkText: 'Add a date',
      queryParams: { t: 'assets' },
    });
  }
  const quotes = inputs.undated_portfolio_quotes || 0;
  if (quotes > 0) {
    warnings.push({
      text: quotes === 1 ? '1 holding has no price date.' : `${quotes} holdings have no price date.`,
      link: '/finance/have',
      linkText: 'Check prices',
      queryParams: { t: 'holdings' },
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
