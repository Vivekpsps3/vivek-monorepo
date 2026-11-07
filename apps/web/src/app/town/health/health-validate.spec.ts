import { HealthPr, HealthStat } from './health.types';
import { isHealthDate, normalizeHealthText, validateHealthPr, validateHealthStat } from './health-validate';

const dates = { v: 1 as const, measured_on: '2026-10-31', logged_on: '2026-10-31' };
const stat = (kind: HealthStat['kind'], fields = {}): HealthStat => ({ ...dates, kind, ...fields });
const pr = (kind: HealthPr['kind'], fields = {}): HealthPr => ({ ...dates, kind, ...fields });
const errors = (record: HealthStat | HealthPr) => ['lift', 'run', 'other'].includes(record.kind)
  ? validateHealthPr(record as HealthPr, dates.logged_on).fieldErrors
  : validateHealthStat(record as HealthStat, dates.logged_on).fieldErrors;

describe('Health validation boundaries', () => {
  for (const [record, field, min, max] of [
    [stat('weight'), 'kg', 20, 400], [stat('rhr'), 'bpm', 25, 220],
    [stat('bp', { dia: 30 }), 'sys', 60, 260], [stat('bp', { sys: 260 }), 'dia', 30, 160],
    [stat('sleep'), 'hours', 0, 24], [pr('lift', { exercise: 'Squat', reps: 1 }), 'kg', 0, 600],
    [pr('lift', { exercise: 'Squat', kg: 0 }), 'reps', 1, 50],
    [pr('run', { seconds: 1 }), 'distance_m', 100, 400000],
    [pr('run', { distance_m: 100 }), 'seconds', 1, 259200],
  ] as const) it(`${record.kind}.${field}: accepts endpoints, rejects outside and nonfinite`, () => {
    for (const value of [min, max]) expect(errors({ ...record, [field]: value })).toEqual({});
    for (const value of [min - 1, max + 1, NaN, Infinity, -Infinity, undefined]) {
      expect(errors({ ...record, [field]: value })[field]).toBeDefined();
    }
  });
  it('requires integer bpm, pressure and repetitions; quarter-hour sleep; sys > dia', () => {
    for (const record of [stat('rhr', { bpm: 60.5 }), stat('bp', { sys: 120.5, dia: 80 }),
      stat('bp', { sys: 120, dia: 80.5 }), pr('lift', { exercise: 'Squat', kg: 50, reps: 1.5 }),
      stat('sleep', { hours: 7.1 }), stat('bp', { sys: 100, dia: 100 }), stat('bp', { sys: 90, dia: 100 })]) {
      expect(Object.keys(errors(record)).length).toBeGreaterThan(0);
    }
    expect(errors(stat('sleep', { hours: 7.25 }))).toEqual({});
    expect(errors(stat('bp', { sys: 61, dia: 60 }))).toEqual({});
    expect(errors(pr('lift', { exercise: 'Squat', kg: 100, reps: 13 }))).toEqual({});
    expect(errors(pr('lift', { exercise: 'Squat', kg: 100, reps: 12 }))).toEqual({});
  });
  for (const [field, min, max] of [['lab.name', 1, 60], ['lab.unit', 0, 16], ['note', 0, 500],
    ['exercise', 1, 40], ['name', 1, 40], ['unit', 0, 16]] as const) {
    it(`${field}: counts normalized Unicode code points at both boundaries`, () => {
      const record = (text: string) => field.startsWith('lab.')
        ? stat('lab', { lab: { name: 'LDL', unit: '', value: 1, [field.slice(4)]: text } })
        : field === 'note' ? stat('checkup', { note: text })
          : field === 'exercise' ? pr('lift', { exercise: text, kg: 0, reps: 1 })
            : pr('other', { name: 'Plank', unit: '', value: 1, direction: 'higher', [field]: text });
      for (const length of [min, max]) expect(errors(record(` ${'😀'.repeat(length)} `))).toEqual({});
      expect(errors(record('a'.repeat(max + 1)))[field]).toBe('length');
      if (min) expect(errors(record(''))[field]).toBe('length');
    });
  }
  it('normalizes NFC and whitespace without mutating inputs', () => {
    expect(normalizeHealthText('  Cafe\u0301  press  ')).toBe('Café press');
    const input = stat('lab', { lab: { name: '  Cafe\u0301  ', unit: ' mg/dL ', value: 1 } });
    expect(validateHealthStat(input, dates.logged_on).value.lab?.name).toBe('Café');
    expect(input.lab?.name).toBe('  Cafe\u0301  ');
  });
  it('rejects every C0/C1 control and bidi override, including whitespace controls', () => {
    const codes = [...Array.from({ length: 32 }, (_, i) => i), ...Array.from({ length: 33 }, (_, i) => i + 127),
      ...Array.from({ length: 5 }, (_, i) => i + 0x202a), ...Array.from({ length: 4 }, (_, i) => i + 0x2066)];
    for (const code of codes) expect(errors(stat('checkup', { note: `a${String.fromCodePoint(code)}b` }))['note'])
      .toBe('Use letters, numbers and punctuation only.');
  });
  it('checks finite lab/other values, ordered reference bounds, and required direction', () => {
    for (const value of [-1, 0, 1]) {
      expect(errors(stat('lab', { lab: { name: 'LDL', unit: '', value, ref_low: 0, ref_high: 1 } }))).toEqual({});
      for (const direction of ['higher', 'lower']) expect(errors(pr('other', { name: 'Score', unit: '', value, direction }))).toEqual({});
    }
    for (const value of [NaN, Infinity, -Infinity]) {
      expect(errors(stat('lab', { lab: { name: 'LDL', unit: '', value } }))['lab.value']).toBeDefined();
      expect(errors(pr('other', { name: 'Score', unit: '', value, direction: 'higher' }))['value']).toBeDefined();
    }
    for (const ref_high of [0, -1]) expect(errors(stat('lab', { lab: { name: 'LDL', unit: '', value: 1, ref_low: 0, ref_high } }))['lab.ref_high']).toBeDefined();
    for (const bounds of [{ ref_low: 0 }, { ref_high: 1 }, {}]) expect(errors(stat('lab', { lab: { name: 'LDL', unit: '', value: 1, ...bounds } }))).toEqual({});
    expect(errors(pr('other', { name: 'Score', unit: '', value: 1 }))['direction']).toBe('required');
    expect(errors(stat('lab'))['lab']).toBe('required');
  });
  it('accepts the date endpoints and leap dates, rejects invalid or out-of-window dates', () => {
    for (const measured_on of ['1900-01-01', dates.logged_on, '2024-02-29']) expect(errors(stat('weight', { kg: 20, measured_on }))).toEqual({});
    for (const measured_on of ['1899-12-31', '2026-11-01', '2026-02-29', '2026-04-31', '2026-1-01', 'bad']) {
      expect(errors(stat('weight', { kg: 20, measured_on }))['measured_on']).toBeDefined();
    }
    expect(isHealthDate('1900-02-29')).toBeFalse();
  });
  it('returns field errors for missing fields without throwing', () => {
    for (const record of [stat('weight'), stat('rhr'), stat('bp'), stat('sleep'), stat('lab'),
      stat('checkup'), pr('lift'), pr('run'), pr('other')]) {
      expect(() => errors(record)).not.toThrow();
      expect(Object.keys(errors(record)).length).toBeGreaterThan(0);
    }
    expect(errors(pr('other', { name: 'Score', unit: '', value: 1, direction: 'sideways' }))['direction']).toBe('required');
  });
  it('applies text rejection to every text field and preserves normalization of successful PRs', () => {
    const bad = 'a\u202eb';
    for (const [record, field] of [
      [stat('lab', { lab: { name: bad, unit: '', value: 1 } }), 'lab.name'],
      [stat('lab', { lab: { name: 'LDL', unit: bad, value: 1 } }), 'lab.unit'],
      [pr('lift', { exercise: bad, kg: 0, reps: 1 }), 'exercise'],
      [pr('other', { name: bad, unit: '', value: 1, direction: 'higher' }), 'name'],
      [pr('other', { name: 'Score', unit: bad, value: 1, direction: 'higher' }), 'unit'],
    ] as const) expect(errors(record)[field]).toBe('Use letters, numbers and punctuation only.');
    const input = pr('other', { name: '  Plank  hold  ', unit: '  s  ', value: 60, direction: 'higher' });
    const result = validateHealthPr(input, dates.logged_on);
    expect(result.fieldErrors).toEqual({}); expect(result.value.name).toBe('Plank hold');
    expect(result.value.unit).toBe('s'); expect(input.name).toBe('  Plank  hold  ');
  });
  it('validates measured_on for PRs as well as stats', () => {
    for (const measured_on of ['1900-01-01', dates.logged_on]) {
      expect(errors(pr('run', { distance_m: 100, seconds: 1, measured_on }))).toEqual({});
    }
    for (const measured_on of ['1899-12-31', '2026-11-01', '2026-13-01']) {
      expect(errors(pr('run', { distance_m: 100, seconds: 1, measured_on }))['measured_on']).toBeDefined();
    }
  });
  it('converts lb input before range validation and leaves the source untouched', () => {
    const input = stat('weight', { kg: 100 });
    const converted = validateHealthStat(input, dates.logged_on, 'lb');
    expect(converted.value.kg).toBe(45.36); expect(input.kg).toBe(100);
    expect(converted.value.v).toBe(1); expect(converted.value.logged_on).toBe(input.logged_on);
    expect(converted.value.measured_on).toBe(input.measured_on);
    // Round to 0.01 kg first, then apply 20 and 400. 44.09 lb is 19.9989 kg → 20.00.
    expect(validateHealthStat(stat('weight', { kg: 44.09 }), dates.logged_on, 'lb').value.kg).toBe(20);
    expect(validateHealthStat(stat('weight', { kg: 44.08 }), dates.logged_on, 'lb').fieldErrors['kg']).toBe('range');
    expect(validateHealthStat(stat('weight', { kg: 881.84 }), dates.logged_on, 'lb').value.kg).toBe(400);
    expect(validateHealthStat(stat('weight', { kg: 881.83 }), dates.logged_on, 'lb').value.kg).toBe(399.99);
    expect(validateHealthStat(stat('weight', { kg: 881.87 }), dates.logged_on, 'lb').fieldErrors['kg']).toBe('range');
    expect(validateHealthStat(stat('weight', { kg: 44.0925 }), dates.logged_on, 'lb').fieldErrors).toEqual({});
    expect(validateHealthStat(stat('weight', { kg: 881.849 }), dates.logged_on, 'lb').fieldErrors).toEqual({});
    expect(validateHealthStat(stat('weight', { kg: 40 }), dates.logged_on, 'lb').fieldErrors['kg']).toBe('range');
    const lift = validateHealthPr(pr('lift', { exercise: 'Squat', kg: 225, reps: 5 }), dates.logged_on, 'lb');
    expect(lift.value.kg).toBe(102.06); expect(lift.value.reps).toBe(5);
    expect(validateHealthPr(pr('lift', { exercise: 'Squat', kg: 0, reps: 1 }), dates.logged_on, 'lb').value.kg).toBe(0);
    expect(validateHealthPr(pr('lift', { exercise: 'Squat', kg: 1322.77, reps: 1 }), dates.logged_on, 'lb').value.kg).toBe(600);
    expect(validateHealthPr(pr('lift', { exercise: 'Squat', kg: 1322.8, reps: 1 }), dates.logged_on, 'lb').fieldErrors['kg']).toBe('range');
  });
  it('counts a flag as two code points and a combining pair as one after NFC', () => {
    const flag = '🇮🇳';
    expect([...flag].length).toBe(2);
    expect(errors(pr('lift', { exercise: `${'a'.repeat(38)}${flag}`, kg: 0, reps: 1 }))).toEqual({});
    expect(errors(pr('lift', { exercise: `${'a'.repeat(39)}${flag}`, kg: 0, reps: 1 }))['exercise']).toBe('length');
    const pair = 'e\u0301';
    expect(errors(pr('other', { name: pair.repeat(40), unit: '', value: 1, direction: 'higher' }))).toEqual({});
    expect(errors(pr('other', { name: pair.repeat(41), unit: '', value: 1, direction: 'higher' }))['name']).toBe('length');
    expect(validateHealthPr(pr('other', { name: `  ${pair.repeat(40)}  `, unit: '', value: 1, direction: 'higher' }), dates.logged_on).value.name)
      .toBe('é'.repeat(40));
  });
  it('allows neighbors of the control and bidi ranges and collapses Unicode whitespace', () => {
    for (const note of ['a b', 'a\u00a0b', 'a\u2028b', 'a\u2029b', 'a\u2065b', 'a\u007eb', 'a\u00a0\u00a0b']) {
      expect(errors(stat('checkup', { note }))).toEqual({});
    }
    expect(validateHealthStat(stat('checkup', { note: '  a\u00a0\u00a0b \u2028 c  ' }), dates.logged_on).value.note).toBe('a b c');
    expect(errors(stat('checkup', { note: 'a\u2064b' }))).toEqual({});
    expect(errors(stat('checkup', { note: 'a\u206ab' }))).toEqual({});
  });
});
