// Town Health rule tables (town-design §18). Frozen like town.constants:
// these literals are the contract THC2 builds on.
export const HEALTH_XP = Object.freeze({ statEntry: 5, labEntry: 5, checkup: 10, prEntry: 5, newPr: 15 } as const);
export const HEALTH_DAILY_CAP = Object.freeze({ clinic: 15, gym: 30 } as const);
// Historical contract name: this is kilograms per pound, multiplied by lb input.
export const LB_PER_KG = Object.freeze(0.45359237 as const);
export const METRES_PER_MILE = Object.freeze(1609.344 as const);
export const HEALTH_LIMITS = Object.freeze({
  weight: Object.freeze([20, 400] as const), rhr: Object.freeze([25, 220] as const),
  sys: Object.freeze([60, 260] as const), dia: Object.freeze([30, 160] as const),
  sleep: Object.freeze([0, 24] as const), sleepStep: 0.25,
  labNameMax: 60, unitMax: 16, noteMax: 500, exerciseMax: 40, otherNameMax: 40,
  liftKg: Object.freeze([0, 600] as const), reps: Object.freeze([1, 50] as const),
  prRepsMax: 12, distanceM: Object.freeze([100, 400000] as const),
  seconds: Object.freeze([1, 259200] as const), measuredOnMin: '1900-01-01',
} as const);
/** One workout collection. Canonical stored units are kilograms, metres, and seconds. */
export const WORKOUT_LIMITS = Object.freeze({
  exercises: 32,
  sets: 20,
  recordBytes: 32 * 1024,
  customExercises: 200,
  nameMax: 80,
  kg: Object.freeze([0, 600] as const),
  reps: Object.freeze([1, 50] as const),
  metres: Object.freeze([1, 400000] as const),
  seconds: Object.freeze([1, 259200] as const),
  effort: Object.freeze([1, 10] as const),
  duration: Object.freeze([1, 86400] as const),
} as const);
export const RUN_DISTANCES = Object.freeze({ '5k': 5000, '10k': 10000, half: 21097.5, full: 42195 } as const);
export const RUN_TOLERANCE = Object.freeze(1.02 as const);
const round = (value: number, places: number): number => Number(value.toFixed(places));
/** Stored weights are kg with 2 decimals; lb input converts and rounds (§18.8). */
export const lbToKg = (lb: number): number => round(lb * LB_PER_KG, 2);
// Plate cuts use the same 2-decimal conversion, or 135/315/405 lb would miss.
export const PLATE_THRESHOLDS = Object.freeze({
  135: lbToKg(135), 225: lbToKg(225), 315: lbToKg(315), 405: lbToKg(405),
} as const);
export const PR_BEATEN_THRESHOLDS = Object.freeze([1, 5, 10, 25, 50] as const);
export const LOGGED_WEEK_THRESHOLDS = Object.freeze([4, 12, 26, 52] as const);
// Display names settled on parent #90. The ids and the threshold tables above
// stay as they are. Explanations restate those same cuts.
export const HEALTH_BADGES = Object.freeze({
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
} as const);
export const HEALTH_BADGE_EXPLANATIONS = Object.freeze({
  first_pr_lift: 'The first lift personal record.',
  first_pr_run: 'The first run personal record.',
  first_pr_other: 'The first personal record that is not a lift or a run.',
  pr_beaten_1: '1 later personal record beat an earlier one.',
  pr_beaten_5: '5 later personal records beat an earlier one.',
  pr_beaten_10: '10 later personal records beat an earlier one.',
  pr_beaten_25: '25 later personal records beat an earlier one.',
  pr_beaten_50: '50 later personal records beat an earlier one.',
  plate_135: `A lift estimated max reached ${PLATE_THRESHOLDS[135]} kg.`,
  plate_225: `A lift estimated max reached ${PLATE_THRESHOLDS[225]} kg.`,
  plate_315: `A lift estimated max reached ${PLATE_THRESHOLDS[315]} kg.`,
  plate_405: `A lift estimated max reached ${PLATE_THRESHOLDS[405]} kg.`,
  run_5k: `A run reached ${RUN_DISTANCES['5k']} m.`,
  run_10k: `A run reached ${RUN_DISTANCES['10k']} m.`,
  run_half: `A run reached ${RUN_DISTANCES.half} m.`,
  run_full: `A run reached ${RUN_DISTANCES.full} m.`,
  logged_weeks_4: 'Health was logged for 4 consecutive weeks.',
  logged_weeks_12: 'Health was logged for 12 consecutive weeks.',
  logged_weeks_26: 'Health was logged for 26 consecutive weeks.',
  logged_weeks_52: 'Health was logged for 52 consecutive weeks.',
} as const);
