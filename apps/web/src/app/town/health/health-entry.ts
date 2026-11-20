import { displayDistance, displayWeight, pace } from './health-units';
import type { HealthPr, HealthStat } from './health.types';
import { CONTROL_TEXT_MESSAGE, type FieldErrors } from './health-validate';

export interface HealthUnits {
  weight: 'kg' | 'lb';
  distance: 'km' | 'mi';
}

/** Display preference only. Stored records stay in canonical kg and metres. */
export const DEFAULT_HEALTH_UNITS: HealthUnits = { weight: 'lb', distance: 'mi' };

export interface HealthDraft {
  measuredOn: string;
  weight: string;
  exercise: string;
  reps: string;
}

export const EMPTY_HEALTH_DRAFT: HealthDraft = {
  measuredOn: '',
  weight: '',
  exercise: '',
  reps: '',
};

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
    default: return 'Check this field and try again.';
  }
}

const CLINIC_FIELDS = ['measured_on', 'kg'] as const;
const GYM_FIELDS = ['measured_on', 'exercise', 'kg', 'reps'] as const;

export function firstHealthField(errors: FieldErrors, room: 'clinic' | 'gym'): string | null {
  const order = room === 'clinic' ? CLINIC_FIELDS : GYM_FIELDS;
  return order.find(field => errors[field]) ?? null;
}

export function healthFieldId(field: string): string {
  switch (field) {
    case 'measured_on': return 'health-measured-on';
    case 'kg': return 'health-weight';
    case 'exercise': return 'health-exercise';
    case 'reps': return 'health-reps';
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
      return lab ? `Lab · ${lab.name} · ${lab.value} ${lab.unit} · ${date}` : `Lab · ${date}`;
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
