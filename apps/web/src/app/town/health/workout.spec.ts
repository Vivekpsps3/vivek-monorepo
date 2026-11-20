import { lbToKg, milesToMetres, displayDistance, displayWeight } from './health-units';
import { WORKOUT_LIMITS } from './health.constants';
import { CONTROL_TEXT_MESSAGE } from './health-validate';
import {
  activateDraftLine,
  canonicalPreview,
  commitEnteredSet,
  commitExerciseLine,
  draftFromSession,
  emptyWorkoutDraft,
  formatWorkout,
  moveDraftSet,
  openCanonicalPreview,
  removeDraftSet,
  retagDraftSet,
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

  it('saves only entered sets and resumes those ids, dates, and state', () => {
    const source = emptyWorkoutDraft('session', TODAY);
    const first = commitEnteredSet({
      ...source,
      name: 'Synthetic press',
      load: '100',
      reps: '5',
      state: 'draft',
    }, LB, TODAY);
    expect(first.fieldErrors).toEqual({});
    expect(first.draft.sets).toHaveSize(1);
    expect(first.draft.load).toBe('');
    expect(first.draft.reps).toBe('');
    expect(first.draft.sets[0].id).toBe(source.setId);
    expect(first.draft.setId).not.toBe(source.setId);

    const blank = commitEnteredSet(first.draft, LB, TODAY);
    expect(blank.draft.sets).toHaveSize(1);
    expect(blank.fieldErrors['kg']).toBe('required');

    const second = commitEnteredSet({ ...first.draft, load: '80', reps: '3' }, LB, TODAY);
    expect(second.draft.sets).toHaveSize(2);
    const saved = workoutFromDraft({ ...second.draft, load: '', reps: '' }, TODAY, LB);
    if (saved.kind !== 'session') return;
    expect(saved.state).toBe('draft');
    expect(saved.logged_on).toBe(TODAY);
    expect(saved.measured_on).toBe(TODAY);
    expect(saved.exercises).toHaveSize(1);
    expect(saved.exercises[0].id).toBe(source.exerciseLineId);
    expect(saved.exercises[0].sets.map(set => set.id)).toEqual([source.setId, second.draft.sets[1].id]);
    expect(saved.exercises[0].sets.every(set => set.completed === false)).toBeTrue();
    expect(saved.exercises[0].sets.map(set => set.reps)).toEqual([5, 3]);

    const resumed = draftFromSession({ clientId: 'hlt_sessiondraft00000001', revision: 2, value: saved });
    expect(resumed.clientId).toBe('hlt_sessiondraft00000001');
    expect(resumed.revision).toBe(2);
    expect(resumed.loggedOn).toBe(TODAY);
    expect(resumed.measuredOn).toBe(TODAY);
    expect(resumed.sets.map(set => set.id)).toEqual(saved.exercises[0].sets.map(set => set.id));
    expect(resumed.load).toBe('');
    const again = workoutFromDraft(resumed, '2026-11-20', LB);
    if (again.kind !== 'session') return;
    expect(again.logged_on).toBe(TODAY);
    expect(again.measured_on).toBe(TODAY);
    expect(again.exercises[0].sets).toEqual(saved.exercises[0].sets);
    expect(formatWorkout(saved, LB)).toBe(`Draft session · Synthetic press · ${TODAY} · 2 sets`);
  });

  it('stores a lift, an assisted set, a bodyweight set, and a run without inventing a set', () => {
    const source = emptyWorkoutDraft('session', TODAY);
    const warmup = commitEnteredSet({
      ...source,
      name: 'Synthetic press',
      setType: 'warmup',
      load: '100',
      reps: '5',
      state: 'completed',
    }, LB, TODAY);
    const work = commitEnteredSet({ ...warmup.draft, setType: 'work', load: '80', reps: '3' }, LB, TODAY);
    const extra = commitEnteredSet({ ...work.draft, load: '60', reps: '1' }, LB, TODAY);
    const moved = moveDraftSet(extra.draft, extra.draft.sets[2].id, -1);
    expect(moved.sets.map(set => set.reps)).toEqual([5, 1, 3]);
    const removed = removeDraftSet(moved, extra.draft.sets[2].id);
    expect(removed.sets.map(set => set.reps)).toEqual([5, 3]);
    expect(removed.sets.map(set => set.id)).toEqual([warmup.draft.sets[0].id, work.draft.sets[1].id]);
    expect(moveDraftSet(removed, removed.sets[0].id, -1)).toBe(removed);
    const retagged = retagDraftSet(removed, removed.sets[1].id, 'drop');
    expect(retagged.sets[1].setType).toBe('drop');
    expect(retagged.sets[1].kg).toBe(removed.sets[1].kg);
    expect(retagged.sets[1].reps).toBe(3);
    const restored = retagDraftSet(retagged, removed.sets[1].id, 'work');
    expect(restored.sets.map(set => set.setType)).toEqual(['warmup', 'work']);
    expect(canonicalPreview(restored.sets[0])).toBe(`Stored as ${lbToKg(100).toFixed(2)} kg · 5 reps`);
    expect(openCanonicalPreview({ ...restored, load: '80', reps: '3' }, LB)).toBe(`Stored as ${lbToKg(80).toFixed(2)} kg · 3 reps`);
    expect(openCanonicalPreview(restored, LB)).toBe('');

    const lift = commitExerciseLine(restored, LB, TODAY);
    expect(lift.fieldErrors).toEqual({});
    expect(lift.draft.sets).toEqual([]);
    expect(lift.draft.floorBefore).toHaveSize(1);
    const blankExercise = commitExerciseLine(lift.draft, LB, TODAY);
    expect(blankExercise.draft.floorBefore).toHaveSize(1);
    expect(blankExercise.fieldErrors['kg']).toBe('required');

    const body = commitEnteredSet({
      ...lift.draft,
      name: 'Synthetic pull',
      exerciseType: 'bodyweight-reps',
      reps: '8',
    }, LB, TODAY);
    expect(body.draft.sets[0].kg).toBeUndefined();
    expect(canonicalPreview(body.draft.sets[0])).toBe('Stored as 8 reps');
    const bodyLine = commitExerciseLine(body.draft, LB, TODAY);
    const assisted = commitEnteredSet({
      ...bodyLine.draft,
      name: 'Synthetic assist',
      exerciseType: 'assisted-reps',
      load: '20',
      reps: '6',
      setType: 'drop',
    }, LB, TODAY);
    expect(assisted.fieldErrors).toEqual({});
    expect(assisted.draft.sets[0].kg).toBe(lbToKg(20));
    const assistLine = commitExerciseLine(assisted.draft, LB, TODAY);
    const run = commitEnteredSet({
      ...assistLine.draft,
      name: 'Synthetic run',
      exerciseType: 'time-distance',
      setType: 'drop',
      seconds: '1200',
      distance: '1',
    }, LB, TODAY);
    const saved = workoutFromDraft({ ...run.draft, seconds: '', distance: '' }, TODAY, LB);
    if (saved.kind !== 'session') return;
    expect(saved.exercises.map(line => line.exercise_type)).toEqual([
      'load-reps', 'bodyweight-reps', 'assisted-reps', 'time-distance',
    ]);
    expect(saved.exercises[0].sets.map(set => set.set_type)).toEqual(['warmup', 'work']);
    expect(saved.exercises[0].sets.map(set => set.kg)).toEqual([lbToKg(100), lbToKg(80)]);
    expect(saved.exercises[0].sets.map(set => set.reps)).toEqual([5, 3]);
    expect(saved.exercises[1].sets).toEqual([jasmine.objectContaining({ reps: 8, set_type: 'work' })]);
    expect(saved.exercises[1].sets[0].kg).toBeUndefined();
    expect(saved.exercises[2].sets[0].kg).toBe(lbToKg(20));
    expect(saved.exercises[2].sets[0].reps).toBe(6);
    expect(saved.exercises[2].sets[0].set_type).toBe('drop');
    expect(saved.exercises[3].sets[0].seconds).toBe(1200);
    expect(saved.exercises[3].sets[0].metres).toBe(Number(milesToMetres(1).toFixed(2)));
    expect(saved.exercises[3].sets[0].kg).toBeUndefined();
    expect(saved.exercises[3].sets[0].set_type).toBe('drop');
    expect(saved.exercises.every(line => line.sets.every(set => set.completed))).toBeTrue();
    expect(JSON.stringify(saved)).not.toContain('"reps":1');

    const resumed = draftFromSession({ clientId: 'hlt_sessionfloor000000001', revision: 4, value: saved });
    const again = workoutFromDraft(resumed, '2026-11-20', KG);
    if (again.kind !== 'session') return;
    expect(again.logged_on).toBe(TODAY);
    expect(again.exercises).toEqual(saved.exercises);
    expect(resumed.load).toBe('');
    expect(resumed.distance).toBe('');
    const switched = activateDraftLine(resumed, saved.exercises[0].id, LB, '2026-11-20');
    const roundTrip = workoutFromDraft(switched.draft, '2026-11-20', LB);
    if (roundTrip.kind !== 'session') return;
    expect(roundTrip.exercises.map(line => line.id)).toEqual(saved.exercises.map(line => line.id));
    expect(formatWorkout(saved, LB)).toBe(`Session · 4 exercises · ${TODAY} · 5 sets`);
  });
});
