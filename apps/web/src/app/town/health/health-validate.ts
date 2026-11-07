import { HEALTH_LIMITS as L } from './health.constants';
import { HealthPr, HealthStat } from './health.types';
import { lbToKg } from './health-units';

// Codes are for callers to map to copy; the rejection copy is specified verbatim.
export type FieldErrors = Record<string, string>;
export const normalizeHealthText = (value: string): string =>
  value.normalize('NFC').trim().replace(/\s+/gu, ' ');
const forbidden = (text: string) => [...text].some(char => {
  const cp = char.codePointAt(0)!;
  return cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f) ||
    (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2066 && cp <= 0x2069);
});
export function isHealthDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
function validator(measuredOn: string, today: string) {
  const fieldErrors: FieldErrors = {};
  if (!isHealthDate(measuredOn) || measuredOn < L.measuredOnMin || measuredOn > today) {
    fieldErrors['measured_on'] = 'date_range';
  }
  const number = (field: string, value: number | undefined, range?: readonly number[], integer = false) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) fieldErrors[field] = 'finite';
    else if (range && (value < range[0] || value > range[1])) fieldErrors[field] = 'range';
    else if (integer && !Number.isInteger(value)) fieldErrors[field] = 'integer';
  };
  const text = (field: string, value: string | undefined, min: number, max: number): string => {
    if (typeof value !== 'string') { fieldErrors[field] = 'required'; return ''; }
    const normalized = normalizeHealthText(value);
    // Check the original too: collapsing whitespace must not launder C0/C1 controls.
    if (forbidden(value)) fieldErrors[field] = 'Use letters, numbers and punctuation only.';
    else if ([...normalized].length < min || [...normalized].length > max) fieldErrors[field] = 'length';
    return normalized;
  };
  return { fieldErrors, number, text };
}
export function validateHealthStat(input: HealthStat, today: string, weightUnit: 'kg' | 'lb' = 'kg') {
  const value = { ...input };
  const { fieldErrors, number, text } = validator(value.measured_on, today);
  switch (value.kind) {
    case 'weight':
      if (weightUnit === 'lb' && typeof value.kg === 'number') value.kg = lbToKg(value.kg);
      number('kg', value.kg, L.weight); break;
    case 'rhr': number('bpm', value.bpm, L.rhr, true); break;
    case 'bp':
      number('sys', value.sys, L.sys, true); number('dia', value.dia, L.dia, true);
      if (value.sys !== undefined && value.dia !== undefined && value.sys <= value.dia) fieldErrors['sys'] = 'greater_than_dia';
      break;
    case 'sleep':
      number('hours', value.hours, L.sleep);
      if (value.hours !== undefined && value.hours % L.sleepStep !== 0) fieldErrors['hours'] = 'step';
      break;
    case 'lab': {
      if (!value.lab) { fieldErrors['lab'] = 'required'; break; }
      const lab = { ...value.lab };
      lab.name = text('lab.name', lab.name, 1, L.labNameMax);
      lab.unit = text('lab.unit', lab.unit, 0, L.unitMax);
      number('lab.value', lab.value);
      if (lab.ref_low !== undefined && lab.ref_high !== undefined && !(lab.ref_low < lab.ref_high)) {
        fieldErrors['lab.ref_high'] = 'greater_than_ref_low';
      }
      value.lab = lab; break;
    }
    case 'checkup': value.note = text('note', value.note, 0, L.noteMax); break;
  }
  return { value, fieldErrors };
}
export function validateHealthPr(input: HealthPr, today: string, weightUnit: 'kg' | 'lb' = 'kg') {
  const value = { ...input };
  const { fieldErrors, number, text } = validator(value.measured_on, today);
  switch (value.kind) {
    case 'lift':
      value.exercise = text('exercise', value.exercise, 1, L.exerciseMax);
      if (weightUnit === 'lb' && typeof value.kg === 'number') value.kg = lbToKg(value.kg);
      number('kg', value.kg, L.liftKg); number('reps', value.reps, L.reps, true); break;
    case 'run': number('distance_m', value.distance_m, L.distanceM); number('seconds', value.seconds, L.seconds); break;
    case 'other':
      value.name = text('name', value.name, 1, L.otherNameMax);
      value.unit = text('unit', value.unit, 0, L.unitMax); number('value', value.value);
      if (value.direction !== 'higher' && value.direction !== 'lower') fieldErrors['direction'] = 'required';
      break;
  }
  return { value, fieldErrors };
}
