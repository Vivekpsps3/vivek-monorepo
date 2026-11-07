import { BUILDING_LV, level, stage } from '../index';
import {
  HEALTH_BADGES, HEALTH_DAILY_CAP, HEALTH_LIMITS, HEALTH_XP,
  LOGGED_WEEK_THRESHOLDS, PLATE_THRESHOLDS, PR_BEATEN_THRESHOLDS,
  RUN_DISTANCES, RUN_TOLERANCE,
} from './health.constants';
import type { HealthPr, HealthStat } from './health.types';
import { normalizeHealthText } from './health-validate';

/** Epley estimated one-rep max. */
export const e1RM = (kg: number, reps: number): number => reps === 1 ? kg : kg * (1 + reps / 30);

/** Only sets of 1..12 reps can set a lift PR (§18.5). */
export const liftPrEligible = (reps: number): boolean =>
  Number.isInteger(reps) && reps >= 1 && reps <= HEALTH_LIMITS.prRepsMax;

/**
 * §8.4 caseless exercise matching. Folding via uppercase first resolves the
 * classic divergences (ß/ẞ → ss, final sigma ς → σ, ligatures, µ → μ);
 * dotless ı and the Cherokee ranges keep their identity instead of folding
 * into i / lowercase Cherokee.
 */
export function casefoldExercise(name: string): string {
  return [...normalizeHealthText(name)].map(char => {
    const cp = char.codePointAt(0)!;
    if (cp === 0x131) return char; // dotless ı must not become i
    if (cp === 0x1e9e) return 'ss'; // ẞ
    if ((cp >= 0x13a0 && cp <= 0x13f5) || (cp >= 0x13f8 && cp <= 0x13fd)
      || (cp >= 0xab70 && cp <= 0xabbf)) return char.toUpperCase();
    return char.toUpperCase().toLowerCase();
  }).join('');
}

export type PrEvent = {
  /** Index into the input array the caller passed. */
  index: number;
  kind: HealthPr['kind'];
  metric: string;
  value: number;
  /** True when this event is the first ever for its metric. */
  first: boolean;
};

const byDate = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

/**
 * The `other` series a record competes in: same casefolded name, same unit,
 * same direction. Chosen partition (unspecified in §18.5): two records with
 * the same name but different units or directions are different pursuits
 * and never demote each other.
 */
export function otherSeriesKey(record: HealthPr): string {
  return `${casefoldExercise(record.name ?? '')}|${record.unit ?? ''}|${record.direction ?? 'higher'}`;
}

/**
 * Recompute every PR event from scratch (§18.5): records are replayed in
 * measured_on, then logged_on order — ties on both keep input order, so a
 * backfilled record demotes later "PRs" that no longer beat the best, and
 * deleting a record restores the previous best on the next recompute.
 * Run PRs compete per standard distance: a run counts for a standard when
 * its distance is at least the standard and at most standard × 1.02, scored
 * by its time normalized to the standard distance (lower wins). Every run
 * also competes for 'longest' by raw distance.
 */
export function computePrEvents(records: readonly HealthPr[]): PrEvent[] {
  const events: PrEvent[] = [];
  const best = new Map<string, number>();
  const ordered = records
    .map((record, index) => ({ record, index }))
    .sort((a, b) => byDate(a.record.measured_on, b.record.measured_on)
      || byDate(a.record.logged_on, b.record.logged_on)
      || a.index - b.index);
  const candidate = (index: number, kind: HealthPr['kind'], metric: string, value: number, lower = false): void => {
    const key = `${kind}:${metric}`;
    const previous = best.get(key);
    if (previous === undefined || (lower ? value < previous : value > previous)) {
      events.push({ index, kind, metric, value, first: previous === undefined });
      best.set(key, value);
    }
  };
  for (const { record, index } of ordered) {
    if (record.kind === 'lift') {
      if (liftPrEligible(record.reps ?? NaN)) {
        candidate(index, 'lift', casefoldExercise(record.exercise ?? ''), e1RM(record.kg ?? NaN, record.reps ?? NaN));
      }
    } else if (record.kind === 'run') {
      const distance = record.distance_m ?? NaN;
      const seconds = record.seconds ?? NaN;
      candidate(index, 'run', 'longest', distance);
      for (const [id, standard] of Object.entries(RUN_DISTANCES)) {
        if (distance >= standard && distance <= standard * RUN_TOLERANCE) {
          candidate(index, 'run', id, seconds * standard / distance, true);
        }
      }
    } else {
      candidate(index, 'other', otherSeriesKey(record), record.value ?? NaN, record.direction === 'lower');
    }
  }
  return events;
}

/** The latest event per metric: the current PRs. */
export function currentPrs(events: readonly PrEvent[]): PrEvent[] {
  const current = new Map<string, PrEvent>();
  for (const event of events) current.set(`${event.kind}:${event.metric}`, event);
  return [...current.values()];
}

export interface BuildingXp {
  xp: number;
  level: number;
  stage: 1 | 2 | 3;
  days: ReadonlyMap<string, number>;
}

/**
 * XP by logged_on day (§18.5/AC-H5). Clinic earns from stats, Gym from PR
 * records; each day is capped as it accrues. A PR record that set at least
 * one PR event earns the newPr bonus once, on top of prEntry — first PRs
 * included: a first PR is a new PR.
 */
export function computeHealthXp(
  stats: readonly HealthStat[],
  prs: readonly HealthPr[],
  events: readonly PrEvent[],
): { clinic: BuildingXp; gym: BuildingXp } {
  const bonusIndices = new Set(events.map(event => event.index));
  const accrue = (days: Map<string, number>, day: string, xp: number, cap: number): void => {
    days.set(day, Math.min(cap, (days.get(day) ?? 0) + xp));
  };
  const clinicDays = new Map<string, number>();
  for (const stat of stats) {
    const xp = stat.kind === 'checkup' ? HEALTH_XP.checkup
      : stat.kind === 'lab' ? HEALTH_XP.labEntry : HEALTH_XP.statEntry;
    accrue(clinicDays, stat.logged_on, xp, HEALTH_DAILY_CAP.clinic);
  }
  const gymDays = new Map<string, number>();
  prs.forEach((pr, index) => {
    accrue(gymDays, pr.logged_on,
      HEALTH_XP.prEntry + (bonusIndices.has(index) ? HEALTH_XP.newPr : 0), HEALTH_DAILY_CAP.gym);
  });
  const building = (days: Map<string, number>): BuildingXp => {
    const xp = [...days.values()].reduce((sum, value) => sum + value, 0);
    const lv = level(xp, BUILDING_LV);
    return { xp, level: lv, stage: stage(lv), days };
  };
  return { clinic: building(clinicDays), gym: building(gymDays) };
}

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

function isoMondayMs(day: string): number {
  const time = Date.parse(`${day}T00:00:00Z`);
  const weekday = new Date(time).getUTCDay();
  return time - ((weekday + 6) % 7) * DAY_MS;
}

/**
 * Consecutive logged weeks (Mon–Sun) ending with today's week, or with
 * last week when this week has nothing yet (§18.6).
 */
export function loggedWeeks(records: readonly (HealthStat | HealthPr)[], today: string): number {
  const weeks = new Set(records.map(record => isoMondayMs(record.logged_on)));
  let end = isoMondayMs(today);
  if (!weeks.has(end)) end -= WEEK_MS;
  let count = 0;
  while (weeks.has(end)) {
    count += 1;
    end -= WEEK_MS;
  }
  return count;
}

export type HealthBadge = keyof typeof HEALTH_BADGES;

/** Every §18.6 rule, recomputed from the records and their PR events. */
export function healthBadges(
  stats: readonly HealthStat[],
  prs: readonly HealthPr[],
  events: readonly PrEvent[],
  today: string,
): HealthBadge[] {
  const badges: HealthBadge[] = [];
  for (const kind of ['lift', 'run', 'other'] as const) {
    if (events.some(event => event.kind === kind && event.first)) badges.push(`first_pr_${kind}`);
  }
  const beaten = events.filter(event => !event.first).length;
  for (const n of PR_BEATEN_THRESHOLDS) if (beaten >= n) badges.push(`pr_beaten_${n}`);
  // Plates and run finishes look at every record, not only PR-eligible
  // sets: a heavy 13-rep set still moved the weight.
  for (const [id, threshold] of Object.entries(PLATE_THRESHOLDS)) {
    if (prs.some(pr => pr.kind === 'lift' && e1RM(pr.kg ?? NaN, pr.reps ?? NaN) >= threshold)) {
      badges.push(`plate_${id}` as HealthBadge);
    }
  }
  for (const [id, standard] of Object.entries(RUN_DISTANCES)) {
    if (prs.some(pr => pr.kind === 'run' && (pr.distance_m ?? 0) >= standard)) {
      badges.push(`run_${id}` as HealthBadge);
    }
  }
  const weeks = loggedWeeks([...stats, ...prs], today);
  for (const n of LOGGED_WEEK_THRESHOLDS) if (weeks >= n) badges.push(`logged_weeks_${n}`);
  return badges;
}
