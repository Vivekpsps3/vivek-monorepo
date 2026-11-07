import { CONTROL_TEXT_MESSAGE, isHealthDate, normalizeHealthText, validateHealthPr, validateHealthStat } from './health-validate';
import type { HealthPr, HealthStat } from './health.types';

const today = '2026-10-31';
const dates = { v: 1 as const, measured_on: '2026-10-30', logged_on: '2026-10-31' };
const stat = (fields: Partial<HealthStat>): HealthStat => ({ ...dates, kind: 'weight', kg: 80, ...fields });
const pr = (fields: Partial<HealthPr>): HealthPr => ({ ...dates, kind: 'lift', exercise: 'Squat', kg: 100, reps: 5, ...fields });

describe('Health validation (§18.4)', () => {
  it('normalizes text per §8.4 and rejects control/bidi characters verbatim', () => {
    expect(normalizeHealthText('  Bench   press  ')).toBe('Bench press');
    expect(normalizeHealthText('Café')).toBe('Café');
    const bad = validateHealthPr(pr({ exercise: 'Sq‮uat' }), today);
    expect(bad.fieldErrors['exercise']).toBe(CONTROL_TEXT_MESSAGE);
    const ctrl = validateHealthStat(stat({ kind: 'checkup', note: 'ok\u0007' }), today);
    expect(ctrl.fieldErrors['note']).toBe(CONTROL_TEXT_MESSAGE);
  });

  it('validates dates strictly', () => {
    expect(isHealthDate('2026-02-29')).toBeFalse();
    expect(isHealthDate('2024-02-29')).toBeTrue();
    expect(isHealthDate('2026-1-1')).toBeFalse();
    expect(validateHealthStat(stat({ measured_on: '1899-12-31' }), today).fieldErrors['measured_on']).toBe('date_range');
    expect(validateHealthStat(stat({ measured_on: '1900-01-01' }), today).fieldErrors).toEqual({});
    expect(validateHealthStat(stat({ measured_on: '2026-11-01' }), today).fieldErrors['measured_on']).toBe('date_range');
  });

  it('checks weight at both boundaries, and lb input converts to 0.01 kg', () => {
    expect(validateHealthStat(stat({ kg: 20 }), today).fieldErrors).toEqual({});
    expect(validateHealthStat(stat({ kg: 400 }), today).fieldErrors).toEqual({});
    expect(validateHealthStat(stat({ kg: 19.99 }), today).fieldErrors['kg']).toBe('range');
    expect(validateHealthStat(stat({ kg: 400.01 }), today).fieldErrors['kg']).toBe('range');
    const fromLb = validateHealthStat(stat({ kg: 220 }), today, 'lb');
    expect(fromLb.value.kg).toBe(99.79);
    expect(fromLb.fieldErrors).toEqual({});
  });

  it('checks rhr and blood pressure, including sys greater than dia', () => {
    expect(validateHealthStat(stat({ kind: 'rhr', bpm: 25 }), today).fieldErrors).toEqual({});
    expect(validateHealthStat(stat({ kind: 'rhr', bpm: 220 }), today).fieldErrors).toEqual({});
    expect(validateHealthStat(stat({ kind: 'rhr', bpm: 24 }), today).fieldErrors['bpm']).toBe('range');
    expect(validateHealthStat(stat({ kind: 'rhr', bpm: 60.5 }), today).fieldErrors['bpm']).toBe('integer');
    const bp = (sys: number, dia: number) => validateHealthStat(stat({ kind: 'bp', sys, dia }), today).fieldErrors;
    expect(bp(60, 30)).toEqual({});
    expect(bp(260, 160)).toEqual({});
    expect(bp(90, 90)['sys']).toBe('greater_than_dia');
    expect(bp(261, 100)['sys']).toBe('range');
  });

  it('checks sleep hours and the quarter-hour step', () => {
    expect(validateHealthStat(stat({ kind: 'sleep', hours: 7.25 }), today).fieldErrors).toEqual({});
    expect(validateHealthStat(stat({ kind: 'sleep', hours: 0 }), today).fieldErrors).toEqual({});
    expect(validateHealthStat(stat({ kind: 'sleep', hours: 24 }), today).fieldErrors).toEqual({});
    expect(validateHealthStat(stat({ kind: 'sleep', hours: 7.3 }), today).fieldErrors['hours']).toBe('step');
    expect(validateHealthStat(stat({ kind: 'sleep', hours: 24.25 }), today).fieldErrors['hours']).toBe('range');
  });

  it('checks labs: name/unit lengths, finite value, ordered refs', () => {
    const lab = (fields: Partial<NonNullable<HealthStat['lab']>>) =>
      validateHealthStat(stat({ kind: 'lab', lab: { name: 'Iron', value: 12, unit: 'ng/mL', ...fields } }), today);
    expect(lab({}).fieldErrors).toEqual({});
    expect(lab({ name: 'x'.repeat(61) }).fieldErrors['lab.name']).toBe('length');
    expect(lab({ unit: 'x'.repeat(17) }).fieldErrors['lab.unit']).toBe('length');
    expect(lab({ value: Number.NaN }).fieldErrors['lab.value']).toBe('finite');
    expect(lab({ ref_low: 10, ref_high: 10 }).fieldErrors['lab.ref_high']).toBe('greater_than_ref_low');
    expect(validateHealthStat(stat({ kind: 'lab', lab: undefined }), today).fieldErrors['lab']).toBe('required');
  });

  it('checks checkup note length and lift/run/other PR fields at boundaries', () => {
    expect(validateHealthStat(stat({ kind: 'checkup', note: 'x'.repeat(500) }), today).fieldErrors).toEqual({});
    expect(validateHealthStat(stat({ kind: 'checkup', note: 'x'.repeat(501) }), today).fieldErrors['note']).toBe('length');
    expect(validateHealthPr(pr({ kg: 0 }), today).fieldErrors).toEqual({});
    expect(validateHealthPr(pr({ kg: 600 }), today).fieldErrors).toEqual({});
    expect(validateHealthPr(pr({ kg: 600.01 }), today).fieldErrors['kg']).toBe('range');
    expect(validateHealthPr(pr({ reps: 1 }), today).fieldErrors).toEqual({});
    expect(validateHealthPr(pr({ reps: 50 }), today).fieldErrors).toEqual({});
    expect(validateHealthPr(pr({ reps: 51 }), today).fieldErrors['reps']).toBe('range');
    expect(validateHealthPr(pr({ reps: 2.5 }), today).fieldErrors['reps']).toBe('integer');
    expect(validateHealthPr(pr({ exercise: 'x'.repeat(41) }), today).fieldErrors['exercise']).toBe('length');
    const run = (fields: Partial<HealthPr>) => validateHealthPr({ ...dates, kind: 'run', distance_m: 5000, seconds: 1500, ...fields }, today).fieldErrors;
    expect(run({ distance_m: 100 })).toEqual({});
    expect(run({ distance_m: 400000 })).toEqual({});
    expect(run({ distance_m: 99 })['distance_m']).toBe('range');
    expect(run({ seconds: 259200 })).toEqual({});
    expect(run({ seconds: 259201 })['seconds']).toBe('range');
    const other = (fields: Partial<HealthPr>) => validateHealthPr({ ...dates, kind: 'other', name: 'Plank', unit: 's', value: 60, direction: 'higher', ...fields }, today).fieldErrors;
    expect(other({})).toEqual({});
    expect(other({ direction: undefined })['direction']).toBe('required');
    expect(other({ name: '' })['name']).toBe('length');
  });

  it('never throws on hostile input', () => {
    expect(() => validateHealthStat(stat({ kg: Number.POSITIVE_INFINITY }), today)).not.toThrow();
    expect(validateHealthStat(stat({ kg: Number.POSITIVE_INFINITY }), today).fieldErrors['kg']).toBe('finite');
  });
});
