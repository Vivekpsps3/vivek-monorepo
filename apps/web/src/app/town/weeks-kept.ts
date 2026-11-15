import { treasuryUnlocked } from './town-levels';

/**
 * Town story run, in weeks, from streaks Town already computed.
 * A day streak contributes a whole week for every 7 days. This is not a Finance count.
 */
export function weeksKeptRun(
  habits: readonly { streak: { unit: 'days' | 'weeks'; current: number } }[],
): number {
  let best = 0;
  for (const habit of habits) {
    const current = habit.streak.current;
    if (!Number.isFinite(current) || current <= 0) continue;
    const weeks = habit.streak.unit === 'weeks' ? Math.floor(current) : Math.floor(current / 7);
    if (weeks > best) best = weeks;
  }
  return best;
}

/** Completed ISO weeks Treasury asks Finance for. The current week is never one of them. */
export const FINANCE_BUDGET_WEEKS = 52;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface FinanceBudgetWeek {
  weekStart: string;
  kept: boolean | null;
}

export interface FinanceBudgetRun {
  run: number;
  /** The kept run filled every loaded week, so a longer run is outside this window. */
  saturated: boolean;
}

/** Rejected budget weeks. Callers show Treasury unavailable instead of guessing a run. */
export class FinanceBudgetRunError extends Error {
  readonly reason: 'malformed' | 'duplicate';

  constructor(reason: 'malformed' | 'duplicate') {
    super(reason === 'duplicate' ? 'duplicate finance budget week' : 'malformed finance budget week');
    this.name = 'FinanceBudgetRunError';
    this.reason = reason;
  }
}

export type TreasuryView =
  | { status: 'locked' | 'loading' | 'no_plan' | 'no_data' | 'unavailable' }
  | { status: 'ready'; run: number; saturated: boolean; tier: number; stage: 1 | 2 | 3 };

export interface TreasuryFace {
  label: string;
  href: string;
  external: boolean;
  /** Null uses the locked sprite. A number is the treasury building stage. */
  stage: 1 | 2 | 3 | null;
}

function utcDate(iso: string): Date | null {
  if (!ISO_DATE.test(iso)) return null;
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

function formatUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function mondayOf(date: Date): string {
  const monday = new Date(date.getTime());
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return formatUtc(monday);
}

function previousMonday(weekStart: string): string {
  const date = utcDate(weekStart);
  if (!date) throw new FinanceBudgetRunError('malformed');
  date.setUTCDate(date.getUTCDate() - 7);
  return formatUtc(date);
}

/**
 * Consecutive completed Finance budget weeks, newest first.
 * Weeks are ordered here. The ISO week containing `today` is ignored.
 * A false, null, or missing week ends the run. Duplicate or non-Monday weeks throw.
 */
export function financeBudgetRun(
  weeks: readonly FinanceBudgetWeek[],
  today?: string,
): FinanceBudgetRun {
  let currentMonday: string | null = null;
  if (today != null) {
    const todayDate = utcDate(today);
    if (!todayDate) throw new FinanceBudgetRunError('malformed');
    currentMonday = mondayOf(todayDate);
  }
  const seen = new Set<string>();
  const rows: { weekStart: string; kept: boolean | null }[] = [];
  for (const week of weeks) {
    if (week == null || typeof week !== 'object') throw new FinanceBudgetRunError('malformed');
    const start = utcDate(week.weekStart);
    if (!start || start.getUTCDay() !== 1) throw new FinanceBudgetRunError('malformed');
    if (week.kept !== true && week.kept !== false && week.kept !== null) throw new FinanceBudgetRunError('malformed');
    const weekStart = formatUtc(start);
    if (currentMonday != null && weekStart === currentMonday) continue;
    if (seen.has(weekStart)) throw new FinanceBudgetRunError('duplicate');
    seen.add(weekStart);
    rows.push({ weekStart, kept: week.kept });
  }
  rows.sort((a, b) => (a.weekStart < b.weekStart ? 1 : a.weekStart > b.weekStart ? -1 : 0));
  let run = 0;
  let expected = rows[0]?.weekStart ?? null;
  let endedByBreak = false;
  for (const row of rows) {
    if (row.weekStart !== expected || row.kept !== true) {
      endedByBreak = true;
      break;
    }
    run += 1;
    expected = previousMonday(row.weekStart);
  }
  return { run, saturated: run >= FINANCE_BUDGET_WEEKS && !endedByBreak };
}

/** Map one Finance budget load onto the Treasury lot. Cancelled work publishes nothing. */
export function treasuryFromBudget(
  result: { status: string; weeks?: readonly FinanceBudgetWeek[] },
  today: string,
): TreasuryView | null {
  switch (result.status) {
    case 'cancelled':
      return null;
    case 'locked':
      return { status: 'locked' };
    case 'no_plan':
      return { status: 'no_plan' };
    case 'no_data':
      return { status: 'no_data' };
    case 'expired':
    case 'unavailable':
      return { status: 'unavailable' };
    case 'ready':
      try {
        const counted = financeBudgetRun(result.weeks ?? [], today);
        const unlocked = treasuryUnlocked(counted.run);
        return {
          status: 'ready',
          run: counted.run,
          saturated: counted.saturated,
          tier: unlocked.level,
          stage: unlocked.stage,
        };
      } catch (error) {
        if (error instanceof FinanceBudgetRunError) return { status: 'unavailable' };
        throw error;
      }
    default:
      return { status: 'unavailable' };
  }
}

/** Shared Treasury copy. Money amounts stay in Finance. */
export function treasuryFace(view: TreasuryView): TreasuryFace {
  switch (view.status) {
    case 'locked':
      return {
        label: 'Finance vault locked',
        href: '/finance/vault/unlock?next=%2Ftown',
        external: true,
        stage: null,
      };
    case 'loading':
      return { label: 'Loading', href: '/finance', external: false, stage: 1 };
    case 'no_plan':
      return { label: 'No spending plan', href: '/finance/planning', external: false, stage: 1 };
    case 'no_data':
      return { label: 'No budget data', href: '/finance/spending', external: false, stage: 1 };
    case 'unavailable':
      return { label: 'Unavailable', href: '/finance', external: false, stage: 1 };
    case 'ready': {
      const weeks = view.saturated ? '52+ weeks' : view.run === 1 ? '1 week' : `${view.run} weeks`;
      return {
        label: `Lv ${view.tier} · ${weeks}`,
        href: '/finance',
        external: false,
        stage: view.stage,
      };
    }
  }
}
