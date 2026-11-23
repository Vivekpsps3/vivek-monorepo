import {
  HEALTH_BADGES, HEALTH_BADGE_EXPLANATIONS, HEALTH_DAILY_CAP, HEALTH_LIMITS, HEALTH_XP, LB_PER_KG, WORKOUT_LIMITS,
  LOGGED_WEEK_THRESHOLDS, METRES_PER_MILE, PLATE_THRESHOLDS,
  PR_BEATEN_THRESHOLDS, RUN_DISTANCES, RUN_TOLERANCE,
} from './health.constants';

describe('Health constants (§18)', () => {
  it('freezes every rule table, including nested bounds', () => {
    for (const table of [HEALTH_XP, HEALTH_DAILY_CAP, HEALTH_LIMITS, WORKOUT_LIMITS, RUN_DISTANCES,
      PLATE_THRESHOLDS, PR_BEATEN_THRESHOLDS, LOGGED_WEEK_THRESHOLDS, HEALTH_BADGES, HEALTH_BADGE_EXPLANATIONS]) {
      expect(Object.isFrozen(table)).toBeTrue();
    }
    for (const value of Object.values(HEALTH_LIMITS)) {
      if (Array.isArray(value)) expect(Object.isFrozen(value)).toBeTrue();
    }
  });

  it('carries the XP amounts and daily caps AC-H5 pins', () => {
    expect(HEALTH_XP).toEqual({ statEntry: 5, labEntry: 5, checkup: 10, prEntry: 5, newPr: 15 });
    expect(HEALTH_DAILY_CAP).toEqual({ clinic: 15, gym: 30 });
  });

  it('carries the conversion factors and run table', () => {
    expect(LB_PER_KG).toBe(0.45359237);
    expect(METRES_PER_MILE).toBe(1609.344);
    expect(RUN_TOLERANCE).toBe(1.02);
    expect(RUN_DISTANCES).toEqual({ '5k': 5000, '10k': 10000, half: 21097.5, full: 42195 });
  });

  it('derives plate thresholds with the stored 2-decimal lb conversion', () => {
    expect(PLATE_THRESHOLDS).toEqual({ 135: 61.23, 225: 102.06, 315: 142.88, 405: 183.7 });
  });

  it('keeps the beaten-record and logged-week thresholds', () => {
    expect(PR_BEATEN_THRESHOLDS).toEqual([1, 5, 10, 25, 50]);
    expect(LOGGED_WEEK_THRESHOLDS).toEqual([4, 12, 26, 52]);
  });

  it('uses the twenty settled badge names and explains the same thresholds', () => {
    expect(HEALTH_BADGES).toEqual({
      first_pr_lift: 'First lift PR',
      first_pr_run: 'First run PR',
      first_pr_other: 'First personal best',
      pr_beaten_1: 'PR breaker',
      pr_beaten_5: 'PR breaker ×5',
      pr_beaten_10: 'PR breaker ×10',
      pr_beaten_25: 'PR breaker ×25',
      pr_beaten_50: 'PR breaker ×50',
      plate_135: 'One plate',
      plate_225: 'Two plates',
      plate_315: 'Three plates',
      plate_405: 'Four plates',
      run_5k: '5K finisher',
      run_10k: '10K finisher',
      run_half: 'Half-marathon finisher',
      run_full: 'Marathon finisher',
      logged_weeks_4: '4-week logger',
      logged_weeks_12: '12-week logger',
      logged_weeks_26: '26-week logger',
      logged_weeks_52: '52-week logger',
    });
    expect(Object.keys(HEALTH_BADGE_EXPLANATIONS)).toEqual(Object.keys(HEALTH_BADGES));
    expect(HEALTH_BADGE_EXPLANATIONS.plate_135).toBe(`A lift estimated max reached ${PLATE_THRESHOLDS[135]} kg.`);
    expect(HEALTH_BADGE_EXPLANATIONS.plate_225).toBe(`A lift estimated max reached ${PLATE_THRESHOLDS[225]} kg.`);
    expect(HEALTH_BADGE_EXPLANATIONS.plate_315).toBe(`A lift estimated max reached ${PLATE_THRESHOLDS[315]} kg.`);
    expect(HEALTH_BADGE_EXPLANATIONS.plate_405).toBe(`A lift estimated max reached ${PLATE_THRESHOLDS[405]} kg.`);
    expect(HEALTH_BADGE_EXPLANATIONS.run_5k).toBe(`A run reached ${RUN_DISTANCES['5k']} m.`);
    expect(HEALTH_BADGE_EXPLANATIONS.run_10k).toBe(`A run reached ${RUN_DISTANCES['10k']} m.`);
    expect(HEALTH_BADGE_EXPLANATIONS.run_half).toBe(`A run reached ${RUN_DISTANCES.half} m.`);
    expect(HEALTH_BADGE_EXPLANATIONS.run_full).toBe(`A run reached ${RUN_DISTANCES.full} m.`);
    for (const count of PR_BEATEN_THRESHOLDS) {
      expect(HEALTH_BADGE_EXPLANATIONS[`pr_beaten_${count}`]).toContain(String(count));
    }
    for (const count of LOGGED_WEEK_THRESHOLDS) {
      expect(HEALTH_BADGE_EXPLANATIONS[`logged_weeks_${count}`]).toContain(String(count));
    }
    for (const [id, name] of Object.entries(HEALTH_BADGES)) {
      expect(name).not.toBe(id);
      expect(HEALTH_BADGE_EXPLANATIONS[id as keyof typeof HEALTH_BADGE_EXPLANATIONS]).not.toBe(id);
    }
  });
});
