import {
  HEALTH_BADGES, HEALTH_DAILY_CAP, HEALTH_LIMITS, HEALTH_XP, LB_PER_KG,
  LOGGED_WEEK_THRESHOLDS, METRES_PER_MILE, PLATE_THRESHOLDS,
  PR_BEATEN_THRESHOLDS, RUN_DISTANCES, RUN_TOLERANCE,
} from './health.constants';

describe('Health constants (§18)', () => {
  it('freezes every rule table, including nested bounds', () => {
    for (const table of [HEALTH_XP, HEALTH_DAILY_CAP, HEALTH_LIMITS, RUN_DISTANCES,
      PLATE_THRESHOLDS, PR_BEATEN_THRESHOLDS, LOGGED_WEEK_THRESHOLDS, HEALTH_BADGES]) {
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

  it('has all 20 badge ids and only the five names §18.6 writes out', () => {
    const named: Record<string, string> = {
      first_pr_lift: 'First lift PR',
      pr_beaten_5: 'PR breaker ×5',
      plate_225: 'Two plates',
      run_10k: '10K finisher',
      logged_weeks_12: '12-week logger',
    };
    expect(Object.keys(HEALTH_BADGES).length).toBe(20);
    for (const [id, name] of Object.entries(HEALTH_BADGES)) {
      expect(name).toBe(id in named ? named[id] : id);
    }
  });
});
