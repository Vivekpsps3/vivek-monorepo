import { displayWeight } from './health-units';
import {
  DEFAULT_HEALTH_UNITS,
  EMPTY_HEALTH_DRAFT,
  corruptNotice,
  firstHealthField,
  formatHealthPr,
  formatHealthStat,
  healthFieldId,
  healthFieldMessage,
  parseHealthNumber,
  readHealthUnits,
  writeHealthUnits,
} from './health-entry';
import { CONTROL_TEXT_MESSAGE } from './health-validate';
import type { HealthPr, HealthStat } from './health.types';

const DAY = '2026-10-28';

function memory(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

describe('Health entry shell helpers', () => {
  const weight: HealthStat = { v: 1, kind: 'weight', measured_on: DAY, logged_on: DAY, kg: 80 };
  const lift: HealthPr = {
    v: 1, kind: 'lift', measured_on: DAY, logged_on: DAY, exercise: 'Squat', kg: 100, reps: 5,
  };

  it('formats with the canonical display functions and does not rewrite the record', () => {
    const units = { weight: 'lb' as const, distance: 'mi' as const };
    expect(formatHealthStat(weight, units)).toBe(`Weight · ${displayWeight(80, 'lb')} lb · ${DAY}`);
    expect(displayWeight(80, 'lb')).toBe('176.4');
    expect(formatHealthStat(weight, { ...units, weight: 'kg' })).toBe(`Weight · 80.0 kg · ${DAY}`);
    expect(formatHealthPr(lift, units)).toBe(`Lift · Squat · ${displayWeight(100, 'lb')} lb · 5 reps · ${DAY}`);
    expect(displayWeight(100, 'lb')).toBe('220.5');
    expect(weight).toEqual({ v: 1, kind: 'weight', measured_on: DAY, logged_on: DAY, kg: 80 });
    expect(lift.kg).toBe(100);
    const run: HealthPr = {
      v: 1, kind: 'run', measured_on: DAY, logged_on: DAY, distance_m: 5000, seconds: 1500,
    };
    expect(formatHealthPr(run, { weight: 'kg', distance: 'km' })).toBe(`Run · 5.00 km · 5:00 /km · ${DAY}`);
  });

  it('keeps display units per owner and ignores a blocked or malformed store', () => {
    const storage = memory();
    expect(readHealthUnits(7, storage)).toEqual(DEFAULT_HEALTH_UNITS);
    writeHealthUnits(7, { weight: 'kg', distance: 'km' }, storage);
    expect(readHealthUnits(7, storage)).toEqual({ weight: 'kg', distance: 'km' });
    expect(readHealthUnits(8, storage)).toEqual(DEFAULT_HEALTH_UNITS);
    storage.setItem('town.health.units.v1.7', '{');
    expect(readHealthUnits(7, storage)).toEqual(DEFAULT_HEALTH_UNITS);
    storage.setItem('town.health.units.v1.7', JSON.stringify({ weight: 'stone', distance: 'league' }));
    expect(readHealthUnits(7, storage)).toEqual(DEFAULT_HEALTH_UNITS);
    storage.setItem('town.health.units.v1.7', 'x'.repeat(65));
    expect(readHealthUnits(7, storage)).toEqual(DEFAULT_HEALTH_UNITS);
    expect(readHealthUnits(0, storage)).toEqual(DEFAULT_HEALTH_UNITS);
    writeHealthUnits(0, { weight: 'kg', distance: 'km' }, storage);
    expect(storage.getItem('town.health.units.v1.0')).toBeNull();
    expect(() => writeHealthUnits(7, { weight: 'kg', distance: 'km' }, {
      setItem: () => { throw new Error('blocked'); },
    })).not.toThrow();
    expect(EMPTY_HEALTH_DRAFT).toEqual({ measuredOn: '', weight: '', exercise: '', reps: '' });
  });

  it('maps the first invalid field without echoing the typed value', () => {
    expect(healthFieldMessage(undefined)).toBe('');
    expect(healthFieldMessage('date_range')).toBe('Use a real date from 1900 through today.');
    expect(healthFieldMessage('finite')).toBe('Enter a number.');
    expect(healthFieldMessage('range')).toBe('That value is outside the allowed range.');
    expect(healthFieldMessage('integer')).toBe('Use a whole number.');
    expect(healthFieldMessage('required')).toBe('Enter a value.');
    expect(healthFieldMessage('length')).toBe('Use a shorter or longer value within the limit.');
    expect(healthFieldMessage(CONTROL_TEXT_MESSAGE)).toBe(CONTROL_TEXT_MESSAGE);
    expect(healthFieldMessage('step')).toBe('Check this field and try again.');
    expect(healthFieldMessage('range')).not.toContain('1');
    expect(firstHealthField({ measured_on: 'date_range', kg: 'range' }, 'clinic')).toBe('measured_on');
    expect(firstHealthField({ kg: 'range' }, 'clinic')).toBe('kg');
    expect(firstHealthField({ kg: 'range', exercise: 'required' }, 'gym')).toBe('exercise');
    expect(firstHealthField({}, 'gym')).toBeNull();
    expect(healthFieldId('kg')).toBe('health-weight');
    expect(healthFieldId('measured_on')).toBe('health-measured-on');
    expect(healthFieldId('exercise')).toBe('health-exercise');
    expect(healthFieldId('reps')).toBe('health-reps');
    expect(parseHealthNumber(' 80 ')).toBe(80);
    expect(parseHealthNumber('1.5')).toBe(1.5);
    expect(parseHealthNumber('')).toBeUndefined();
    expect(parseHealthNumber('1e2')).toBeUndefined();
    expect(parseHealthNumber('80 lb')).toBeUndefined();
    expect(corruptNotice(0)).toBe('');
    expect(corruptNotice(1)).toBe('1 saved entry could not be read. It stays in the vault.');
    expect(corruptNotice(2)).toBe('2 saved entries could not be read. They stay in the vault.');
  });
});
