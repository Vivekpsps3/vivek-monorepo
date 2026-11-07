import {
  casefoldExercise, computeHealthXp, computePrEvents, currentPrs, e1RM,
  healthBadges, liftPrEligible, loggedWeeks,
} from './health-math';
import type { HealthPr, HealthStat } from './health.types';

const today = '2026-10-31';
const dates = { v: 1 as const, measured_on: today, logged_on: today };
const lift = (kg: number, reps = 1, fields: Partial<HealthPr> = {}): HealthPr =>
  ({ ...dates, kind: 'lift', exercise: 'Squat', kg, reps, ...fields });
const run = (distance_m: number, seconds = 1800, fields: Partial<HealthPr> = {}): HealthPr =>
  ({ ...dates, kind: 'run', distance_m, seconds, ...fields });
const other = (value: number, direction: 'higher' | 'lower', fields: Partial<HealthPr> = {}): HealthPr =>
  ({ ...dates, kind: 'other', name: 'Plank', unit: 's', value, direction, ...fields });
const stat = (fields: Partial<HealthStat> = {}): HealthStat => ({ ...dates, kind: 'weight', kg: 80, ...fields });
const dayBefore = (day: string, days: number): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

describe('Health PR math (AC-H4)', () => {
  it('computes Epley e1RM and PR eligibility at reps 1, 5, 12 and 13', () => {
    expect(e1RM(100, 1)).toBe(100);
    expect(e1RM(100, 5)).toBeCloseTo(116.667, 3);
    expect(e1RM(100, 12)).toBe(140);
    expect(liftPrEligible(1)).toBeTrue();
    expect(liftPrEligible(12)).toBeTrue();
    expect(liftPrEligible(13)).toBeFalse();
    expect(computePrEvents([lift(100, 12)]).length).toBe(1);
    expect(computePrEvents([lift(100, 13)])).toEqual([]);
  });

  it('matches exercises case-insensitively, including Unicode folds', () => {
    for (const [a, b] of [['Squat', 'SQUAT'], ['Straße', 'STRASSE'], ['Σ', 'ς'], ['  Bench   press ', 'bench press']] as const) {
      expect(casefoldExercise(a)).toBe(casefoldExercise(b));
    }
    expect(casefoldExercise('ı')).not.toBe(casefoldExercise('i'));
    const events = computePrEvents([lift(100, 1, { exercise: 'Squat' }), lift(110, 1, { exercise: 'SQUAT' })]);
    expect(events.map(e => e.first)).toEqual([true, false]);
  });

  it('recomputes on backfill: an older bigger lift demotes a later PR; deleting restores it', () => {
    const recent = lift(100, 1, { measured_on: '2025-01-01' });
    const backfill = lift(120, 1, { measured_on: '2019-01-01' });
    expect(computePrEvents([recent]).map(e => e.index)).toEqual([0]);
    const withBackfill = computePrEvents([recent, backfill]);
    expect(withBackfill.map(e => [e.index, e.first])).toEqual([[1, true]]);
    expect(currentPrs(withBackfill)[0].value).toBe(120);
    // Deleting the backfill (recompute without it) restores the previous PR.
    expect(currentPrs(computePrEvents([recent]))[0].value).toBe(100);
  });

  it('orders by measured_on, then logged_on', () => {
    const a = lift(100, 1, { measured_on: '2026-01-02', logged_on: '2026-01-03' });
    const b = lift(110, 1, { measured_on: '2026-01-02', logged_on: '2026-01-02' });
    // b was logged first, so it sets the PR; a's smaller lift never registers.
    expect(computePrEvents([a, b]).map(e => e.index)).toEqual([1]);
  });

  it('applies the 1.02 run tolerance: ×1.02 qualifies, ×1.021 does not', () => {
    const atTolerance = computePrEvents([run(5100, 1500)]);
    expect(atTolerance.some(e => e.metric === '5k')).toBeTrue();
    const pastTolerance = computePrEvents([run(5105, 1500)]);
    expect(pastTolerance.some(e => e.metric === '5k')).toBeFalse();
    expect(pastTolerance.some(e => e.metric === 'longest')).toBeTrue();
    // Normalized time: 1500 s over 5100 m counts as 1470.59 s for 5k.
    const fiveK = atTolerance.find(e => e.metric === '5k')!;
    expect(fiveK.value).toBeCloseTo(1470.59, 2);
  });

  it('handles other-direction series both ways', () => {
    const higher = computePrEvents([other(60, 'higher'), other(50, 'higher'), other(70, 'higher')]);
    expect(higher.map(e => e.value)).toEqual([60, 70]);
    const lower = computePrEvents([other(60, 'lower'), other(70, 'lower'), other(50, 'lower')]);
    expect(lower.map(e => e.value)).toEqual([60, 50]);
    // A different unit is a different series.
    const separate = computePrEvents([other(60, 'higher'), other(30, 'higher', { unit: 'min' })]);
    expect(separate.every(e => e.first)).toBeTrue();
  });
});

describe('Health XP (AC-H5)', () => {
  it('caps 50 same-day records at Clinic 15 and Gym 30', () => {
    const stats = Array.from({ length: 50 }, () => stat({}));
    const prs = Array.from({ length: 50 }, (_, i) => lift(50 + i));
    const xp = computeHealthXp(stats, prs, computePrEvents(prs));
    expect(xp.clinic.days.get(today)).toBe(15);
    expect(xp.gym.days.get(today)).toBe(30);
    expect(xp.clinic.xp).toBe(15);
    expect(xp.gym.xp).toBe(30);
  });

  it('adds newPr on top of prEntry, first PRs included', () => {
    const prs = [lift(100)];
    const xp = computeHealthXp([], prs, computePrEvents(prs));
    expect(xp.gym.days.get(today)).toBe(20); // 5 prEntry + 15 newPr
    const plain = computeHealthXp([], [lift(50)], []);
    expect(plain.gym.days.get(today)).toBe(5); // no event, no bonus
  });

  it('prices checkups and labs into Clinic and derives level and stage', () => {
    const stats = [stat({ kind: 'checkup', note: '' }), stat({ kind: 'lab', lab: { name: 'Iron', value: 1, unit: '' } })];
    const xp = computeHealthXp(stats, [], []);
    expect(xp.clinic.days.get(today)).toBe(15); // 10 + 5, exactly at cap
    expect(xp.clinic.level).toBe(1);
    expect(xp.clinic.stage).toBe(1);
    const many = computeHealthXp(Array.from({ length: 40 }, () => stat({ kind: 'checkup', note: '' })), [], []);
    expect(many.clinic.xp).toBe(15);
  });
});

describe('Health badges (§18.6)', () => {
  it('awards first-PR badges from events only — an ineligible lift earns none', () => {
    expect(healthBadges([], [lift(100)], computePrEvents([lift(100)]), today)).toContain('first_pr_lift');
    const ineligible = [lift(600, 13)];
    expect(healthBadges([], ineligible, computePrEvents(ineligible), today)).not.toContain('first_pr_lift');
    expect(healthBadges([], [run(5000)], computePrEvents([run(5000)]), today)).toContain('first_pr_run');
  });

  it('counts beaten PRs excluding firsts', () => {
    const prs = Array.from({ length: 6 }, (_, i) => lift(100 + i));
    const badges = healthBadges([], prs, computePrEvents(prs), today);
    expect(badges).toContain('pr_beaten_1');
    expect(badges).toContain('pr_beaten_5');
    expect(badges).not.toContain('pr_beaten_10');
  });

  it('awards plates by e1RM and run finishes by distance', () => {
    const badges = healthBadges([], [lift(100, 5), run(10000)], computePrEvents([lift(100, 5), run(10000)]), today);
    expect(badges).toContain('plate_225'); // e1RM 116.7 ≥ 102.06
    expect(badges).not.toContain('plate_315');
    expect(badges).toContain('run_10k');
    expect(badges).not.toContain('run_half');
  });

  it('counts consecutive logged weeks ending this week or last week', () => {
    const twelve = Array.from({ length: 12 }, (_, i) => stat({ logged_on: dayBefore(today, i * 7) }));
    expect(loggedWeeks(twelve, today)).toBe(12);
    expect(healthBadges(twelve, [], [], today)).toContain('logged_weeks_12');
    // Nothing this week: the streak ending last week still counts.
    const lastWeekEnd = dayBefore(today, 7);
    const four = Array.from({ length: 4 }, (_, i) => stat({ logged_on: dayBefore(lastWeekEnd, i * 7) }));
    expect(loggedWeeks(four, today)).toBe(4);
    // A gap week breaks the streak.
    const gapped = [stat({}), stat({ logged_on: dayBefore(today, 21) })];
    expect(loggedWeeks(gapped, today)).toBe(1);
  });
});
