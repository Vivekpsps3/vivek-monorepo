import { BUILDING_LV, level, stage } from '../index';
import { HEALTH_BADGES, HEALTH_DAILY_CAP, HEALTH_LIMITS, HEALTH_XP, LOGGED_WEEK_THRESHOLDS,
  PLATE_THRESHOLDS, PR_BEATEN_THRESHOLDS, RUN_DISTANCES, RUN_TOLERANCE } from './health.constants';
import { HealthPr, HealthStat } from './health.types';
import { normalizeHealthText } from './health-validate';

export const e1RM = (kg: number, reps: number): number => reps === 1 ? kg : kg * (1 + reps / 30);
export const liftPrEligible = (reps: number): boolean => Number.isInteger(reps) && reps >= 1 && reps <= HEALTH_LIMITS.prRepsMax;
export function casefoldExercise(name: string): string {
  return [...normalizeHealthText(name)].map(char => {
    const cp = char.codePointAt(0)!;
    // Default Unicode folding preserves dotless i and folds Cherokee to uppercase.
    if (cp === 0x131) return char;
    if (cp === 0x1e9e) return 'ss';
    if ((cp >= 0x13a0 && cp <= 0x13f5) || (cp >= 0x13f8 && cp <= 0x13fd) ||
      (cp >= 0xab70 && cp <= 0xabbf)) return char.toUpperCase();
    return char.toUpperCase().toLowerCase();
  }).join('');
}
export type PrEvent = { index: number; kind: HealthPr['kind']; metric: string; value: number; first: boolean };
export type PrPolicy = {
  // Unsettled design: caller must supply ordering for records tied on both dates.
  compareTies: (a: number, b: number) => number;
  // Unsettled design: caller partitions other records into comparable series.
  otherSeries: (record: HealthPr, index: number) => string;
};
// Inputs have passed validation. Indices always refer to the original input array.
export function computePrEvents(records: readonly HealthPr[], policy: PrPolicy): PrEvent[] {
  const events: PrEvent[] = [], best = new Map<string, number>();
  const order = records.map((record, index) => ({ record, index })).sort((a, b) =>
    compare(a.record.measured_on, b.record.measured_on) || compare(a.record.logged_on, b.record.logged_on) ||
    policy.compareTies(a.index, b.index));
  const candidate = (index: number, kind: HealthPr['kind'], metric: string, value: number, lower = false) => {
    const key = `${kind}:${metric}`, previous = best.get(key);
    if (previous === undefined || (lower ? value < previous : value > previous)) {
      events.push({ index, kind, metric, value, first: previous === undefined }); best.set(key, value);
    }
  };
  for (const { record: r, index } of order) {
    if (r.kind === 'lift' && liftPrEligible(r.reps!)) {
      candidate(index, r.kind, casefoldExercise(r.exercise!), e1RM(r.kg!, r.reps!));
    } else if (r.kind === 'run') {
      candidate(index, r.kind, 'longest', r.distance_m!);
      for (const [id, distance] of Object.entries(RUN_DISTANCES)) {
        if (r.distance_m! >= distance && r.distance_m! <= distance * RUN_TOLERANCE) {
          candidate(index, r.kind, id, r.seconds! * distance / r.distance_m!, true);
        }
      }
    } else if (r.kind === 'other') {
      candidate(index, r.kind, policy.otherSeries(r, index), r.value!, r.direction === 'lower');
    }
  }
  return events;
}
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export function currentPrs(events: readonly PrEvent[]): PrEvent[] {
  const current = new Map<string, PrEvent>();
  for (const event of events) current.set(`${event.kind}:${event.metric}`, event);
  return [...current.values()];
}
// First-PR bonus eligibility remains explicit until design settles it. Multiple
// metrics on the same entry produce one entry bonus, not repeated entry credits.
export const prBonusIndices = (events: readonly PrEvent[], includeFirst: boolean): ReadonlySet<number> =>
  new Set(events.filter(event => includeFirst || !event.first).map(event => event.index));
export function computeHealthXp(stats: readonly HealthStat[], prs: readonly HealthPr[], bonusIndices: ReadonlySet<number>) {
  const clinicDays = new Map<string, number>(), gymDays = new Map<string, number>();
  const add = (days: Map<string, number>, day: string, xp: number, cap: number) =>
    days.set(day, Math.min(cap, (days.get(day) ?? 0) + xp));
  for (const stat of stats) add(clinicDays, stat.logged_on, stat.kind === 'checkup' ? HEALTH_XP.checkup :
    stat.kind === 'lab' ? HEALTH_XP.labEntry : HEALTH_XP.statEntry, HEALTH_DAILY_CAP.clinic);
  prs.forEach((pr, index) => add(gymDays, pr.logged_on, HEALTH_XP.prEntry +
    (bonusIndices.has(index) ? HEALTH_XP.newPr : 0), HEALTH_DAILY_CAP.gym));
  const building = (days: ReadonlyMap<string, number>) => {
    const xp = [...days.values()].reduce((sum, value) => sum + value, 0), lv = level(xp, BUILDING_LV);
    return { xp, level: lv, stage: stage(lv), days };
  };
  return { clinic: building(clinicDays), gym: building(gymDays) };
}
const DAY = 86400000, WEEK = 7 * DAY;
function isoMonday(date: string): number {
  const time = Date.parse(`${date}T00:00:00Z`), weekday = new Date(time).getUTCDay();
  return time - ((weekday + 6) % 7) * DAY;
}
// today is the caller's local calendar date; UTC arithmetic avoids DST shifts.
export function loggedWeeks(records: readonly (HealthStat | HealthPr)[], today: string): number {
  const weeks = new Set(records.map(record => isoMonday(record.logged_on)));
  let end = isoMonday(today), count = 0;
  if (!weeks.has(end)) end -= WEEK;
  while (weeks.has(end)) { count++; end -= WEEK; }
  return count;
}
export type HealthBadge = keyof typeof HEALTH_BADGES;
export function healthBadges(stats: readonly HealthStat[], prs: readonly HealthPr[], events: readonly PrEvent[], today: string): HealthBadge[] {
  const badges: HealthBadge[] = [];
  for (const kind of ['lift', 'run', 'other'] as const) {
    if (prs.some(pr => pr.kind === kind)) badges.push(`first_pr_${kind}`);
  }
  const beaten = events.filter(event => !event.first).length;
  for (const n of PR_BEATEN_THRESHOLDS) if (beaten >= n) badges.push(`pr_beaten_${n}`);
  for (const [id, threshold] of Object.entries(PLATE_THRESHOLDS)) {
    if (prs.some(pr => pr.kind === 'lift' && e1RM(pr.kg!, pr.reps!) >= threshold)) badges.push(`plate_${id}` as HealthBadge);
  }
  for (const [id, threshold] of Object.entries(RUN_DISTANCES)) {
    if (prs.some(pr => pr.kind === 'run' && pr.distance_m! >= threshold)) badges.push(`run_${id}` as HealthBadge);
  }
  const weeks = loggedWeeks([...stats, ...prs], today);
  for (const n of LOGGED_WEEK_THRESHOLDS) if (weeks >= n) badges.push(`logged_weeks_${n}`);
  return badges;
}
