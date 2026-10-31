export type HealthStat = { v: 1, kind: 'weight'|'rhr'|'bp'|'sleep'|'lab'|'checkup',
  measured_on: string, logged_on: string,
  kg?: number, bpm?: number, sys?: number, dia?: number, hours?: number,
  lab?: { name: string, value: number, unit: string, ref_low?: number, ref_high?: number },
  note?: string }
export type HealthPr = { v: 1, kind: 'lift'|'run'|'other', measured_on: string, logged_on: string,
  exercise?: string, kg?: number, reps?: number,
  distance_m?: number, seconds?: number,
  name?: string, value?: number, unit?: string, direction?: 'higher'|'lower' }
