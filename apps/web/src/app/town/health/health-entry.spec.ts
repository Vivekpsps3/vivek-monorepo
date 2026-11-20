import { displayWeight, lbToKg } from './health-units';
import {
  DEFAULT_HEALTH_UNITS,
  EMPTY_HEALTH_DRAFT,
  corruptNotice,
  draftFromStat,
  firstHealthField,
  formatHealthPr,
  formatHealthStat,
  healthDeletePhrase,
  healthFieldId,
  healthFieldMessage,
  parseHealthNumber,
  readHealthUnits,
  reformatWeightDraft,
  sameStoredStat,
  vitalStatFromDraft,
  writeHealthUnits,
  type HealthDraft,
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
    expect(EMPTY_HEALTH_DRAFT).toEqual({
      kind: 'weight', clientId: null, measuredOn: '', loggedOn: '', weight: '',
      bpm: '', sys: '', dia: '', hours: '', sourceKg: null, exercise: '', reps: '',
      labName: '', labValue: '', labUnit: '', refLow: '', refHigh: '', note: '',
    });
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
    expect(healthFieldMessage('step')).toBe('Use a quarter-hour step.');
    expect(healthFieldMessage('greater_than_dia')).toBe('Systolic must be higher than diastolic.');
    expect(healthFieldMessage('greater_than_ref_low')).toBe('The high end of the range must be above the low end.');
    expect(healthFieldMessage('mystery')).toBe('Check this field and try again.');
    expect(healthFieldMessage('range')).not.toContain('1');
    expect(firstHealthField({ measured_on: 'date_range', kg: 'range' }, 'clinic')).toBe('measured_on');
    expect(firstHealthField({ kg: 'range' }, 'clinic')).toBe('kg');
    expect(firstHealthField({ kg: 'range', exercise: 'required' }, 'gym')).toBe('exercise');
    expect(firstHealthField({ bpm: 'range', sys: 'range' }, 'clinic', 'rhr')).toBe('bpm');
    expect(firstHealthField({ sys: 'greater_than_dia', dia: 'range' }, 'clinic', 'bp')).toBe('sys');
    expect(firstHealthField({ hours: 'step' }, 'clinic', 'sleep')).toBe('hours');
    expect(firstHealthField({}, 'gym')).toBeNull();
    expect(healthFieldId('kg')).toBe('health-weight');
    expect(healthFieldId('measured_on')).toBe('health-measured-on');
    expect(healthFieldId('bpm')).toBe('health-bpm');
    expect(healthFieldId('sys')).toBe('health-systolic');
    expect(healthFieldId('dia')).toBe('health-diastolic');
    expect(healthFieldId('hours')).toBe('health-sleep');
    expect(healthFieldId('exercise')).toBe('health-exercise');
    expect(healthFieldId('reps')).toBe('health-reps');
    expect(healthFieldId('lab.name')).toBe('health-lab-name');
    expect(healthFieldId('lab.ref_high')).toBe('health-lab-ref-high');
    expect(healthFieldId('note')).toBe('health-checkup-note');
    expect(parseHealthNumber(' 80 ')).toBe(80);
    expect(parseHealthNumber('1.5')).toBe(1.5);
    expect(parseHealthNumber('')).toBeUndefined();
    expect(parseHealthNumber('1e2')).toBeUndefined();
    expect(parseHealthNumber('80 lb')).toBeUndefined();
    expect(corruptNotice(0)).toBe('');
    expect(corruptNotice(1)).toBe('1 saved entry could not be read. It stays in the vault.');
    expect(corruptNotice(2)).toBe('2 saved entries could not be read. They stay in the vault.');
  });

  it('roundtrips each vital in its supported unit without rewriting a stored weight', () => {
    const units = { weight: 'lb' as const, distance: 'mi' as const };
    const stored = draftFromStat({ clientId: 'hlt_SyntheticWeightEntryAB', value: weight }, units);
    expect(stored?.weight).toBe('176.4');
    expect(stored?.sourceKg).toBe(80);
    expect(stored?.loggedOn).toBe(DAY);
    const kept = vitalStatFromDraft(stored!, '2026-11-20', 'lb');
    expect(kept.fieldErrors).toEqual({});
    expect(kept.value.kg).toBe(80);
    expect(kept.value.logged_on).toBe(DAY);
    expect(sameStoredStat(weight, kept.value)).toBeTrue();

    const kilograms = reformatWeightDraft(stored!, 'lb', 'kg');
    expect(kilograms.weight).toBe('80.0');
    expect(kilograms.sourceKg).toBe(80);
    expect(vitalStatFromDraft(kilograms, '2026-11-20', 'kg').value.kg).toBe(80);

    const changed = vitalStatFromDraft({ ...stored!, weight: '150' }, '2026-11-20', 'lb');
    expect(changed.value.kg).toBe(lbToKg(150));
    expect(changed.value.kg).not.toBe(80);
    expect(sameStoredStat(weight, changed.value)).toBeFalse();

    let typed: HealthDraft = { ...EMPTY_HEALTH_DRAFT, kind: 'weight', weight: '200', measuredOn: DAY };
    typed = reformatWeightDraft(typed, 'lb', 'kg');
    typed = reformatWeightDraft(typed, 'kg', 'lb');
    expect(vitalStatFromDraft(typed, '2026-11-20', 'lb').value.kg).toBe(lbToKg(200));

    const directKg = vitalStatFromDraft({ ...EMPTY_HEALTH_DRAFT, kind: 'weight', measuredOn: DAY, weight: '70' }, '2026-11-20', 'kg');
    expect(directKg.value.kg).toBe(70);

    const heart = vitalStatFromDraft({ ...EMPTY_HEALTH_DRAFT, kind: 'rhr', measuredOn: DAY, bpm: '62' }, '2026-11-20', 'lb');
    expect(heart.fieldErrors).toEqual({});
    expect(heart.value).toEqual(jasmine.objectContaining({ kind: 'rhr', bpm: 62, logged_on: '2026-11-20' }));
    expect(vitalStatFromDraft({ ...EMPTY_HEALTH_DRAFT, kind: 'rhr', measuredOn: DAY, bpm: '24' }, '2026-11-20', 'lb').fieldErrors['bpm']).toBe('range');

    const pressure = vitalStatFromDraft({ ...EMPTY_HEALTH_DRAFT, kind: 'bp', measuredOn: DAY, sys: '118', dia: '76' }, '2026-11-20', 'kg');
    expect(pressure.fieldErrors).toEqual({});
    expect(pressure.value.sys).toBe(118);
    expect(pressure.value.dia).toBe(76);
    const backwards = vitalStatFromDraft({ ...EMPTY_HEALTH_DRAFT, kind: 'bp', measuredOn: DAY, sys: '90', dia: '90' }, '2026-11-20', 'kg');
    expect(backwards.fieldErrors['sys']).toBe('greater_than_dia');
    expect(firstHealthField(backwards.fieldErrors, 'clinic', 'bp')).toBe('sys');

    const sleep = vitalStatFromDraft({ ...EMPTY_HEALTH_DRAFT, kind: 'sleep', measuredOn: DAY, hours: '7.25' }, '2026-11-20', 'lb');
    expect(sleep.fieldErrors).toEqual({});
    expect(sleep.value.hours).toBe(7.25);
    const step = vitalStatFromDraft({ ...EMPTY_HEALTH_DRAFT, kind: 'sleep', measuredOn: DAY, hours: '7.3' }, '2026-11-20', 'lb');
    expect(step.fieldErrors['hours']).toBe('step');
    expect(firstHealthField(step.fieldErrors, 'clinic', 'sleep')).toBe('hours');

    expect(healthDeletePhrase('weight')).toBe('DELETE WEIGHT');
    expect(healthDeletePhrase('rhr')).toBe('DELETE HEART RATE');
    expect(healthDeletePhrase('bp')).toBe('DELETE BLOOD PRESSURE');
    expect(healthDeletePhrase('sleep')).toBe('DELETE SLEEP');
    expect(healthDeletePhrase('lab')).toBe('DELETE LAB');
    expect(healthDeletePhrase('checkup')).toBe('DELETE CHECKUP');
    expect(weight.kg).toBe(80);
  });

  it('renders below, in, above, and no-range labs and roundtrips a checkup', () => {
    const units = { weight: 'lb' as const, distance: 'mi' as const };
    const lab = (
      value: number,
      extra: { ref_low?: number; ref_high?: number; unit?: string; name?: string } = {},
    ): HealthStat => ({
      v: 1,
      kind: 'lab',
      measured_on: DAY,
      logged_on: DAY,
      lab: { name: extra.name ?? 'Ω-marker', value, unit: extra.unit ?? 'u', ref_low: extra.ref_low, ref_high: extra.ref_high },
    });
    expect(formatHealthStat(lab(9, { ref_low: 10, ref_high: 20 }), units))
      .toBe(`Lab · Ω-marker · 9 u · below range · 10 to 20 u · ${DAY}`);
    expect(formatHealthStat(lab(10, { ref_low: 10, ref_high: 20 }), units))
      .toBe(`Lab · Ω-marker · 10 u · in range · 10 to 20 u · ${DAY}`);
    expect(formatHealthStat(lab(20, { ref_low: 10, ref_high: 20 }), units))
      .toBe(`Lab · Ω-marker · 20 u · in range · 10 to 20 u · ${DAY}`);
    expect(formatHealthStat(lab(21, { ref_low: 10, ref_high: 20 }), units))
      .toBe(`Lab · Ω-marker · 21 u · above range · 10 to 20 u · ${DAY}`);
    expect(formatHealthStat(lab(12), units)).toBe(`Lab · Ω-marker · 12 u · no range · ${DAY}`);
    expect(formatHealthStat(lab(9, { ref_low: 10 }), units))
      .toBe(`Lab · Ω-marker · 9 u · below range · from 10 u · ${DAY}`);
    expect(formatHealthStat(lab(21, { ref_high: 20 }), units))
      .toBe(`Lab · Ω-marker · 21 u · above range · through 20 u · ${DAY}`);
    expect(formatHealthStat(lab(12, { unit: '' }), units)).toBe(`Lab · Ω-marker · 12 · no range · ${DAY}`);
    expect(formatHealthStat(lab(12, { ref_low: 20, ref_high: 10 }), units))
      .toBe(`Lab · Ω-marker · 12 u · no range · ${DAY}`);

    const stored = lab(9, { ref_low: 10, ref_high: 20 });
    const draft = draftFromStat({ clientId: 'hlt_SyntheticLabEntryABCD', value: stored }, units);
    expect(draft?.labName).toBe('Ω-marker');
    expect(draft?.labValue).toBe('9');
    expect(draft?.labUnit).toBe('u');
    expect(draft?.refLow).toBe('10');
    expect(draft?.refHigh).toBe('20');
    expect(draft?.loggedOn).toBe(DAY);
    const kept = vitalStatFromDraft(draft!, '2026-11-20', 'lb');
    expect(kept.fieldErrors).toEqual({});
    expect(kept.value.lab).toEqual({ name: 'Ω-marker', value: 9, unit: 'u', ref_low: 10, ref_high: 20 });
    expect(kept.value.logged_on).toBe(DAY);
    expect(sameStoredStat(stored, kept.value)).toBeTrue();

    const reversed = vitalStatFromDraft({ ...draft!, refLow: '20', refHigh: '10' }, '2026-11-20', 'lb');
    expect(reversed.fieldErrors['lab.ref_high']).toBe('greater_than_ref_low');
    expect(firstHealthField(reversed.fieldErrors, 'clinic', 'lab')).toBe('lab.ref_high');
    const blank = vitalStatFromDraft({ ...draft!, refLow: '', refHigh: '' }, '2026-11-20', 'lb');
    expect(blank.fieldErrors).toEqual({});
    expect(blank.value.lab).toEqual({ name: 'Ω-marker', value: 9, unit: 'u' });
    expect(sameStoredStat(stored, blank.value)).toBeFalse();

    const checkup = vitalStatFromDraft({
      ...EMPTY_HEALTH_DRAFT, kind: 'checkup', measuredOn: DAY, note: 'Synthetic visit note',
    }, '2026-11-20', 'lb');
    expect(checkup.fieldErrors).toEqual({});
    expect(checkup.value).toEqual(jasmine.objectContaining({
      kind: 'checkup', note: 'Synthetic visit note', measured_on: DAY, logged_on: '2026-11-20',
    }));
    expect(formatHealthStat(checkup.value, units)).toBe('Checkup · Synthetic visit note · 2026-10-28');
    const edited = draftFromStat({ clientId: 'hlt_SyntheticCheckupEntryAB', value: checkup.value }, units);
    expect(edited?.note).toBe('Synthetic visit note');
    expect(sameStoredStat(checkup.value, vitalStatFromDraft(edited!, '2026-11-20', 'lb').value)).toBeTrue();
  });
});
