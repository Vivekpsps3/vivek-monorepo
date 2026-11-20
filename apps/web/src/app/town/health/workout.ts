import { HEALTH_LIMITS, WORKOUT_LIMITS as L } from './health.constants';
import { parseHealthNumber, type HealthUnits } from './health-entry';
import { healthFieldMessage } from './health-entry';
import {
  CONTROL_TEXT_MESSAGE,
  hasForbiddenHealthChars,
  isHealthDate,
  normalizeHealthText,
  type FieldErrors,
} from './health-validate';
import { displayDistance, displayWeight, kmToMetres, lbToKg, milesToMetres } from './health-units';

export const EXERCISE_TYPES = ['load-reps', 'bodyweight-reps', 'assisted-reps', 'time-distance', 'time-only'] as const;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];
export const SET_TYPES = ['warmup', 'work', 'drop'] as const;
export type SetType = (typeof SET_TYPES)[number];
export type WorkoutKind = 'exercise' | 'routine' | 'session';

export interface WorkoutSet {
  id: string;
  set_type: SetType;
  completed: boolean;
  kg?: number;
  reps?: number;
  seconds?: number;
  metres?: number;
  effort?: number;
}

/** A planned or logged exercise line. Kind and units stay on the line. */
export interface WorkoutExerciseLine {
  id: string;
  exercise_id: string;
  exercise_type: ExerciseType;
  name: string;
  sets: WorkoutSet[];
}

export interface WorkoutExercise {
  v: 1;
  kind: 'exercise';
  name: string;
  exercise_type: ExerciseType;
  archived: boolean;
}

export interface WorkoutRoutine {
  v: 1;
  kind: 'routine';
  name: string;
  archived: boolean;
  exercises: WorkoutExerciseLine[];
}

export interface WorkoutSession {
  v: 1;
  kind: 'session';
  measured_on: string;
  logged_on: string;
  state: 'draft' | 'completed';
  exercises: WorkoutExerciseLine[];
  note?: string;
  duration_s?: number;
}

export type WorkoutRecord = WorkoutExercise | WorkoutRoutine | WorkoutSession;

export interface WorkoutDraft {
  kind: WorkoutKind;
  name: string;
  exerciseType: ExerciseType;
  measuredOn: string;
  note: string;
  load: string;
  reps: string;
  seconds: string;
  distance: string;
  setType: SetType;
  state: 'draft' | 'completed';
  exerciseLineId: string;
  setId: string;
}

const PART_ID = /^w(?:ex|st)_[A-Za-z0-9_-]{8,64}$/;
const CUSTOM_ID = /^hlt_[A-Za-z0-9_-]{22}$/;

export function newWorkoutPartId(prefix: 'wex' | 'wst'): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `${prefix}_${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')}`;
}

export function emptyWorkoutDraft(kind: WorkoutKind, today: string): WorkoutDraft {
  return {
    kind,
    name: '',
    exerciseType: 'load-reps',
    measuredOn: kind === 'session' ? today : '',
    note: '',
    load: '',
    reps: '',
    seconds: '',
    distance: '',
    setType: 'work',
    state: 'completed',
    exerciseLineId: newWorkoutPartId('wex'),
    setId: newWorkoutPartId('wst'),
  };
}

export function staticExerciseId(name: string): string {
  const slug = name.normalize('NFC').trim().toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '');
  return `static:${slug || 'exercise'}`.slice(0, 128);
}

export function workoutRecordBytes(value: WorkoutRecord): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

export function workoutParsable(value: unknown): value is WorkoutRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  if (record['v'] !== 1) return false;
  if (record['kind'] === 'exercise') {
    return typeof record['name'] === 'string' && typeof record['exercise_type'] === 'string';
  }
  if (record['kind'] === 'routine') {
    return typeof record['name'] === 'string' && Array.isArray(record['exercises']);
  }
  if (record['kind'] === 'session') {
    return typeof record['measured_on'] === 'string'
      && typeof record['logged_on'] === 'string'
      && (record['state'] === 'draft' || record['state'] === 'completed')
      && Array.isArray(record['exercises']);
  }
  return false;
}

export function exerciseTypeLabel(type: ExerciseType): string {
  switch (type) {
    case 'load-reps': return 'Load and reps';
    case 'bodyweight-reps': return 'Bodyweight reps';
    case 'assisted-reps': return 'Assisted reps';
    case 'time-distance': return 'Time and distance';
    case 'time-only': return 'Time';
  }
}

export function formatWorkout(record: WorkoutRecord, units: HealthUnits): string {
  if (record.kind === 'exercise') return `Exercise · ${record.name} · ${exerciseTypeLabel(record.exercise_type)}`;
  if (record.kind === 'routine') {
    const count = record.exercises.length;
    return `Routine · ${record.name} · ${count} ${count === 1 ? 'exercise' : 'exercises'}`;
  }
  const line = record.exercises[0];
  const set = line?.sets[0];
  const parts = [line?.name || 'Session', record.measured_on];
  if (typeof set?.kg === 'number') parts.push(`${displayWeight(set.kg, units.weight)} ${units.weight}`);
  if (typeof set?.reps === 'number') parts.push(`${set.reps} reps`);
  if (typeof set?.seconds === 'number') parts.push(`${set.seconds} s`);
  if (typeof set?.metres === 'number') parts.push(`${displayDistance(set.metres, units.distance)} ${units.distance}`);
  return `Session · ${parts.join(' · ')}`;
}

export function workoutFieldMessage(code: string | undefined): string {
  switch (code) {
    case 'size': return 'This workout is too large to save. Shorten it and try again.';
    case 'limit': return 'The vault already has 200 custom exercises. This draft was not saved.';
    case 'exercises': return 'A workout can include at most 32 exercises.';
    case 'sets': return 'An exercise can include at most 20 sets.';
    default: return healthFieldMessage(code);
  }
}

export function firstWorkoutField(errors: FieldErrors, kind: WorkoutKind): string | null {
  const order = kind === 'exercise'
    ? ['name', 'exercise_type', 'definitions', 'record']
    : ['measured_on', 'name', 'exercise_type', 'set_type', 'kg', 'reps', 'seconds', 'metres', 'note', 'exercises', 'sets', 'definitions', 'record'];
  return order.find(field => errors[field]) ?? Object.keys(errors)[0] ?? null;
}

export function workoutFieldId(field: string): string {
  switch (field) {
    case 'measured_on': return 'health-workout-measured-on';
    case 'name': return 'health-workout-name';
    case 'exercise_type': return 'health-workout-type';
    case 'set_type': return 'health-workout-set-type';
    case 'kg': return 'health-workout-load';
    case 'reps': return 'health-workout-reps';
    case 'seconds': return 'health-workout-seconds';
    case 'metres': return 'health-workout-distance';
    case 'note':
    case 'record': return 'health-workout-note';
    default: return 'health-workout-name';
  }
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function canonicalKg(raw: string, unit: 'kg' | 'lb'): number | undefined {
  const parsed = parseHealthNumber(raw);
  if (parsed === undefined) return undefined;
  return unit === 'lb' ? lbToKg(parsed) : round2(parsed);
}

function canonicalMetres(raw: string, unit: 'km' | 'mi'): number | undefined {
  const parsed = parseHealthNumber(raw);
  if (parsed === undefined) return undefined;
  return round2(unit === 'mi' ? milesToMetres(parsed) : kmToMetres(parsed));
}

export function reformatWorkoutDraft(draft: WorkoutDraft, from: HealthUnits, to: HealthUnits): WorkoutDraft {
  let load = draft.load;
  let distance = draft.distance;
  if (from.weight !== to.weight && draft.load !== '') {
    const kg = canonicalKg(draft.load, from.weight);
    if (kg !== undefined) load = displayWeight(kg, to.weight);
  }
  if (from.distance !== to.distance && draft.distance !== '') {
    const metres = canonicalMetres(draft.distance, from.distance);
    if (metres !== undefined) distance = displayDistance(metres, to.distance);
  }
  return { ...draft, load, distance };
}

export function workoutFromDraft(draft: WorkoutDraft, today: string, units: HealthUnits): WorkoutRecord {
  if (draft.kind === 'exercise') {
    return {
      v: 1,
      kind: 'exercise',
      name: draft.name,
      exercise_type: draft.exerciseType,
      archived: false,
    };
  }
  const line = exerciseLineFromDraft(draft, units, draft.kind === 'session' && draft.state === 'completed');
  if (draft.kind === 'routine') {
    return { v: 1, kind: 'routine', name: draft.name, archived: false, exercises: [line] };
  }
  const session: WorkoutSession = {
    v: 1,
    kind: 'session',
    measured_on: draft.measuredOn,
    logged_on: today,
    state: draft.state,
    exercises: [line],
  };
  if (draft.note !== '') session.note = draft.note;
  return session;
}

function exerciseLineFromDraft(draft: WorkoutDraft, units: HealthUnits, completed: boolean): WorkoutExerciseLine {
  const set: WorkoutSet = { id: draft.setId, set_type: draft.setType, completed };
  if (draft.exerciseType === 'load-reps' || draft.exerciseType === 'assisted-reps') {
    const kg = canonicalKg(draft.load, units.weight);
    const reps = parseHealthNumber(draft.reps);
    if (kg !== undefined) set.kg = kg;
    if (reps !== undefined) set.reps = reps;
  } else if (draft.exerciseType === 'bodyweight-reps') {
    const reps = parseHealthNumber(draft.reps);
    if (reps !== undefined) set.reps = reps;
  } else if (draft.exerciseType === 'time-distance') {
    const seconds = parseHealthNumber(draft.seconds);
    const metres = canonicalMetres(draft.distance, units.distance);
    if (seconds !== undefined) set.seconds = seconds;
    if (metres !== undefined) set.metres = metres;
  } else {
    const seconds = parseHealthNumber(draft.seconds);
    if (seconds !== undefined) set.seconds = seconds;
  }
  return {
    id: draft.exerciseLineId,
    exercise_id: staticExerciseId(draft.name),
    exercise_type: draft.exerciseType,
    name: draft.name,
    sets: [set],
  };
}

function withinHealthDate(value: string, today: string): boolean {
  return isHealthDate(value) && value >= HEALTH_LIMITS.measuredOnMin && value <= today;
}

function isExerciseType(value: unknown): value is ExerciseType {
  return typeof value === 'string' && (EXERCISE_TYPES as readonly string[]).includes(value);
}

function isSetType(value: unknown): value is SetType {
  return typeof value === 'string' && (SET_TYPES as readonly string[]).includes(value);
}

function readText(
  errors: FieldErrors,
  field: string,
  value: unknown,
  min: number,
  max: number,
): string {
  if (typeof value !== 'string') {
    errors[field] = 'required';
    return '';
  }
  const normalized = normalizeHealthText(value);
  if (hasForbiddenHealthChars(value)) errors[field] = CONTROL_TEXT_MESSAGE;
  else if ([...normalized].length < min || [...normalized].length > max) errors[field] = 'length';
  return normalized;
}

function readNumber(
  errors: FieldErrors,
  field: string,
  value: unknown,
  range: readonly [number, number],
  integer = false,
): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors[field] = 'finite';
    return undefined;
  }
  if (value < range[0] || value > range[1]) errors[field] = 'range';
  else if (integer && !Number.isInteger(value)) errors[field] = 'integer';
  return value;
}

function readPartId(errors: FieldErrors, field: string, value: unknown): string {
  if (typeof value !== 'string' || !PART_ID.test(value)) {
    errors[field] = 'required';
    return '';
  }
  return value;
}

function readExerciseId(name: string, value: unknown): string {
  if (typeof value === 'string' && CUSTOM_ID.test(value)) return value;
  return staticExerciseId(name);
}

function readSet(errors: FieldErrors, input: unknown, type: ExerciseType): WorkoutSet | null {
  if (typeof input !== 'object' || input === null) {
    errors['sets'] = 'required';
    return null;
  }
  const raw = input as Record<string, unknown>;
  const set: WorkoutSet = {
    id: readPartId(errors, 'sets', raw['id']),
    set_type: isSetType(raw['set_type']) ? raw['set_type'] : 'work',
    completed: raw['completed'] === true,
  };
  if (!isSetType(raw['set_type'])) errors['set_type'] = 'required';
  if (typeof raw['completed'] !== 'boolean') errors['sets'] = 'required';
  if (type === 'load-reps' || type === 'assisted-reps') {
    const kg = readNumber(errors, 'kg', raw['kg'], L.kg);
    const reps = readNumber(errors, 'reps', raw['reps'], L.reps, true);
    if (kg !== undefined) set.kg = kg;
    if (reps !== undefined) set.reps = reps;
  } else if (type === 'bodyweight-reps') {
    const reps = readNumber(errors, 'reps', raw['reps'], L.reps, true);
    if (reps !== undefined) set.reps = reps;
  } else if (type === 'time-distance') {
    const seconds = readNumber(errors, 'seconds', raw['seconds'], L.seconds, true);
    const metres = readNumber(errors, 'metres', raw['metres'], L.metres);
    if (seconds !== undefined) set.seconds = seconds;
    if (metres !== undefined) set.metres = metres;
  } else {
    const seconds = readNumber(errors, 'seconds', raw['seconds'], L.seconds, true);
    if (seconds !== undefined) set.seconds = seconds;
  }
  if (raw['effort'] !== undefined) {
    const effort = readNumber(errors, 'effort', raw['effort'], L.effort, true);
    if (effort !== undefined) set.effort = effort;
  }
  return set;
}

function readLine(errors: FieldErrors, input: unknown): WorkoutExerciseLine | null {
  if (typeof input !== 'object' || input === null) {
    errors['exercises'] = 'required';
    return null;
  }
  const raw = input as Record<string, unknown>;
  const name = readText(errors, 'name', raw['name'], 1, L.nameMax);
  if (!isExerciseType(raw['exercise_type'])) {
    errors['exercise_type'] = 'required';
    return null;
  }
  const sets = Array.isArray(raw['sets']) ? raw['sets'] : [];
  if (sets.length < 1) errors['sets'] = 'required';
  if (sets.length > L.sets) errors['sets'] = 'sets';
  const canonicalSets = sets.slice(0, L.sets + 1).map(set => readSet(errors, set, raw['exercise_type'] as ExerciseType)).filter((set): set is WorkoutSet => set !== null);
  return {
    id: readPartId(errors, 'exercises', raw['id']),
    exercise_id: readExerciseId(name, raw['exercise_id']),
    exercise_type: raw['exercise_type'],
    name,
    sets: canonicalSets,
  };
}

function readLines(errors: FieldErrors, input: unknown): WorkoutExerciseLine[] {
  const lines = Array.isArray(input) ? input : [];
  if (lines.length < 1) errors['exercises'] = 'required';
  if (lines.length > L.exercises) errors['exercises'] = 'exercises';
  return lines.slice(0, L.exercises + 1).map(line => readLine(errors, line)).filter((line): line is WorkoutExerciseLine => line !== null);
}

/** Canonical record plus field errors. Any error means the caller must not write. */
export function validateWorkoutRecord(
  input: WorkoutRecord,
  customExerciseCount: number,
  today: string,
): { value: WorkoutRecord; fieldErrors: FieldErrors } {
  const fieldErrors: FieldErrors = {};
  let value: WorkoutRecord;
  if (input.kind === 'exercise') {
    if (!isExerciseType(input.exercise_type)) fieldErrors['exercise_type'] = 'required';
    value = {
      v: 1,
      kind: 'exercise',
      name: readText(fieldErrors, 'name', input.name, 1, L.nameMax),
      exercise_type: isExerciseType(input.exercise_type) ? input.exercise_type : 'load-reps',
      archived: input.archived === true,
    };
    if (!value.archived && customExerciseCount >= L.customExercises) fieldErrors['definitions'] = 'limit';
  } else if (input.kind === 'routine') {
    value = {
      v: 1,
      kind: 'routine',
      name: readText(fieldErrors, 'name', input.name, 1, L.nameMax),
      archived: input.archived === true,
      exercises: readLines(fieldErrors, input.exercises),
    };
  } else if (input.kind === 'session') {
    const session: WorkoutSession = {
      v: 1,
      kind: 'session',
      measured_on: input.measured_on,
      logged_on: input.logged_on,
      state: input.state === 'draft' || input.state === 'completed' ? input.state : 'completed',
      exercises: readLines(fieldErrors, input.exercises),
    };
    if (!withinHealthDate(input.measured_on, today)) fieldErrors['measured_on'] = 'date_range';
    if (!withinHealthDate(input.logged_on, today)) fieldErrors['logged_on'] = 'date_range';
    if (input.state !== 'draft' && input.state !== 'completed') fieldErrors['state'] = 'required';
    if (input.note !== undefined) session.note = readText(fieldErrors, 'note', input.note, 0, 100_000);
    if (input.duration_s !== undefined) {
      const duration = readNumber(fieldErrors, 'duration_s', input.duration_s, L.duration, true);
      if (duration !== undefined) session.duration_s = duration;
    }
    value = session;
  } else {
    fieldErrors['kind'] = 'required';
    value = { v: 1, kind: 'exercise', name: '', exercise_type: 'load-reps', archived: false };
  }
  if (Object.keys(fieldErrors).length === 0 && workoutRecordBytes(value) > L.recordBytes) {
    fieldErrors[value.kind === 'session' && value.note ? 'note' : 'record'] = 'size';
  }
  return { value, fieldErrors };
}
