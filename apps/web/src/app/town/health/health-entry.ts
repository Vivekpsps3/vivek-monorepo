import { displayDistance, displayWeight, lbToKg, pace } from './health-units';
import type { HealthPr, HealthStat } from './health.types';
import { CONTROL_TEXT_MESSAGE, validateHealthStat, type FieldErrors } from './health-validate';

export interface HealthUnits {
  weight: 'kg' | 'lb';
  distance: 'km' | 'mi';
}

/** Display preference only. Stored records stay in canonical kg and metres. */
export const DEFAULT_HEALTH_UNITS: HealthUnits = { weight: 'lb', distance: 'mi' };

export type HealthVitalKind = 'weight' | 'rhr' | 'bp' | 'sleep';
export type HealthClinicKind = HealthVitalKind | 'lab' | 'checkup';
export type HealthEditorKind = HealthClinicKind | 'lift';
export type LabRange = 'below' | 'in' | 'above' | 'none';

export interface HealthDraft {
  kind: HealthEditorKind;
  clientId: string | null;
  measuredOn: string;
  loggedOn: string;
  weight: string;
  bpm: string;
  sys: string;
  dia: string;
  hours: string;
  /** Canonical kilograms when the weight field still shows that stored value. */
  sourceKg: number | null;
  exercise: string;
  reps: string;
  labName: string;
  labValue: string;
  labUnit: string;
  refLow: string;
  refHigh: string;
  note: string;
}

export const EMPTY_HEALTH_DRAFT: HealthDraft = {
  kind: 'weight',
  clientId: null,
  measuredOn: '',
  loggedOn: '',
  weight: '',
  bpm: '',
  sys: '',
  dia: '',
  hours: '',
  sourceKg: null,
  exercise: '',
  reps: '',
  labName: '',
  labValue: '',
  labUnit: '',
  refLow: '',
  refHigh: '',
  note: '',
};

const DELETE_PHRASE: Record<HealthClinicKind, string> = {
  weight: 'DELETE WEIGHT',
  rhr: 'DELETE HEART RATE',
  bp: 'DELETE BLOOD PRESSURE',
  sleep: 'DELETE SLEEP',
  lab: 'DELETE LAB',
  checkup: 'DELETE CHECKUP',
};

export function isVitalKind(kind: string): kind is HealthVitalKind {
  return kind === 'weight' || kind === 'rhr' || kind === 'bp' || kind === 'sleep';
}

export function isClinicKind(kind: string): kind is HealthClinicKind {
  return isVitalKind(kind) || kind === 'lab' || kind === 'checkup';
}

export function healthDeletePhrase(kind: HealthClinicKind): string {
  return DELETE_PHRASE[kind];
}

export function draftFromStat(
  entry: { clientId: string; value: HealthStat },
  units: HealthUnits,
): HealthDraft | null {
  const value = entry.value;
  if (!isClinicKind(value.kind)) return null;
  const lab = value.lab;
  return {
    ...EMPTY_HEALTH_DRAFT,
    kind: value.kind,
    clientId: entry.clientId,
    measuredOn: value.measured_on,
    loggedOn: value.logged_on,
    weight: value.kind === 'weight' && value.kg != null ? displayWeight(value.kg, units.weight) : '',
    bpm: value.bpm != null ? String(value.bpm) : '',
    sys: value.sys != null ? String(value.sys) : '',
    dia: value.dia != null ? String(value.dia) : '',
    hours: value.hours != null ? String(value.hours) : '',
    sourceKg: value.kind === 'weight' && typeof value.kg === 'number' ? value.kg : null,
    labName: lab?.name ?? '',
    labValue: lab && typeof lab.value === 'number' ? String(lab.value) : '',
    labUnit: lab?.unit ?? '',
    refLow: lab?.ref_low != null ? String(lab.ref_low) : '',
    refHigh: lab?.ref_high != null ? String(lab.ref_high) : '',
    note: value.note ?? '',
  };
}

/** Keep the stored kilograms when the field still shows that value's display text. */
export function weightDraftKg(
  typed: string,
  unit: 'kg' | 'lb',
  sourceKg: number | null,
): { kg: number | undefined; unit: 'kg' | 'lb' } {
  if (sourceKg != null && typed === displayWeight(sourceKg, unit)) return { kg: sourceKg, unit: 'kg' };
  return { kg: parseHealthNumber(typed), unit };
}

export function reformatWeightDraft(draft: HealthDraft, from: 'kg' | 'lb', to: 'kg' | 'lb'): HealthDraft {
  if (from === to) return draft;
  if (draft.sourceKg != null && draft.weight === displayWeight(draft.sourceKg, from)) {
    return { ...draft, weight: displayWeight(draft.sourceKg, to) };
  }
  const parsed = parseHealthNumber(draft.weight);
  if (parsed == null) return { ...draft, sourceKg: null };
  const kg = from === 'lb' ? lbToKg(parsed) : parsed;
  return { ...draft, sourceKg: kg, weight: displayWeight(kg, to) };
}

export function vitalStatFromDraft(
  draft: HealthDraft,
  today: string,
  weightUnit: 'kg' | 'lb',
): { value: HealthStat; fieldErrors: FieldErrors } {
  const logged = draft.loggedOn || today;
  const base = { v: 1 as const, measured_on: draft.measuredOn, logged_on: logged };
  switch (draft.kind) {
    case 'weight': {
      const weight = weightDraftKg(draft.weight, weightUnit, draft.sourceKg);
      return validateHealthStat({ ...base, kind: 'weight', kg: weight.kg }, today, weight.unit);
    }
    case 'rhr':
      return validateHealthStat({ ...base, kind: 'rhr', bpm: parseHealthNumber(draft.bpm) }, today);
    case 'bp':
      return validateHealthStat({
        ...base, kind: 'bp', sys: parseHealthNumber(draft.sys), dia: parseHealthNumber(draft.dia),
      }, today);
    case 'sleep':
      return validateHealthStat({ ...base, kind: 'sleep', hours: parseHealthNumber(draft.hours) }, today);
    case 'lab':
      return labStatFromDraft(draft, base, today);
    case 'checkup':
      return validateHealthStat({ ...base, kind: 'checkup', note: draft.note }, today);
    default:
      return validateHealthStat({ ...base, kind: 'weight' }, today, weightUnit);
  }
}

function optionalNumber(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  return parseHealthNumber(raw) ?? Number.NaN;
}

function labStatFromDraft(
  draft: HealthDraft,
  base: { v: 1; measured_on: string; logged_on: string },
  today: string,
): { value: HealthStat; fieldErrors: FieldErrors } {
  const lab: NonNullable<HealthStat['lab']> = {
    name: draft.labName,
    value: optionalNumber(draft.labValue) ?? Number.NaN,
    unit: draft.labUnit,
  };
  const low = optionalNumber(draft.refLow);
  const high = optionalNumber(draft.refHigh);
  if (low !== undefined) lab.ref_low = low;
  if (high !== undefined) lab.ref_high = high;
  return validateHealthStat({ ...base, kind: 'lab', lab }, today);
}

/** True when an edit would persist the same vital the store already holds. */
export function sameStoredStat(current: HealthStat, next: HealthStat): boolean {
  if (current.kind !== next.kind || current.measured_on !== next.measured_on) return false;
  switch (current.kind) {
    case 'weight': return current.kg === next.kg;
    case 'rhr': return current.bpm === next.bpm;
    case 'bp': return current.sys === next.sys && current.dia === next.dia;
    case 'sleep': return current.hours === next.hours;
    case 'lab': return sameLab(current.lab, next.lab);
    case 'checkup': return (current.note ?? '') === (next.note ?? '');
    default: return false;
  }
}

function sameLab(left: HealthStat['lab'], right: HealthStat['lab']): boolean {
  if (!left || !right) return !left && !right;
  return left.name === right.name
    && left.value === right.value
    && left.unit === right.unit
    && (left.ref_low ?? null) === (right.ref_low ?? null)
    && (left.ref_high ?? null) === (right.ref_high ?? null);
}

const UNITS_PREFIX = 'town.health.units.v1.';

export function readHealthUnits(
  ownerId: number,
  storage: Pick<Storage, 'getItem'> = localStorage,
): HealthUnits {
  if (!Number.isInteger(ownerId) || ownerId <= 0) return { ...DEFAULT_HEALTH_UNITS };
  try {
    const raw = storage.getItem(UNITS_PREFIX + ownerId);
    if (!raw || raw.length > 64) return { ...DEFAULT_HEALTH_UNITS };
    const parsed = JSON.parse(raw) as Partial<HealthUnits>;
    return {
      weight: parsed.weight === 'kg' || parsed.weight === 'lb' ? parsed.weight : 'lb',
      distance: parsed.distance === 'km' || parsed.distance === 'mi' ? parsed.distance : 'mi',
    };
  } catch {
    return { ...DEFAULT_HEALTH_UNITS };
  }
}

export function writeHealthUnits(
  ownerId: number,
  units: HealthUnits,
  storage: Pick<Storage, 'setItem'> = localStorage,
): void {
  if (!Number.isInteger(ownerId) || ownerId <= 0) return;
  try {
    storage.setItem(UNITS_PREFIX + ownerId, JSON.stringify({
      weight: units.weight,
      distance: units.distance,
    }));
  } catch {
    /* The preference is display-only. A blocked store keeps the in-memory choice. */
  }
}

export function healthFieldMessage(code: string | undefined): string {
  if (!code) return '';
  if (code === CONTROL_TEXT_MESSAGE) return code;
  switch (code) {
    case 'date_range': return 'Use a real date from 1900 through today.';
    case 'finite': return 'Enter a number.';
    case 'range': return 'That value is outside the allowed range.';
    case 'integer': return 'Use a whole number.';
    case 'required': return 'Enter a value.';
    case 'length': return 'Use a shorter or longer value within the limit.';
    case 'step': return 'Use a quarter-hour step.';
    case 'greater_than_dia': return 'Systolic must be higher than diastolic.';
    case 'greater_than_ref_low': return 'The high end of the range must be above the low end.';
    default: return 'Check this field and try again.';
  }
}

const CLINIC_FIELDS: Record<HealthClinicKind, readonly string[]> = {
  weight: ['measured_on', 'kg'],
  rhr: ['measured_on', 'bpm'],
  bp: ['measured_on', 'sys', 'dia'],
  sleep: ['measured_on', 'hours'],
  lab: ['measured_on', 'lab.name', 'lab.value', 'lab.unit', 'lab.ref_low', 'lab.ref_high'],
  checkup: ['measured_on', 'note'],
};
const GYM_FIELDS = ['measured_on', 'exercise', 'kg', 'reps'] as const;

export function firstHealthField(
  errors: FieldErrors,
  room: 'clinic' | 'gym',
  kind?: HealthEditorKind,
): string | null {
  const order = kind && kind !== 'lift' ? CLINIC_FIELDS[kind] : room === 'clinic' ? CLINIC_FIELDS.weight : GYM_FIELDS;
  return order.find(field => errors[field]) ?? null;
}

export function healthFieldId(field: string): string {
  switch (field) {
    case 'measured_on': return 'health-measured-on';
    case 'kg': return 'health-weight';
    case 'bpm': return 'health-bpm';
    case 'sys': return 'health-systolic';
    case 'dia': return 'health-diastolic';
    case 'hours': return 'health-sleep';
    case 'exercise': return 'health-exercise';
    case 'reps': return 'health-reps';
    case 'lab.name': return 'health-lab-name';
    case 'lab.value': return 'health-lab-value';
    case 'lab.unit': return 'health-lab-unit';
    case 'lab.ref_low': return 'health-lab-ref-low';
    case 'lab.ref_high': return 'health-lab-ref-high';
    case 'note': return 'health-checkup-note';
    default: return 'health-measured-on';
  }
}

/** Accept a plain decimal. Blank and other text stay invalid without rewriting the draft. */
export function parseHealthNumber(raw: string): number | undefined {
  const text = raw.trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) return undefined;
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}

export function corruptNotice(count: number): string {
  if (!Number.isInteger(count) || count <= 0) return '';
  if (count === 1) return '1 saved entry could not be read. It stays in the vault.';
  return `${count} saved entries could not be read. They stay in the vault.`;
}

const RANGE_WORD: Record<LabRange, string> = {
  below: 'below range',
  in: 'in range',
  above: 'above range',
  none: 'no range',
};

function finiteOrNull(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Compare a lab number with the reference the person typed. This is not advice. */
export function labRange(lab: { value: number; ref_low?: number; ref_high?: number } | undefined): LabRange {
  if (!lab || !Number.isFinite(lab.value)) return 'none';
  const low = finiteOrNull(lab.ref_low);
  const high = finiteOrNull(lab.ref_high);
  if (low == null && high == null) return 'none';
  if (low != null && high != null && !(low < high)) return 'none';
  if (low != null && lab.value < low) return 'below';
  if (high != null && lab.value > high) return 'above';
  return 'in';
}

function labMeasure(value: number, unit: string): string {
  const trimmed = unit.trim();
  return trimmed ? `${value} ${trimmed}` : String(value);
}

function labRangeDetail(lab: NonNullable<HealthStat['lab']>): string {
  const status = labRange(lab);
  const word = RANGE_WORD[status];
  if (status === 'none') return word;
  const low = finiteOrNull(lab.ref_low);
  const high = finiteOrNull(lab.ref_high);
  const unit = lab.unit.trim();
  const suffix = unit ? ` ${unit}` : '';
  if (low != null && high != null) return `${word} · ${low} to ${high}${suffix}`;
  if (low != null) return `${word} · from ${low}${suffix}`;
  if (high == null) return word;
  return `${word} · through ${high}${suffix}`;
}

export function formatHealthStat(stat: HealthStat, units: HealthUnits): string {
  const date = stat.measured_on;
  switch (stat.kind) {
    case 'weight':
      return stat.kg == null
        ? `Weight · ${date}`
        : `Weight · ${displayWeight(stat.kg, units.weight)} ${units.weight} · ${date}`;
    case 'rhr':
      return stat.bpm == null ? `Resting heart rate · ${date}` : `Resting heart rate · ${stat.bpm} bpm · ${date}`;
    case 'bp':
      return stat.sys == null || stat.dia == null
        ? `Blood pressure · ${date}`
        : `Blood pressure · ${stat.sys}/${stat.dia} · ${date}`;
    case 'sleep':
      return stat.hours == null ? `Sleep · ${date}` : `Sleep · ${stat.hours} h · ${date}`;
    case 'lab': {
      const lab = stat.lab;
      if (!lab) return `Lab · ${date}`;
      return `Lab · ${lab.name} · ${labMeasure(lab.value, lab.unit)} · ${labRangeDetail(lab)} · ${date}`;
    }
    case 'checkup':
      return stat.note ? `Checkup · ${stat.note} · ${date}` : `Checkup · ${date}`;
  }
}

export function formatHealthPr(record: HealthPr, units: HealthUnits): string {
  const date = record.measured_on;
  switch (record.kind) {
    case 'lift': {
      const weight = record.kg == null ? '' : `${displayWeight(record.kg, units.weight)} ${units.weight}`;
      const reps = record.reps == null ? '' : `${record.reps} reps`;
      return ['Lift', record.exercise, weight, reps, date].filter(Boolean).join(' · ');
    }
    case 'run': {
      const distance = record.distance_m == null ? '' : `${displayDistance(record.distance_m, units.distance)} ${units.distance}`;
      const timing = record.distance_m == null || record.seconds == null
        ? ''
        : `${pace(record.seconds, record.distance_m, units.distance)} /${units.distance}`;
      return ['Run', distance, timing, date].filter(Boolean).join(' · ');
    }
    case 'other': {
      const value = record.value == null ? '' : `${record.value} ${record.unit ?? ''}`.trim();
      return ['Record', record.name, value, date].filter(Boolean).join(' · ');
    }
  }
}
