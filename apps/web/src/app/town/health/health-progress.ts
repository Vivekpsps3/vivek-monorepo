import { HEALTH_BADGES, HEALTH_BADGE_EXPLANATIONS, HEALTH_LIMITS } from './health.constants';
import {
  computePrEvents,
  currentPrs,
  healthBadges,
  liftPrEligible,
  prCandidates,
  type PrEvent,
} from './health-math';
import { isHealthDate } from './health-validate';
import type { HealthUnits } from './health-entry';
import { displayDistance, displayWeight, pace } from './health-units';
import type { HealthPr, HealthStat } from './health.types';
import {
  EXERCISE_TYPES,
  type ExerciseType,
  type WorkoutExerciseLine,
  type WorkoutSession,
  type WorkoutSet,
} from './workout';

export interface ProgressRecord {
  clientId: string;
  value: HealthPr;
}

export interface ProgressSession {
  clientId: string;
  value: WorkoutSession;
}

export interface ProgressPoint {
  source: 'record' | 'set';
  recordId: string;
  sessionId: string;
  setId: string;
  measuredOn: string;
  summary: string;
  /** Canonical kilograms. Null when this point is not a lift. */
  e1rmKg: number | null;
  /** Display pace. Empty when this point has no distance. */
  pace: string;
}

/** One plotted attempt. `y` is the same canonical value PR replay compares. */
export interface ProgressHistoryPoint {
  id: string;
  measuredOn: string;
  summary: string;
  y: number;
}

export interface ProgressSeries {
  key: string;
  title: string;
  kind: 'lift' | 'run' | 'other' | 'exercise';
  current: ProgressPoint;
  previous: ProgressPoint | null;
  recent: boolean;
  /** Oldest first. The wall draws a bounded slice of this list. */
  history: ProgressHistoryPoint[];
}

/** Newest points a progress chart may draw. Older points in the window stay off it. */
export const PROGRESS_WALL_POINTS = 12;

export function boundProgressWall(
  points: readonly ProgressHistoryPoint[],
  from: string,
  to: string,
): { points: ProgressHistoryPoint[]; omitted: number } {
  const filtered = points.filter(point => Number.isFinite(point.y)
    && (!from || point.measuredOn >= from)
    && (!to || point.measuredOn <= to));
  if (filtered.length <= PROGRESS_WALL_POINTS) return { points: filtered, omitted: 0 };
  const omitted = filtered.length - PROGRESS_WALL_POINTS;
  return { points: filtered.slice(omitted), omitted };
}

/**
 * A blank end is open. A real date must sit on 1900-01-01 through today,
 * and the start cannot fall after the end. Null keeps the previous window.
 */
export function progressDateWindow(
  from: string,
  to: string,
  today: string,
): { from: string; to: string } | null {
  const start = from.trim();
  const end = to.trim();
  if (!openHealthDate(start, today) || !openHealthDate(end, today)) return null;
  if (start && end && start > end) return null;
  return { from: start, to: end };
}

function openHealthDate(value: string, today: string): boolean {
  if (!value) return true;
  return isHealthDate(value) && value >= HEALTH_LIMITS.measuredOnMin && value <= today;
}

export interface ProgressGroup {
  id: 'lifts' | 'runs' | 'other' | 'exercises';
  title: string;
  series: ProgressSeries[];
}

export interface HealthTrophy {
  id: string;
  name: string;
  explanation: string;
}

/** A minigame result. It is not a Health badge and it is not stored here. */
export interface GameMedalInput {
  id: string;
  name: string;
}

export interface PresentedMedal {
  id: string;
  name: string;
  explanation: string;
}

export const GAME_MEDAL_EXPLANATION =
  'A game medal records a minigame. It does not record a lift, a run, or a medical result.';

const HEALTH_CLAIM = /\b(lifts?|runs?|marathon|plates?|medical|clinic|blood|heart|personal record)\b/i;
const BADGE_ID = /^(?:first_pr_|pr_beaten_|plate_|run_|logged_weeks_)/;

/**
 * Keep a minigame medal out of the Health trophy list. A name or id that
 * already belongs to a Health badge, or that claims a lift, run, or medical
 * result, is not shown.
 */
export function presentGameMedals(medals: readonly GameMedalInput[]): PresentedMedal[] {
  const badgeNames = new Set<string>(Object.values(HEALTH_BADGES));
  const seen = new Set<string>();
  const presented: PresentedMedal[] = [];
  for (const medal of medals) {
    const id = medal.id.trim();
    const name = medal.name.trim();
    if (!id || !name || seen.has(id) || BADGE_ID.test(id) || badgeNames.has(name)) continue;
    if (HEALTH_CLAIM.test(id) || HEALTH_CLAIM.test(name)) continue;
    const folded = name.toLowerCase();
    if ([...badgeNames].some(badge => folded.includes(badge.toLowerCase()))) continue;
    seen.add(id);
    presented.push({ id, name, explanation: GAME_MEDAL_EXPLANATION });
  }
  return presented;
}

export interface HealthProgress {
  groups: ProgressGroup[];
  recent: ProgressSeries[];
  trophies: HealthTrophy[];
  medals: PresentedMedal[];
  empty: boolean;
}

export const EMPTY_HEALTH_PROGRESS: HealthProgress = {
  groups: [],
  recent: [],
  trophies: [],
  medals: [],
  empty: true,
};

const RUN_TITLES: Record<string, string> = {
  '5k': '5K',
  '10k': '10K',
  half: 'Half marathon',
  full: 'Marathon',
  longest: 'Longest run',
};

const DAY_MS = 86_400_000;

interface RecordSource {
  kind: 'record';
  clientId: string;
  pr: HealthPr;
}

interface SetSource {
  kind: 'set';
  sessionId: string;
  setId: string;
  pr: HealthPr;
}

type Source = RecordSource | SetSource;

interface ExerciseCandidate {
  key: string;
  title: string;
  name: string;
  exerciseType: ExerciseType;
  measuredOn: string;
  loggedOn: string;
  value: number;
  lower: boolean;
  order: number;
  sessionId: string;
  setId: string;
  kg?: number;
  reps?: number;
  seconds?: number;
  metres?: number;
}

/**
 * One derived reading of manual lift, run, and other records plus completed
 * work and drop sets. The result is not a record to store.
 */
export function projectHealthProgress(
  records: readonly ProgressRecord[],
  sessions: readonly ProgressSession[],
  units: HealthUnits,
  today: string,
  stats: readonly HealthStat[] = [],
  medals: readonly GameMedalInput[] = [],
): HealthProgress {
  const manual: RecordSource[] = records.map(record => ({
    kind: 'record',
    clientId: record.clientId,
    pr: record.value,
  }));
  const fromSets = sessionSources(sessions);
  const eventSources: Source[] = [...manual, ...fromSets.events];
  const events = computePrEvents(eventSources.map(source => source.pr));
  const badgeRecords = [...eventSources, ...fromSets.plates].map(source => source.pr);
  const series = [
    ...eventSeries(eventSources, events, units, today),
    ...exerciseSeries(fromSets.exercises, units),
  ];
  const groups = groupSeries(series);
  const recent = series
    .filter(item => item.recent)
    .sort((a, b) => byDate(b.current.measuredOn, a.current.measuredOn) || a.title.localeCompare(b.title));
  const trophies = healthBadges(stats, badgeRecords, events, today)
    .map(id => ({ id, name: HEALTH_BADGES[id], explanation: HEALTH_BADGE_EXPLANATIONS[id] }));
  return {
    groups,
    recent,
    trophies,
    medals: presentGameMedals(medals),
    empty: groups.length === 0 && trophies.length === 0,
  };
}

function sessionSources(sessions: readonly ProgressSession[]): {
  events: SetSource[];
  plates: SetSource[];
  exercises: ExerciseCandidate[];
} {
  const events: SetSource[] = [];
  const plates: SetSource[] = [];
  const exercises: ExerciseCandidate[] = [];
  let order = 0;
  for (const entry of sessions) {
    const session = entry.value;
    if (session.state !== 'completed') continue;
    for (const line of session.exercises) {
      if (!isExerciseType(line.exercise_type)) continue;
      for (const set of line.sets) {
        if (!set.completed || set.set_type === 'warmup') continue;
        const source = describeSet(entry.clientId, session, line, set, order);
        order += 1;
        if (!source) continue;
        if (source.role === 'event') events.push(source.source);
        else if (source.role === 'plate') plates.push(source.source);
        else exercises.push(source.candidate);
      }
    }
  }
  return { events, plates, exercises };
}

function describeSet(
  sessionId: string,
  session: WorkoutSession,
  line: WorkoutExerciseLine,
  set: WorkoutSet,
  order: number,
): { role: 'event'; source: SetSource } | { role: 'plate'; source: SetSource } | { role: 'exercise'; candidate: ExerciseCandidate } | null {
  const type = line.exercise_type as ExerciseType;
  const name = line.name.trim();
  if (type === 'load-reps') {
    if (!name || !finite(set.kg) || !finite(set.reps)) return null;
    const pr: HealthPr = {
      v: 1,
      kind: 'lift',
      measured_on: session.measured_on,
      logged_on: session.logged_on,
      exercise: name,
      kg: set.kg,
      reps: set.reps,
    };
    const source: SetSource = { kind: 'set', sessionId, setId: set.id, pr };
    return liftPrEligible(set.reps) ? { role: 'event', source } : { role: 'plate', source };
  }
  if (type === 'time-distance') {
    if (!finite(set.seconds) || !finite(set.metres) || set.metres <= 0) return null;
    if (inRange(set.metres, HEALTH_LIMITS.distanceM) && inRange(set.seconds, HEALTH_LIMITS.seconds)) {
      const pr: HealthPr = {
        v: 1,
        kind: 'run',
        measured_on: session.measured_on,
        logged_on: session.logged_on,
        distance_m: set.metres,
        seconds: set.seconds,
      };
      return { role: 'event', source: { kind: 'set', sessionId, setId: set.id, pr } };
    }
    if (!name) return null;
    return {
      role: 'exercise',
      candidate: candidate(sessionId, session, line, set, order, set.seconds / set.metres, true),
    };
  }
  if (!name) return null;
  if (type === 'assisted-reps' && finite(set.kg)) {
    return { role: 'exercise', candidate: candidate(sessionId, session, line, set, order, set.kg, true) };
  }
  if (type === 'bodyweight-reps' && finite(set.reps)) {
    return { role: 'exercise', candidate: candidate(sessionId, session, line, set, order, set.reps, false) };
  }
  if (type === 'time-only' && finite(set.seconds)) {
    return { role: 'exercise', candidate: candidate(sessionId, session, line, set, order, set.seconds, false) };
  }
  return null;
}

function candidate(
  sessionId: string,
  session: WorkoutSession,
  line: WorkoutExerciseLine,
  set: WorkoutSet,
  order: number,
  value: number,
  lower: boolean,
): ExerciseCandidate {
  return {
    key: `exercise:${line.exercise_id}:${line.exercise_type}`,
    title: line.name,
    name: line.name,
    exerciseType: line.exercise_type as ExerciseType,
    measuredOn: session.measured_on,
    loggedOn: session.logged_on,
    value,
    lower,
    order,
    sessionId,
    setId: set.id,
    ...(finite(set.kg) ? { kg: set.kg } : {}),
    ...(finite(set.reps) ? { reps: set.reps } : {}),
    ...(finite(set.seconds) ? { seconds: set.seconds } : {}),
    ...(finite(set.metres) ? { metres: set.metres } : {}),
  };
}

function eventSeries(
  sources: readonly Source[],
  events: readonly PrEvent[],
  units: HealthUnits,
  today: string,
): ProgressSeries[] {
  const history = historyByMetric(sources, units);
  return currentPrs(events).map(event => {
    const source = sources[event.index];
    const previous = previousSource(sources, event);
    const current = describeSource(source, event, units);
    const key = `${event.kind}:${event.metric}`;
    return {
      key,
      title: seriesTitle(event, source),
      kind: event.kind,
      current,
      previous: previous ? describeSource(previous, previousEvent(sources, event), units) : null,
      recent: isRecent(current.measuredOn, today),
      history: history.get(key) ?? [],
    };
  });
}

function historyByMetric(sources: readonly Source[], units: HealthUnits): Map<string, ProgressHistoryPoint[]> {
  const grouped = new Map<string, Array<{ source: Source; event: PrEvent; order: number }>>();
  sources.forEach((source, order) => {
    for (const item of prCandidates(source.pr)) {
      if (!Number.isFinite(item.value)) continue;
      const key = `${item.kind}:${item.metric}`;
      const list = grouped.get(key) ?? [];
      list.push({
        source,
        order,
        event: { index: order, kind: item.kind, metric: item.metric, value: item.value, first: false },
      });
      grouped.set(key, list);
    }
  });
  const history = new Map<string, ProgressHistoryPoint[]>();
  for (const [key, list] of grouped) {
    list.sort((a, b) => byDate(a.source.pr.measured_on, b.source.pr.measured_on)
      || byDate(a.source.pr.logged_on, b.source.pr.logged_on)
      || a.order - b.order);
    history.set(key, list.map(item => ({
      id: historyId(item.source, key),
      measuredOn: item.source.pr.measured_on,
      summary: describeSource(item.source, item.event, units).summary,
      y: item.event.value,
    })));
  }
  return history;
}

function historyId(source: Source, key: string): string {
  const who = source.kind === 'record' ? source.clientId : `${source.sessionId}:${source.setId}`;
  return `${key}:${who}`;
}

function previousSource(sources: readonly Source[], event: PrEvent): Source | null {
  const without = sources.filter((_, index) => index !== event.index);
  const next = currentPrs(computePrEvents(without.map(source => source.pr)))
    .find(item => item.kind === event.kind && item.metric === event.metric);
  return next ? without[next.index] ?? null : null;
}

function previousEvent(sources: readonly Source[], event: PrEvent): PrEvent {
  const without = sources.filter((_, index) => index !== event.index);
  const next = currentPrs(computePrEvents(without.map(source => source.pr)))
    .find(item => item.kind === event.kind && item.metric === event.metric);
  return next ?? event;
}

function exerciseSeries(
  candidates: readonly ExerciseCandidate[],
  units: HealthUnits,
): ProgressSeries[] {
  const groups = new Map<string, ExerciseCandidate[]>();
  for (const item of candidates) {
    const list = groups.get(item.key) ?? [];
    list.push(item);
    groups.set(item.key, list);
  }
  const series: ProgressSeries[] = [];
  for (const [key, list] of groups) {
    const ordered = list.slice().sort((a, b) => byDate(a.measuredOn, b.measuredOn)
      || byDate(a.loggedOn, b.loggedOn)
      || a.order - b.order);
    const current = bestExercise(ordered);
    if (!current) continue;
    const previous = bestExercise(ordered.filter(item => item !== current));
    const point = describeExercise(current, units);
    series.push({
      key,
      title: current.title,
      kind: 'exercise',
      current: point,
      previous: previous ? describeExercise(previous, units) : null,
      recent: false,
      history: ordered.filter(item => Number.isFinite(item.value)).map(item => ({
        id: `${key}:${item.sessionId}:${item.setId}`,
        measuredOn: item.measuredOn,
        summary: describeExercise(item, units).summary,
        y: item.value,
      })),
    });
  }
  return series;
}

function bestExercise(ordered: readonly ExerciseCandidate[]): ExerciseCandidate | null {
  let best: ExerciseCandidate | null = null;
  for (const item of ordered) {
    if (!Number.isFinite(item.value)) continue;
    if (!best || (item.lower ? item.value < best.value : item.value > best.value)) best = item;
  }
  return best;
}

function groupSeries(series: readonly ProgressSeries[]): ProgressGroup[] {
  const order: Array<{ id: ProgressGroup['id']; title: string; kind: ProgressSeries['kind'] }> = [
    { id: 'lifts', title: 'Lifts', kind: 'lift' },
    { id: 'runs', title: 'Runs', kind: 'run' },
    { id: 'other', title: 'Other records', kind: 'other' },
    { id: 'exercises', title: 'Exercises', kind: 'exercise' },
  ];
  return order.flatMap(group => {
    const rows = series
      .filter(item => item.kind === group.kind)
      .sort((a, b) => a.title.localeCompare(b.title) || a.key.localeCompare(b.key));
    return rows.length > 0 ? [{ id: group.id, title: group.title, series: rows }] : [];
  });
}

function describeSource(source: Source, event: PrEvent, units: HealthUnits): ProgressPoint {
  const pr = source.pr;
  const base = pointBase(source, pr.measured_on);
  if (pr.kind === 'lift' && finite(pr.kg) && finite(pr.reps)) {
    return {
      ...base,
      summary: liftSummary(pr.exercise || 'Lift', pr.kg, pr.reps, event.value, pr.measured_on, units),
      e1rmKg: event.value,
    };
  }
  if (pr.kind === 'run' && finite(pr.distance_m) && finite(pr.seconds)) {
    const speed = pr.distance_m > 0 ? pace(pr.seconds, pr.distance_m, units.distance) : '';
    return {
      ...base,
      summary: runSummary(event.metric, pr.distance_m, pr.seconds, pr.measured_on, units),
      pace: speed,
    };
  }
  const value = pr.value == null ? '' : `${pr.value} ${pr.unit ?? ''}`.trim();
  const direction = pr.direction === 'lower' ? 'lower' : 'higher';
  return {
    ...base,
    summary: [pr.name || 'Record', value, direction, pr.measured_on].filter(Boolean).join(' · '),
  };
}

function describeExercise(item: ExerciseCandidate, units: HealthUnits): ProgressPoint {
  const date = item.measuredOn;
  let summary = `${item.name} · ${date}`;
  let speed = '';
  if (item.exerciseType === 'bodyweight-reps' && item.reps !== undefined) {
    summary = `${item.name} · ${item.reps} reps · ${date}`;
  } else if (item.exerciseType === 'assisted-reps' && item.kg !== undefined) {
    summary = `${item.name} · ${displayWeight(item.kg, units.weight)} ${units.weight} · ${date}`;
  } else if (item.exerciseType === 'time-only' && item.seconds !== undefined) {
    summary = `${item.name} · ${clock(item.seconds)} · ${date}`;
  } else if (item.metres !== undefined && item.seconds !== undefined) {
    speed = pace(item.seconds, item.metres, units.distance);
    summary = `${item.name} · ${displayDistance(item.metres, units.distance)} ${units.distance} · ${clock(item.seconds)} · ${speed} /${units.distance} · ${date}`;
  }
  return {
    source: 'set',
    recordId: '',
    sessionId: item.sessionId,
    setId: item.setId,
    measuredOn: item.measuredOn,
    summary,
    e1rmKg: null,
    pace: speed,
  };
}

function pointBase(source: Source, measuredOn: string): ProgressPoint {
  return {
    source: source.kind === 'record' ? 'record' : 'set',
    recordId: source.kind === 'record' ? source.clientId : '',
    sessionId: source.kind === 'set' ? source.sessionId : '',
    setId: source.kind === 'set' ? source.setId : '',
    measuredOn,
    summary: '',
    e1rmKg: null,
    pace: '',
  };
}

function seriesTitle(event: PrEvent, source: Source): string {
  if (event.kind === 'lift') return source.pr.exercise || 'Lift';
  if (event.kind === 'run') return RUN_TITLES[event.metric] ?? event.metric;
  return source.pr.name || 'Record';
}

function liftSummary(
  name: string,
  kg: number,
  reps: number,
  estimated: number,
  date: string,
  units: HealthUnits,
): string {
  const weight = `${displayWeight(kg, units.weight)} ${units.weight}`;
  const e1rm = `${displayWeight(estimated, units.weight)} ${units.weight}`;
  return `${name} · ${weight} × ${reps} · e1RM ${e1rm} · ${date}`;
}

function runSummary(
  metric: string,
  distance: number,
  seconds: number,
  date: string,
  units: HealthUnits,
): string {
  const unit = units.distance;
  const speed = distance > 0 ? `${pace(seconds, distance, unit)} /${unit}` : '';
  return [RUN_TITLES[metric] ?? metric, `${displayDistance(distance, unit)} ${unit}`, clock(seconds), speed, date]
    .filter(Boolean)
    .join(' · ');
}

function clock(total: number): string {
  const seconds = Math.max(0, Math.round(total));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remain = seconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(remain).padStart(2, '0')}`;
  return `${minutes}:${String(remain).padStart(2, '0')}`;
}

function isRecent(measuredOn: string, today: string): boolean {
  return measuredOn >= shiftIso(today, -6) && measuredOn <= today;
}

function shiftIso(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function byDate(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function finite(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function inRange(value: number, range: readonly [number, number]): boolean {
  return value >= range[0] && value <= range[1];
}

function isExerciseType(value: string): value is ExerciseType {
  return (EXERCISE_TYPES as readonly string[]).includes(value);
}
