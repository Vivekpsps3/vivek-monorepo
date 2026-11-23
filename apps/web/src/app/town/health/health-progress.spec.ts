import { e1RM } from './health-math';
import { projectHealthProgress, type ProgressSeries } from './health-progress';
import { displayWeight, pace } from './health-units';
import type { HealthPr } from './health.types';
import type { WorkoutSession, WorkoutSet } from './workout';

const TODAY = '2026-11-23';
const LB = { weight: 'lb' as const, distance: 'mi' as const };
const KG = { weight: 'kg' as const, distance: 'km' as const };

function lift(id: string, day: string, kg: number, reps: number, exercise = 'Squat'): { clientId: string; value: HealthPr } {
  return {
    clientId: id,
    value: { v: 1, kind: 'lift', measured_on: day, logged_on: day, exercise, kg, reps },
  };
}

function run(id: string, day: string, distance: number, seconds: number): { clientId: string; value: HealthPr } {
  return {
    clientId: id,
    value: { v: 1, kind: 'run', measured_on: day, logged_on: day, distance_m: distance, seconds },
  };
}

function set(id: string, extra: Partial<WorkoutSet>): WorkoutSet {
  return { id, set_type: 'work', completed: true, ...extra };
}

function session(state: 'draft' | 'completed', sets: WorkoutSet[], measured = '2026-11-20'): WorkoutSession {
  return {
    v: 1,
    kind: 'session',
    measured_on: measured,
    logged_on: measured,
    state,
    exercises: [{
      id: 'wex_progress1',
      exercise_id: 'static:squat',
      exercise_type: 'load-reps',
      name: 'Squat',
      sets,
    }],
  };
}

function lifts(view: ReturnType<typeof projectHealthProgress>): ProgressSeries[] {
  return view.groups.find(group => group.id === 'lifts')?.series ?? [];
}

describe('health progress projection', () => {
  it('restores the previous valid lift when the current best is removed', () => {
    const older = lift('older', '2026-10-01', 100, 1);
    const skipped = lift('middle', '2026-10-10', 90, 1);
    const best = lift('best', '2026-10-20', 110, 1);
    const before = JSON.stringify([older, skipped, best]);
    const view = projectHealthProgress([older, skipped, best], [], LB, TODAY);
    const series = lifts(view)[0];
    expect(series.current.recordId).toBe('best');
    expect(series.current.source).toBe('record');
    expect(series.current.e1rmKg).toBe(110);
    expect(series.current.summary).toContain(displayWeight(110, 'lb'));
    expect(series.previous?.recordId).toBe('older');
    expect(series.previous?.e1rmKg).toBe(100);
    expect(series.previous?.summary).not.toContain('90');
    const restored = projectHealthProgress([older, skipped], [], LB, TODAY);
    expect(lifts(restored)[0].current.recordId).toBe('older');
    expect(lifts(restored)[0].previous?.recordId).toBe('middle');
    expect(lifts(restored)[0].previous?.e1rmKg).toBe(90);
    expect(JSON.stringify([older, skipped, best])).toBe(before);
    expect(view.groups.some(group => group.id === 'other')).toBeFalse();
  });

  it('uses a completed set as the current best and rolls back when that set is left out', () => {
    const manual = lift('manual', '2026-10-20', 110, 1);
    const winning = session('completed', [
      set('wst_warmup001', { set_type: 'warmup', kg: 200, reps: 1 }),
      set('wst_progress1', { kg: 140, reps: 1 }),
    ]);
    const records = [manual];
    const view = projectHealthProgress(records, [{ clientId: 'session', value: winning }], LB, TODAY);
    const current = lifts(view)[0];
    expect(current.current.source).toBe('set');
    expect(current.current.sessionId).toBe('session');
    expect(current.current.setId).toBe('wst_progress1');
    expect(current.current.e1rmKg).toBe(140);
    expect(current.previous?.recordId).toBe('manual');
    expect(current.previous?.e1rmKg).toBe(110);
    const quiet = session('completed', [
      set('wst_warmup001', { set_type: 'warmup', kg: 200, reps: 1 }),
      set('wst_progress1', { kg: 140, reps: 1, completed: false }),
    ]);
    const rolled = projectHealthProgress(records, [{ clientId: 'session', value: quiet }], KG, TODAY);
    expect(lifts(rolled)[0].current.recordId).toBe('manual');
    expect(lifts(rolled)[0].current.summary).toContain('110.0 kg');
    expect(records).toEqual([manual]);
    const draft = session('draft', [set('wst_progress1', { kg: 180, reps: 1 })]);
    expect(lifts(projectHealthProgress(records, [{ clientId: 'draft', value: draft }], LB, TODAY))[0].current.recordId).toBe('manual');
  });

  it('keeps one run in two series and leaves ineligible load out of the lift series', () => {
    const five = run('five', '2026-11-23', 5000, 1500);
    const view = projectHealthProgress([five], [], LB, TODAY);
    const runs = view.groups.find(group => group.id === 'runs')?.series ?? [];
    expect(runs.map(series => series.key).sort()).toEqual(['run:5k', 'run:longest']);
    expect(runs.every(series => series.current.recordId === 'five')).toBeTrue();
    expect(runs.find(series => series.key === 'run:5k')?.current.pace).toBe(pace(1500, 5000, 'mi'));
    expect(pace(1500, 5000, 'km')).toBe('5:00');
    expect(pace(1500, 5000, 'mi')).toBe('8:03');
    expect(runs.find(series => series.key === 'run:5k')?.recent).toBeTrue();
    const old = projectHealthProgress([run('old', '2026-11-16', 5000, 1400)], [], LB, TODAY);
    expect(old.groups.find(group => group.id === 'runs')?.series[0].recent).toBeFalse();
    expect(old.recent).toEqual([]);

    const heavy = session('completed', [set('wst_plate0001', { kg: 100, reps: 13 })]);
    const plates = projectHealthProgress([], [{ clientId: 'plates', value: heavy }], LB, TODAY);
    expect(lifts(plates)).toEqual([]);
    expect(plates.trophies.map(trophy => trophy.name)).toContain('Two plates');
    expect(plates.trophies.map(trophy => trophy.id)).not.toContain('first_pr_lift');
    expect(e1RM(100, 5)).toBeCloseTo(116.666, 2);
    expect(displayWeight(e1RM(100, 5), 'lb')).toBe('257.2');
  });

  it('ranks exercise series without folding them into other records', () => {
    const assisted: WorkoutSession = {
      v: 1,
      kind: 'session',
      measured_on: '2026-11-01',
      logged_on: '2026-11-01',
      state: 'completed',
      exercises: [
        {
          id: 'wex_assist01',
          exercise_id: 'static:assist',
          exercise_type: 'assisted-reps',
          name: 'Assist',
          sets: [set('wst_assist001', { kg: 40, reps: 6 }), set('wst_assist002', { kg: 20, reps: 6 })],
        },
        {
          id: 'wex_pull0001',
          exercise_id: 'static:pull',
          exercise_type: 'bodyweight-reps',
          name: 'Pull',
          sets: [set('wst_pull00001', { reps: 8 }), set('wst_pull00002', { reps: 12 })],
        },
        {
          id: 'wex_hold0001',
          exercise_id: 'static:hold',
          exercise_type: 'time-only',
          name: 'Hold',
          sets: [set('wst_hold00001', { seconds: 60 }), set('wst_hold00002', { seconds: 90 })],
        },
        {
          id: 'wex_short001',
          exercise_id: 'static:short',
          exercise_type: 'time-distance',
          name: 'Short',
          sets: [set('wst_short0001', { metres: 50, seconds: 30 }), set('wst_short0002', { metres: 40, seconds: 20 })],
        },
      ],
    };
    const tied = projectHealthProgress([], [{ clientId: 'moves', value: assisted }], LB, TODAY);
    const exercises = tied.groups.find(group => group.id === 'exercises')?.series ?? [];
    expect(tied.groups.some(group => group.id === 'other' || group.id === 'runs' || group.id === 'lifts')).toBeFalse();
    expect(exercises.find(series => series.title === 'Assist')?.current.summary).toContain(displayWeight(20, 'lb'));
    expect(exercises.find(series => series.title === 'Assist')?.previous?.summary).toContain(displayWeight(40, 'lb'));
    expect(exercises.find(series => series.title === 'Pull')?.current.summary).toContain('12 reps');
    expect(exercises.find(series => series.title === 'Hold')?.current.summary).toContain('1:30');
    expect(exercises.find(series => series.title === 'Short')?.current.summary).toContain('20');
    expect(exercises.every(series => series.recent === false)).toBeTrue();
    expect(projectHealthProgress([], [], LB, TODAY).empty).toBeTrue();
  });
});
