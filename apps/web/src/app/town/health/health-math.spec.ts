import { BUILDING_LV } from '../index';
import { HEALTH_BADGES, HEALTH_DAILY_CAP, HEALTH_LIMITS, HEALTH_XP, LB_PER_KG,
  LOGGED_WEEK_THRESHOLDS, METRES_PER_MILE, PLATE_THRESHOLDS, PR_BEATEN_THRESHOLDS,
  RUN_DISTANCES, RUN_TOLERANCE } from './health.constants';
import { casefoldExercise, computeHealthXp, computePrEvents, currentPrs, e1RM, healthBadges,
  liftPrEligible, loggedWeeks, prBonusIndices, PrPolicy } from './health-math';
import { HealthPr, HealthStat } from './health.types';
import { validateHealthPr } from './health-validate';

const today = '2026-10-31';
const dates = { v: 1 as const, measured_on: today, logged_on: today };
const lift = (kg: number, reps = 1, fields: Partial<HealthPr> = {}): HealthPr =>
  ({ ...dates, kind: 'lift', exercise: 'Squat', kg, reps, ...fields });
const run = (distance_m: number, seconds = 1800, fields: Partial<HealthPr> = {}): HealthPr =>
  ({ ...dates, kind: 'run', distance_m, seconds, ...fields });
const other = (value: number, direction: 'higher' | 'lower', fields: Partial<HealthPr> = {}): HealthPr =>
  ({ ...dates, kind: 'other', name: 'Synthetic score', unit: '', value, direction, ...fields });
const stat = (fields: Partial<HealthStat> = {}): HealthStat => ({ ...dates, kind: 'weight', kg: 80, ...fields });
// Explicit fixture policies exercise the caller boundary; production design is unresolved.
const policy: PrPolicy = { compareTies: (a, b) => a - b, otherSeries: r => `${r.name}/${r.unit}/${r.direction}` };
const events = (prs: readonly HealthPr[]) => computePrEvents(prs, policy);
const badges = (prs: readonly HealthPr[], stats: readonly HealthStat[] = [], now = today) =>
  healthBadges(stats, prs, events(prs), now);
const dateBefore = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) - days * 86400000).toISOString().slice(0, 10);
const weeksOfStats = (n: number, end = today) => Array.from({ length: n }, (_, i) => stat({ logged_on: dateBefore(end, i * 7) }));

describe('Health constants', () => {
  it('freezes all rule tables, including nested bounds', () => {
    for (const table of [HEALTH_XP, HEALTH_DAILY_CAP, HEALTH_LIMITS, RUN_DISTANCES, PLATE_THRESHOLDS,
      PR_BEATEN_THRESHOLDS, LOGGED_WEEK_THRESHOLDS, HEALTH_BADGES]) expect(Object.isFrozen(table)).toBeTrue();
    for (const value of Object.values(HEALTH_LIMITS)) if (Array.isArray(value)) expect(Object.isFrozen(value)).toBeTrue();
    expect(LB_PER_KG).toBe(0.45359237); expect(METRES_PER_MILE).toBe(1609.344); expect(RUN_TOLERANCE).toBe(1.02);
    expect(HEALTH_XP).toEqual({ statEntry: 5, labEntry: 5, checkup: 10, prEntry: 5, newPr: 15 });
    expect(HEALTH_DAILY_CAP).toEqual({ clinic: 15, gym: 30 });
    expect(RUN_DISTANCES).toEqual({ '5k': 5000, '10k': 10000, half: 21097.5, full: 42195 });
    expect(PLATE_THRESHOLDS).toEqual({ 135: 61.23, 225: 102.06, 315: 142.88, 405: 183.7 });
  });
  it('includes all 20 badge IDs and only the five supplied names', () => {
    const named = { first_pr_lift: 'First lift PR', pr_beaten_5: 'PR breaker ×5', plate_225: 'Two plates',
      run_10k: '10K finisher', logged_weeks_12: '12-week logger' };
    expect(Object.keys(HEALTH_BADGES).length).toBe(20);
    for (const [id, name] of Object.entries(HEALTH_BADGES)) expect(name).toBe(id in named ? named[id as keyof typeof named] : id);
  });
});

describe('Health PR math (AC-H4)', () => {
  for (const [reps, expected, eligible] of [[1, 100, true], [5, 116.6666666667, true],
    [12, 140, true], [13, 143.3333333333, false]] as const) {
    it(`Epley at ${reps} reps, eligibility ${eligible}`, () => {
      expect(e1RM(100, reps)).toBeCloseTo(expected, 8); expect(liftPrEligible(reps)).toBe(eligible);
      expect(events([lift(100, reps)]).length).toBe(eligible ? 1 : 0);
    });
  }
  it('uses e1RM rather than weight and ignores ineligible sets when finding first PR', () => {
    const prs = [lift(600, 13), lift(100), lift(90, 5), lift(105), lift(70, 50)];
    expect(events(prs).map(e => [e.index, e.first])).toEqual([[1, true], [2, false]]);
    expect(events([lift(0, 12)])[0].value).toBe(0);
    for (const reps of [0, 1.5, 50]) expect(liftPrEligible(reps)).toBeFalse();
  });
  for (const [a, b] of [['Squat', 'SQUAT'], ['Straße', 'STRASSE'], ['ẞ', 'ss'], ['Σ', 'ς'],
    ['ﬃ', 'FFI'], ['ﬁ', 'fi'], ['µ', 'μ'], ['İ', 'i\u0307'], ['Å', 'Å'], ['K', 'k'],
    ['\u13a0', '\uab70'], [' Cafe\u0301   press ', 'CAFÉ PRESS']]) {
    it(`casefolds ${a} and ${b} into the same exercise`, () => {
      expect(casefoldExercise(a)).toBe(casefoldExercise(b));
      expect(events([lift(100, 1, { exercise: a }), lift(110, 1, { exercise: b })]).map(e => e.first)).toEqual([true, false]);
    });
  }
  it('keeps distinct exercise names and Unicode dotless i separate', () => {
    expect(casefoldExercise('ı')).not.toBe(casefoldExercise('i'));
    expect(events([lift(100), lift(110, 1, { exercise: 'Press' })]).every(e => e.first)).toBeTrue();
  });
  it('recomputes after a backfill demotes a later PR; deleting it restores the previous best', () => {
    const old = lift(80, 1, { measured_on: '2020-01-01' });
    const recent = lift(100, 1, { measured_on: '2025-01-01' });
    const backfill = lift(120, 1, { measured_on: '2019-01-01' });
    expect(events([old, recent]).map(e => e.index)).toEqual([0, 1]);
    expect(events([old, recent, backfill]).map(e => [e.index, e.first])).toEqual([[2, true]]);
    expect(currentPrs(events([old, recent]))[0].index).toBe(1);
    expect(currentPrs(events([old]))[0].value).toBe(80);
    expect(events([old, { ...recent, kg: 70 }]).map(e => e.index)).toEqual([0]);
    expect(badges([old, recent])).toContain('pr_beaten_1');
    expect(badges([old, recent, backfill])).not.toContain('pr_beaten_1');
    expect(events([old, recent]).map(e => e.index)).toEqual([0, 1]);
  });
  it('sorts measured_on first, logged_on second and delegates exact ties without mutating records', () => {
    const prs = [lift(100, 1, { measured_on: '2025-01-02', logged_on: '2026-01-01' }),
      lift(90, 1, { measured_on: '2025-01-01', logged_on: '2026-02-01' }),
      lift(80, 1, { measured_on: '2025-01-01', logged_on: '2026-01-01' })];
    const snapshot = JSON.stringify(prs); prs.forEach(Object.freeze); Object.freeze(prs);
    expect(events(prs).map(e => e.index)).toEqual([2, 1, 0]); expect(JSON.stringify(prs)).toBe(snapshot);
    expect(computePrEvents([lift(80), lift(100)], { ...policy, compareTies: (a, b) => b - a }).map(e => e.index)).toEqual([1]);
  });
  for (const [id, distance] of Object.entries(RUN_DISTANCES)) {
    it(`${id}: accepts D and 1.02D, rejects below D and 1.021D`, () => {
      for (const ratio of [1, 1.02]) {
        const speed = events([run(distance * ratio, 1800 * ratio)]).find(e => e.metric === id);
        expect(speed?.value).toBeCloseTo(1800, 8); expect(speed?.first).toBeTrue();
      }
      for (const ratio of [0.999, 1.021]) expect(events([run(distance * ratio)]).some(e => e.metric === id)).toBeFalse();
    });
  }
  it('compares normalized speed and longest distance independently, with strict improvements', () => {
    const result = events([run(5000, 1800), run(5100, 1810), run(5100, 1810), run(10000, 4000)]);
    expect(result.map(e => [e.index, e.metric, e.first])).toEqual([
      [0, 'longest', true], [0, '5k', true], [1, 'longest', false], [1, '5k', false],
      [3, 'longest', false], [3, '10k', true],
    ]);
    expect(currentPrs(result).map(e => [e.metric, e.index])).toEqual([['longest', 3], ['5k', 1], ['10k', 3]]);
  });
  for (const direction of ['higher', 'lower'] as const) it(`compares other values with ${direction} direction`, () => {
    const sign = direction === 'higher' ? 1 : -1;
    expect(events([other(10 * sign, direction), other(11 * sign, direction), other(11 * sign, direction),
      other(9 * sign, direction)]).map(e => [e.index, e.first])).toEqual([[0, true], [1, false]]);
  });
  it('delegates other-series membership to the supplied policy', () => {
    const prs = [other(10, 'higher'), other(20, 'higher')];
    expect(computePrEvents(prs, { ...policy, otherSeries: (_r, index) => String(index) }).every(e => e.first)).toBeTrue();
  });
});

describe('Health XP (AC-H5)', () => {
  it('caps 50 backfilled records per building on logged_on, never measured_on', () => {
    const stats = Array.from({ length: 50 }, (_, i) => stat({ measured_on: dateBefore(today, i * 20) }));
    const prs = stats.map((s, i) => lift(100 + i, 1, { measured_on: s.measured_on }));
    const result = computeHealthXp(stats, prs, prBonusIndices(events(prs), true));
    expect([...result.clinic.days]).toEqual([[today, 15]]); expect([...result.gym.days]).toEqual([[today, 30]]);
    expect(result.clinic.xp).toBe(15); expect(result.gym.xp).toBe(30);
    expect(computeHealthXp(stats.map(s => ({ ...s, measured_on: '1900-01-01' })), prs, new Set()).clinic).toEqual(result.clinic);
  });
  it('adds the PR bonus to entry XP, once per qualifying entry, with explicit first-PR eligibility', () => {
    const prs = [run(5000), run(5100, 1700, { logged_on: '2026-11-01' })], result = events(prs);
    expect(prBonusIndices(result, true)).toEqual(new Set([0, 1]));
    expect(prBonusIndices(result, false)).toEqual(new Set([1]));
    expect([...computeHealthXp([], prs, prBonusIndices(result, true)).gym.days.values()]).toEqual([20, 20]);
    expect([...computeHealthXp([], prs, prBonusIndices(result, false)).gym.days.values()]).toEqual([5, 20]);
  });
  for (const [kind, xp] of [['weight', 5], ['rhr', 5], ['bp', 5], ['sleep', 5], ['lab', 5], ['checkup', 10]] as const) {
    it(`credits ${kind} at ${xp} XP`, () => expect(computeHealthXp([stat({ kind })], [], new Set()).clinic.xp).toBe(xp));
  }
  it('resets caps each day and recomputes XP after deletion', () => {
    const stats = [stat(), stat(), stat(), stat({ logged_on: '2026-11-01' })];
    expect(computeHealthXp(stats, [], new Set()).clinic.xp).toBe(20);
    expect(computeHealthXp(stats.slice(0, 1), [], new Set()).clinic.xp).toBe(5);
    expect(computeHealthXp([], [], new Set()).gym).toEqual({ xp: 0, level: 1, stage: 1, days: new Map() });
  });
  BUILDING_LV.forEach((threshold, index) => it(`uses Town level ${index + 1} at ${threshold} XP for both buildings`, () => {
    const stats = Array.from({ length: threshold / 5 }, (_, i) => stat({ logged_on: dateBefore(today, i) }));
    const result = computeHealthXp(stats, stats.map(s => lift(0, 1, { logged_on: s.logged_on })), new Set());
    for (const building of [result.clinic, result.gym]) {
      expect(building.level).toBe(index + 1); expect(building.stage).toBe(index === 0 ? 1 : index <= 2 ? 2 : 3);
    }
    expect(Object.keys(result)).toEqual(['clinic', 'gym']);
  }));
});

describe('Health badges', () => {
  it('has no badges without records; first badges require a PR entry of that kind', () => {
    expect(badges([])).toEqual([]);
    for (const pr of [lift(0, 13), run(100), other(1, 'higher')]) expect(badges([pr])).toContain(`first_pr_${pr.kind}`);
    expect(badges([lift(0, 13)])).not.toContain('pr_beaten_1');
  });
  for (const n of PR_BEATEN_THRESHOLDS) it(`pr_beaten_${n}: excludes first PRs, includes the exact threshold`, () => {
    const prs = Array.from({ length: n + 1 }, (_, i) => lift(i));
    expect(badges(prs.slice(0, -1))).not.toContain(`pr_beaten_${n}`);
    expect(badges(prs)).toContain(`pr_beaten_${n}`);
    expect(badges(prs.map((p, i) => ({ ...p, exercise: `Exercise ${i}` })))).not.toContain(`pr_beaten_${n}`);
  });
  for (const [id, kg] of Object.entries(PLATE_THRESHOLDS)) it(`plate_${id}: uses inclusive e1RM kg threshold`, () => {
    expect(badges([lift(kg - 0.001)]) as string[]).not.toContain(`plate_${id}`);
    expect(badges([lift(kg)]) as string[]).toContain(`plate_${id}`);
    expect(badges([lift(kg / 1.4 + 0.001, 12)]) as string[]).toContain(`plate_${id}`);
    // The badge table says any lift e1RM, not just PR-eligible sets.
    expect(badges([lift(kg, 13)]) as string[]).toContain(`plate_${id}`);
  });
  for (const lb of [135, 225, 315, 405] as const) {
    it(`plate_${lb}: validated lb input unlocks at the plate and not 0.01 kg below`, () => {
      const at = validateHealthPr(lift(lb), today, 'lb');
      expect(at.fieldErrors).toEqual({});
      expect(at.value.kg).toBe(PLATE_THRESHOLDS[lb]);
      expect(healthBadges([], [at.value], events([at.value]), today) as string[]).toContain(`plate_${lb}`);
      // Next lower stored kilogram, entered as its 2-decimal pound equivalent.
      const belowKg = Number((at.value.kg! - 0.01).toFixed(2));
      const below = validateHealthPr(lift(Number((belowKg / LB_PER_KG).toFixed(2))), today, 'lb');
      expect(below.fieldErrors).toEqual({});
      expect(below.value.kg).toBe(belowKg);
      expect(healthBadges([], [below.value], events([below.value]), today) as string[]).not.toContain(`plate_${lb}`);
    });
  }
  for (const [id, metres] of Object.entries(RUN_DISTANCES)) it(`run_${id}: uses inclusive distance without a speed tolerance ceiling`, () => {
    expect(badges([run(metres - 0.001)]) as string[]).not.toContain(`run_${id}`);
    expect(badges([run(metres)]) as string[]).toContain(`run_${id}`);
    expect(badges([run(metres * 1.021)]) as string[]).toContain(`run_${id}`);
  });
  for (const n of LOGGED_WEEK_THRESHOLDS) it(`logged_weeks_${n}: needs consecutive weeks ending this or last week`, () => {
    expect(badges([], weeksOfStats(n - 1))).not.toContain(`logged_weeks_${n}`);
    for (const end of [today, dateBefore(today, 7)]) expect(badges([], weeksOfStats(n, end))).toContain(`logged_weeks_${n}`);
    expect(badges([], weeksOfStats(n, dateBefore(today, 14)))).not.toContain(`logged_weeks_${n}`);
    expect(badges([], weeksOfStats(n).filter((_, i) => i !== 1))).not.toContain(`logged_weeks_${n}`);
    // Any health record counts, including a week that has only a PR.
    expect(badges(weeksOfStats(n).map(s => lift(1, 1, { logged_on: s.logged_on })))).toContain(`logged_weeks_${n}`);
  });
  it('uses ISO Monday boundaries across year and DST changes, deduplicating any health kind', () => {
    const records = [stat({ logged_on: '2020-12-27' }), run(100, 1, { logged_on: '2020-12-28' }),
      other(1, 'higher', { logged_on: '2021-01-03' }), lift(1, 1, { logged_on: '2021-01-04' })];
    expect(loggedWeeks(records, '2021-01-04')).toBe(3);
    expect(loggedWeeks(weeksOfStats(4, '2026-03-15'), '2026-03-16')).toBe(4);
    expect(loggedWeeks([stat({ logged_on: '2026-11-02' })], today)).toBe(0);
    expect(loggedWeeks([stat({ measured_on: '1900-01-01' })], today)).toBe(1);
  });
  it('recomputes all record-derived trophies after deletion', () => {
    expect(badges([lift(200), run(42195)])).toContain('plate_405');
    expect(badges([lift(200), run(42195)])).toContain('run_full');
    expect(badges([])).toEqual([]);
  });
});
