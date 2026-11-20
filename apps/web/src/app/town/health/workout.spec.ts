import { lbToKg, milesToMetres, displayDistance, displayWeight } from './health-units';
import { WORKOUT_LIMITS } from './health.constants';
import { CONTROL_TEXT_MESSAGE } from './health-validate';
import {
  emptyWorkoutDraft,
  formatWorkout,
  reformatWorkoutDraft,
  staticExerciseId,
  validateWorkoutRecord,
  workoutFromDraft,
  workoutParsable,
  workoutRecordBytes,
  type WorkoutDraft,
  type WorkoutExerciseLine,
  type WorkoutKind,
  type WorkoutRecord,
  type WorkoutSession,
} from './workout';

const TODAY = '2026-10-29';
const LB = { weight: 'lb' as const, distance: 'mi' as const };
const KG = { weight: 'kg' as const, distance: 'km' as const };

function draft(kind: WorkoutKind, extra: Partial<WorkoutDraft> = {}): WorkoutRecord {
  return workoutFromDraft({
    ...emptyWorkoutDraft(kind, TODAY),
    name: 'Synthetic press',
    load: '100',
    reps: '5',
    ...extra,
  }, TODAY, LB);
}

function line(index: number, sets = 1): WorkoutExerciseLine {
  return {
    id: `wex_${String(index).padStart(8, 'a')}`,
    exercise_id: staticExerciseId('Synthetic press'),
    exercise_type: 'load-reps',
    name: 'Synthetic press',
    sets: Array.from({ length: sets }, (_, set) => ({
      id: `wst_${String(index).padStart(4, 'b')}${String(set).padStart(4, 'c')}`,
      set_type: 'work' as const,
      completed: true,
      kg: 40,
      reps: 5,
    })),
  };
}

describe('workout records', () => {
  it('stores canonical kilograms, metres, and seconds and keeps inner ids', () => {
    const source = emptyWorkoutDraft('session', TODAY);
    const record = workoutFromDraft({
      ...source,
      name: 'Synthetic press',
      load: '100',
      reps: '5',
      seconds: '',
      distance: '1',
      exerciseType: 'time-distance',
    }, TODAY, LB);
    expect(record.kind).toBe('session');
    if (record.kind !== 'session') return;
    expect(record.logged_on).toBe(TODAY);
    expect(record.measured_on).toBe(TODAY);
    expect(record.exercises[0].id).toBe(source.exerciseLineId);
    expect(record.exercises[0].sets[0].id).toBe(source.setId);
    expect(record.exercises[0].sets[0].metres).toBe(Number(milesToMetres(1).toFixed(2)));
    expect(record.exercises[0].sets[0].kg).toBeUndefined();

    const loaded = workoutFromDraft({
      ...emptyWorkoutDraft('session', TODAY),
      name: 'Synthetic press',
      load: '100',
      reps: '5',
    }, TODAY, LB);
    if (loaded.kind !== 'session') return;
    expect(loaded.exercises[0].sets[0].kg).toBe(lbToKg(100));
    expect(formatWorkout(loaded, LB)).toContain(`${displayWeight(lbToKg(100), 'lb')} lb`);
    expect(formatWorkout(loaded, KG)).toContain(`${displayWeight(lbToKg(100), 'kg')} kg`);

    const forty: WorkoutSession = {
      v: 1,
      kind: 'session',
      measured_on: TODAY,
      logged_on: TODAY,
      state: 'completed',
      exercises: [line(1)],
    };
    expect(formatWorkout(forty, LB)).toContain('88.2 lb');
    const shown = reformatWorkoutDraft({ ...emptyWorkoutDraft('session', TODAY), load: '100' }, LB, KG);
    expect(shown.load).toBe(displayWeight(lbToKg(100), 'kg'));
  });

  it('rejects an invalid, oversized, or over-limit record and keeps a canonical copy', () => {
    const exercise = draft('exercise');
    expect(validateWorkoutRecord(exercise, 0, TODAY).fieldErrors).toEqual({});
    expect(JSON.stringify(validateWorkoutRecord(exercise, 0, TODAY).value)).not.toContain('kg');

    const unnamed = draft('exercise', { name: '' });
    expect(validateWorkoutRecord(unnamed, 0, TODAY).fieldErrors['name']).toBe('length');
    const control = draft('exercise', { name: 'Syn\u0007press' });
    expect(validateWorkoutRecord(control, 0, TODAY).fieldErrors['name']).toBe(CONTROL_TEXT_MESSAGE);

    const capped = validateWorkoutRecord(exercise, WORKOUT_LIMITS.customExercises, TODAY);
    expect(capped.fieldErrors['definitions']).toBe('limit');
    if (exercise.kind !== 'exercise') return;
    const archived = validateWorkoutRecord({ ...exercise, archived: true }, WORKOUT_LIMITS.customExercises, TODAY);
    expect(archived.fieldErrors['definitions']).toBeUndefined();

    const session = draft('session');
    if (session.kind !== 'session') return;
    const tooManySets: WorkoutSession = {
      ...session,
      exercises: [line(1, WORKOUT_LIMITS.sets + 1)],
    };
    expect(validateWorkoutRecord(tooManySets, 0, TODAY).fieldErrors['sets']).toBe('sets');
    const tooManyExercises: WorkoutSession = {
      ...session,
      exercises: Array.from({ length: WORKOUT_LIMITS.exercises + 1 }, (_, index) => line(index)),
    };
    expect(validateWorkoutRecord(tooManyExercises, 0, TODAY).fieldErrors['exercises']).toBe('exercises');

    const huge: WorkoutSession = { ...session, note: 'x'.repeat(40_000) };
    const sized = validateWorkoutRecord(huge, 0, TODAY);
    expect(sized.fieldErrors['note']).toBe('size');
    expect(workoutRecordBytes(sized.value)).toBeGreaterThan(WORKOUT_LIMITS.recordBytes);

    expect(validateWorkoutRecord({ ...session, measured_on: '1899-12-31' }, 0, TODAY).fieldErrors['measured_on']).toBe('date_range');
    expect(validateWorkoutRecord({ ...session, measured_on: '2026-10-30' }, 0, TODAY).fieldErrors['measured_on']).toBe('date_range');
    expect(workoutParsable(null)).toBeFalse();
    expect(workoutParsable({ v: 2, kind: 'exercise', name: 'Synthetic press', exercise_type: 'load-reps' })).toBeFalse();
    expect(workoutParsable(exercise)).toBeTrue();

    const custom = `hlt_${'a'.repeat(22)}`;
    session.exercises[0].exercise_id = custom;
    expect(validateWorkoutRecord(session, 0, TODAY).value).toEqual(jasmine.objectContaining({ kind: 'session' }));
    const kept = validateWorkoutRecord(session, 0, TODAY).value;
    if (kept.kind === 'session') expect(kept.exercises[0].exercise_id).toBe(custom);
    session.exercises[0].exercise_id = 'not-a-client-id';
    const rewritten = validateWorkoutRecord(session, 0, TODAY).value;
    if (rewritten.kind === 'session') expect(rewritten.exercises[0].exercise_id).toBe(staticExerciseId('Synthetic press'));
    expect(displayDistance(1609.34, 'mi')).toBe('1.00');
  });
});
