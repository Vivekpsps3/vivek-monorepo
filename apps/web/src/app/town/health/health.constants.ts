export const HEALTH_XP = Object.freeze({ statEntry: 5, labEntry: 5, checkup: 10, prEntry: 5, newPr: 15 });
export const HEALTH_DAILY_CAP = Object.freeze({ clinic: 15, gym: 30 });
// Historical contract name: this is kilograms per pound, multiplied by lb input.
export const LB_PER_KG = Object.freeze(0.45359237);
export const METRES_PER_MILE = Object.freeze(1609.344);
export const HEALTH_LIMITS = Object.freeze({
  weight: Object.freeze([20, 400] as const), rhr: Object.freeze([25, 220] as const),
  sys: Object.freeze([60, 260] as const), dia: Object.freeze([30, 160] as const),
  sleep: Object.freeze([0, 24] as const), sleepStep: 0.25,
  labNameMax: 60, unitMax: 16, noteMax: 500, exerciseMax: 40, otherNameMax: 40,
  liftKg: Object.freeze([0, 600] as const), reps: Object.freeze([1, 50] as const),
  prRepsMax: 12, distanceM: Object.freeze([100, 400000] as const),
  seconds: Object.freeze([1, 259200] as const), measuredOnMin: '1900-01-01',
});
export const RUN_DISTANCES = Object.freeze({ '5k': 5000, '10k': 10000, half: 21097.5, full: 42195 });
export const RUN_TOLERANCE = Object.freeze(1.02);
export const PLATE_THRESHOLDS = Object.freeze({ 135: 61.235, 225: 102.058, 315: 142.882, 405: 183.705 });
export const PR_BEATEN_THRESHOLDS = Object.freeze([1, 5, 10, 25, 50] as const);
export const LOGGED_WEEK_THRESHOLDS = Object.freeze([4, 12, 26, 52] as const);
export const HEALTH_BADGE_NAMES = Object.freeze({
  first_pr_lift: 'First lift PR',
  first_pr_run: 'first_pr_run', // TODO(design): name
  first_pr_other: 'first_pr_other', // TODO(design): name
  pr_beaten_1: 'pr_beaten_1', // TODO(design): name
  pr_beaten_5: 'PR breaker ×5',
  pr_beaten_10: 'pr_beaten_10', // TODO(design): name
  pr_beaten_25: 'pr_beaten_25', // TODO(design): name
  pr_beaten_50: 'pr_beaten_50', // TODO(design): name
  plate_135: 'plate_135', // TODO(design): name
  plate_225: 'Two plates',
  plate_315: 'plate_315', // TODO(design): name
  plate_405: 'plate_405', // TODO(design): name
  run_5k: 'run_5k', // TODO(design): name
  run_10k: '10K finisher',
  run_half: 'run_half', // TODO(design): name
  run_full: 'run_full', // TODO(design): name
  logged_weeks_4: 'logged_weeks_4', // TODO(design): name
  logged_weeks_12: '12-week logger',
  logged_weeks_26: 'logged_weeks_26', // TODO(design): name
  logged_weeks_52: 'logged_weeks_52', // TODO(design): name
});
