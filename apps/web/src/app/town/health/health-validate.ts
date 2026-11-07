import { HEALTH_LIMITS as L } from './health.constants';
import type { HealthPr, HealthStat } from './health.types';
import { lbToKg } from './health-units';

// Field-error codes are for callers to map to copy; the one message fixed by
// §8.4 (control/bidi rejection) is carried verbatim as the error value.
export type FieldErrors = Record<string, string>;
export const CONTROL_TEXT_MESSAGE = 'Use letters, numbers and punctuation only.';

/** §8.4 normalization: NFC, trim, collapse internal whitespace to one space. */
export const normalizeHealthText = (value: string): string =>
  value.normalize('NFC').trim().replace(/\s+/gu, ' ');

const hasForbiddenChars = (text: string): boolean => [...text].some(char => {
  const cp = char.codePointAt(0)!;
  return cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f)
    || (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2066 && cp <= 0x2069);
});

export function isHealthDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

interface Checks {
  fieldErrors: FieldErrors;
  number: (field: string, value: number | undefined, range?: readonly [number, number], integer?: boolean) => void;
  text: (field: string, value: string | undefined, min: number, max: number) => string;
}

function makeChecks(measuredOn: string, today: string): Checks {
  const fieldErrors: FieldErrors = {};
  if (!isHealthDate(measuredOn) || measuredOn < L.measuredOnMin || measuredOn > today) {
    fieldErrors['measured_on'] = 'date_range';
  }
  const number: Checks['number'] = (field, value, range, integer = false) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) fieldErrors[field] = 'finite';
    else if (range && (value < range[0] || value > range[1])) fieldErrors[field] = 'range';
    else if (integer && !Number.isInteger(value)) fieldErrors[field] = 'integer';
  };
  const text: Checks['text'] = (field, value, min, max) => {
    if (typeof value !== 'string') {
      fieldErrors[field] = 'required';
      return '';
    }
    const normalized = normalizeHealthText(value);
    // Check the raw value too: collapsing whitespace must not launder
    // C0/C1 control characters into ordinary spaces.
    if (hasForbiddenChars(value)) fieldErrors[field] = CONTROL_TEXT_MESSAGE;
    else if ([...normalized].length < min || [...normalized].length > max) fieldErrors[field] = 'length';
    return normalized;
  };
  return { fieldErrors, number, text };
}

export function validateHealthStat(
  input: HealthStat, today: string, weightUnit: 'kg' | 'lb' = 'kg',
): { value: HealthStat; fieldErrors: FieldErrors } {
  const value: HealthStat = { ...input };
  const { fieldErrors, number, text } = makeChecks(value.measured_on, today);
  switch (value.kind) {
    case 'weight':
      if (weightUnit === 'lb' && typeof value.kg === 'number') value.kg = lbToKg(value.kg);
      number('kg', value.kg, L.weight);
      break;
    case 'rhr':
      number('bpm', value.bpm, L.rhr, true);
      break;
    case 'bp':
      number('sys', value.sys, L.sys, true);
      number('dia', value.dia, L.dia, true);
      if (value.sys !== undefined && value.dia !== undefined && value.sys <= value.dia) {
        fieldErrors['sys'] = 'greater_than_dia';
      }
      break;
    case 'sleep': {
      number('hours', value.hours, L.sleep);
      if (typeof value.hours === 'number' && Number.isFinite(value.hours)) {
        const steps = value.hours / L.sleepStep;
        if (Math.abs(steps - Math.round(steps)) > 1e-9) fieldErrors['hours'] = 'step';
      }
      break;
    }
    case 'lab': {
      if (!value.lab) {
        fieldErrors['lab'] = 'required';
        break;
      }
      const lab = { ...value.lab };
      lab.name = text('lab.name', lab.name, 1, L.labNameMax);
      lab.unit = text('lab.unit', lab.unit, 0, L.unitMax);
      number('lab.value', lab.value);
      if (lab.ref_low !== undefined && lab.ref_high !== undefined && !(lab.ref_low < lab.ref_high)) {
        fieldErrors['lab.ref_high'] = 'greater_than_ref_low';
      }
      value.lab = lab;
      break;
    }
    case 'checkup':
      value.note = text('note', value.note, 0, L.noteMax);
      break;
  }
  return { value, fieldErrors };
}

export function validateHealthPr(
  input: HealthPr, today: string, weightUnit: 'kg' | 'lb' = 'kg',
): { value: HealthPr; fieldErrors: FieldErrors } {
  const value: HealthPr = { ...input };
  const { fieldErrors, number, text } = makeChecks(value.measured_on, today);
  switch (value.kind) {
    case 'lift':
      value.exercise = text('exercise', value.exercise, 1, L.exerciseMax);
      if (weightUnit === 'lb' && typeof value.kg === 'number') value.kg = lbToKg(value.kg);
      number('kg', value.kg, L.liftKg);
      number('reps', value.reps, L.reps, true);
      break;
    case 'run':
      number('distance_m', value.distance_m, L.distanceM);
      number('seconds', value.seconds, L.seconds);
      break;
    case 'other':
      value.name = text('name', value.name, 1, L.otherNameMax);
      value.unit = text('unit', value.unit, 0, L.unitMax);
      number('value', value.value);
      if (value.direction !== 'higher' && value.direction !== 'lower') fieldErrors['direction'] = 'required';
      break;
  }
  return { value, fieldErrors };
}
