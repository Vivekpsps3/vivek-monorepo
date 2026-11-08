import {
  activityCounts,
  lifeAge,
  lifeRowCount,
  lifeRowStart,
  lifeWeeks,
  weekLevel,
  weekScoreFromDays,
  type DayChannels,
} from '@vivek/ui';
import type { PixelDayView, TripSpan } from './pixels.types';

/** Synthetic poster. Not a real person. */
export const LIFE_PERF_BIRTHDAY = '1990-05-04';
export const LIFE_PERF_TODAY = '2026-10-29';

export type LifeFillKind = 'future' | 'lived' | 'l1' | 'l2' | 'l3' | 'l4';
export type LifePosterTier = 'sm' | 'md' | 'lg';
export type LifeBirthdayState = 'missing' | 'future' | 'ready';

export interface LifePosterWeek {
  row: number;
  week: number;
  kind: LifeFillKind;
  trip: boolean;
  planned: boolean;
  now: boolean;
}

export interface LifePerfWeek extends LifePosterWeek {
  start: string;
  end: string;
}

export interface LifeWeekCell extends LifePosterWeek {
  start: string;
  end: string;
  score: number;
  level: number;
  tripTitle: string | null;
  town: number;
  media: number;
  travel: number;
  financeKept: number;
  financeKnown: boolean;
  activities: number;
}

export interface LifeYearRow {
  row: number;
  label: string;
  activeWeeks: number;
  town: number;
  media: number;
  travel: number;
}

export interface LifeGrid {
  birthday: string;
  today: string;
  age: number;
  rowCount: number;
  showAge: boolean;
  cells: LifeWeekCell[];
  years: LifeYearRow[];
  now: { row: number; week: number } | null;
}

export interface LifePosterMetrics {
  tier: LifePosterTier;
  cell: number;
  gap: number;
  columnExtra: number;
  rowExtra: number;
  axis: number;
  header: number;
  tail: number;
  pad: number;
  labelSize: number;
  dotRadius: number;
  showDots: boolean;
  showNowLabel: boolean;
  showWeekLabels: boolean;
  ringPad: number;
}

export interface LifeLevelPaths {
  lived: string;
  future: string;
  l1: string;
  l2: string;
  l3: string;
  l4: string;
}

export interface LifeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LifeTripDot {
  row: number;
  week: number;
  cx: number;
  cy: number;
  planned: boolean;
}

export interface LifeSvgLabel {
  text: string;
  x: number;
  y: number;
  anchor: 'start' | 'end';
  size: number;
}

export const LIFE_FILLS: Record<LifeFillKind, { fill: string; stroke: string | null }> = {
  future: { fill: 'none', stroke: 'var(--pixel-future)' },
  lived: { fill: 'var(--pixel-lived)', stroke: null },
  l1: { fill: 'var(--pixel-1)', stroke: null },
  l2: { fill: 'var(--pixel-2)', stroke: null },
  l3: { fill: 'var(--pixel-3)', stroke: null },
  l4: { fill: 'var(--pixel-4)', stroke: null },
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const LEVEL_KEYS = ['lived', 'future', 'l1', 'l2', 'l3', 'l4'] as const;

const TIER_METRICS: Record<LifePosterTier, LifePosterMetrics> = {
  sm: {
    tier: 'sm', cell: 4, gap: 1, columnExtra: 2, rowExtra: 3, axis: 36, header: 2, tail: 2, pad: 2,
    labelSize: 8, dotRadius: 0, showDots: false, showNowLabel: false, showWeekLabels: false, ringPad: 1.5,
  },
  md: {
    tier: 'md', cell: 7, gap: 1, columnExtra: 3, rowExtra: 3, axis: 40, header: 2, tail: 4, pad: 2,
    labelSize: 10, dotRadius: 1.6, showDots: true, showNowLabel: false, showWeekLabels: false, ringPad: 2,
  },
  lg: {
    tier: 'lg', cell: 10, gap: 2, columnExtra: 4, rowExtra: 4, axis: 44, header: 14, tail: 56, pad: 4,
    labelSize: 11, dotRadius: 2.2, showDots: true, showNowLabel: true, showWeekLabels: true, ringPad: 2,
  },
};

export function lifePosterTier(viewportWidth: number): LifePosterTier {
  if (viewportWidth <= 640) return 'sm';
  if (viewportWidth < 1024) return 'md';
  return 'lg';
}

export function lifePosterMetrics(tier: LifePosterTier, showAge = false): LifePosterMetrics {
  const base = TIER_METRICS[tier];
  if (!showAge) return base;
  const extra = tier === 'sm' ? 22 : 20;
  return { ...base, axis: base.axis + extra };
}

export function lifeBirthdayState(birthday: string | null, today: string): LifeBirthdayState {
  if (!birthday) return 'missing';
  try {
    return lifeAge(birthday, today) == null ? 'future' : 'ready';
  } catch {
    return 'missing';
  }
}

export function lifeYearSpanLabel(birthday: string, row: number): string {
  const start = lifeRowStart(birthday, row);
  const next = lifeRowStart(birthday, row + 1);
  const startMonth = MONTHS[Number(start.slice(5, 7)) - 1] ?? '';
  const nextMonth = MONTHS[Number(next.slice(5, 7)) - 1] ?? '';
  return `${startMonth} ${start.slice(0, 4)} – ${nextMonth} ${next.slice(0, 4)}`;
}

export function lifeAxisText(birthday: string, row: number, showAge: boolean): string {
  if (showAge) return `Age ${row}`;
  return lifeRowStart(birthday, row).slice(0, 4);
}

export function buildLifeGrid(input: {
  birthday: string;
  today: string;
  showAge: boolean;
  days: readonly PixelDayView[];
  trips: readonly TripSpan[];
}): LifeGrid | null {
  const age = readAge(input.birthday, input.today);
  if (age == null) return null;
  const rowCount = lifeRowCount(age);
  const byDate = new Map<string, PixelDayView>();
  for (const day of input.days) byDate.set(day.date, day);
  const sorted = [...byDate.keys()].sort();
  const cells: LifeWeekCell[] = [];
  const years: LifeYearRow[] = [];
  let now: { row: number; week: number } | null = null;
  for (let row = 0; row < rowCount; row += 1) {
    const spans = lifeWeeks(input.birthday, row);
    let activeWeeks = 0;
    let town = 0;
    let media = 0;
    let travel = 0;
    let started = false;
    for (const span of spans) {
      const dates = datesBetween(sorted, span.start, span.end);
      const channels: DayChannels[] = [];
      let townSum = 0;
      let mediaSum = 0;
      let travelSum = 0;
      let financeKept = 0;
      let financeKnown = false;
      let activities = 0;
      for (const date of dates) {
        const day = byDate.get(date);
        if (!day) continue;
        channels.push(day.channels);
        const counts = activityCounts(day.channels);
        townSum += counts.town;
        mediaSum += counts.media;
        travelSum += counts.travel;
        activities += counts.town + counts.media + counts.travel + counts.finance;
        if (typeof day.channels.fin === 'number') {
          financeKnown = true;
          if (day.channels.fin === 1) financeKept += 1;
        }
      }
      const future = span.start > input.today;
      const current = span.start <= input.today && input.today <= span.end;
      const score = weekScoreFromDays(channels);
      const level = future ? 0 : weekLevel(score);
      const tripTitle = overlappingTrip(span.start, span.end, input.trips);
      const trip = tripTitle != null || travelSum > 0;
      const cell: LifeWeekCell = {
        row,
        week: span.week,
        start: span.start,
        end: span.end,
        score,
        level,
        kind: future ? 'future' : level > 0 ? (`l${level}` as LifeFillKind) : 'lived',
        trip,
        planned: future && trip,
        now: current,
        tripTitle,
        town: townSum,
        media: mediaSum,
        travel: travelSum,
        financeKept,
        financeKnown,
        activities,
      };
      cells.push(cell);
      if (current) now = { row, week: span.week };
      if (!future) {
        started = true;
        if (level > 0) activeWeeks += 1;
        town += townSum;
        media += mediaSum;
        travel += travelSum;
      }
    }
    if (started) {
      years.push({ row, label: lifeYearSpanLabel(input.birthday, row), activeWeeks, town, media, travel });
    }
  }
  return {
    birthday: input.birthday,
    today: input.today,
    age,
    rowCount,
    showAge: input.showAge,
    cells,
    years,
    now,
  };
}

export function lifeCellAt(grid: LifeGrid, row: number, week: number): LifeWeekCell | null {
  const cell = grid.cells[row * 52 + week - 1];
  if (!cell || cell.row !== row || cell.week !== week) return null;
  return cell;
}

export function lifeMoveSelection(
  current: { row: number; week: number },
  rowCount: number,
  rowDelta: number,
  weekDelta: number,
): { row: number; week: number } {
  const last = Math.max(0, rowCount - 1);
  return {
    row: Math.min(last, Math.max(0, current.row + rowDelta)),
    week: Math.min(52, Math.max(1, current.week + weekDelta)),
  };
}

export function lifeWeekAnnouncement(
  cell: Pick<LifeWeekCell, 'activities' | 'level' | 'now' | 'row'>,
  showAge: boolean,
  weekOf: string,
): string {
  const noun = cell.activities === 1 ? 'activity' : 'activities';
  let text = `Week of ${weekOf}: ${cell.activities} ${noun}, level ${cell.level} of 4.`;
  if (cell.now) text += ' This week.';
  if (showAge) text += ` Age ${cell.row}.`;
  return text;
}

export function lifeWeekOrdinal(row: number, week: number): number {
  return row * 52 + week;
}

export function lifeCellOrigin(metrics: LifePosterMetrics, row: number, weekIndex: number): { x: number; y: number } {
  const step = metrics.cell + metrics.gap;
  return {
    x: metrics.axis + weekIndex * step + Math.floor(weekIndex / 13) * metrics.columnExtra,
    y: metrics.header + row * step + Math.floor(row / 10) * metrics.rowExtra,
  };
}

export function lifePosterSize(metrics: LifePosterMetrics, rowCount: number): { width: number; height: number } {
  const lastRow = Math.max(rowCount - 1, 0);
  const origin = lifeCellOrigin(metrics, lastRow, 51);
  return {
    width: origin.x + metrics.cell + metrics.tail,
    height: origin.y + metrics.cell + metrics.pad,
  };
}

/** One path string per level. Cells share those strings; they are not one string per week. */
export function lifePosterPathStrings(weeks: readonly LifePosterWeek[], metrics: LifePosterMetrics): LifeLevelPaths {
  const chunks: Record<LifeFillKind, string[]> = {
    lived: [], future: [], l1: [], l2: [], l3: [], l4: [],
  };
  const cell = metrics.cell;
  const step = cell + metrics.gap;
  const axis = metrics.axis;
  const header = metrics.header;
  const columnExtra = metrics.columnExtra;
  const rowExtra = metrics.rowExtra;
  const columns = new Array<number>(52);
  for (let weekIndex = 0; weekIndex < 52; weekIndex += 1) {
    columns[weekIndex] = axis + weekIndex * step + Math.floor(weekIndex / 13) * columnExtra;
  }
  for (let index = 0; index < weeks.length; index += 1) {
    const week = weeks[index]!;
    const x = columns[week.week - 1] ?? axis;
    const y = header + week.row * step + Math.floor(week.row / 10) * rowExtra;
    if (week.kind === 'future') chunks.future.push(`M${x}.5 ${y}.5h${cell - 1}v${cell - 1}h${1 - cell}z`);
    else chunks[week.kind].push(`M${x} ${y}h${cell}v${cell}h${-cell}z`);
  }
  return {
    lived: chunks.lived.join(''),
    future: chunks.future.join(''),
    l1: chunks.l1.join(''),
    l2: chunks.l2.join(''),
    l3: chunks.l3.join(''),
    l4: chunks.l4.join(''),
  };
}

export function lifeRingRect(metrics: LifePosterMetrics, row: number, week: number, pad = metrics.ringPad): LifeRect {
  const origin = lifeCellOrigin(metrics, row, week - 1);
  return {
    x: origin.x - pad,
    y: origin.y - pad,
    width: metrics.cell + pad * 2,
    height: metrics.cell + pad * 2,
  };
}

/** Selection cursor only. Does not rebuild level paths. */
export function lifeSelectionRect(metrics: LifePosterMetrics, row: number, week: number): LifeRect {
  return lifeRingRect(metrics, row, week, metrics.ringPad + 1.5);
}

export function lifeRectString(rect: LifeRect): string {
  return `${rect.x},${rect.y},${rect.width},${rect.height}`;
}

export function lifeShapeStrings(paths: LifeLevelPaths, rects: readonly LifeRect[]): string[] {
  const strings: string[] = [];
  for (const key of LEVEL_KEYS) strings.push(paths[key]);
  for (const rect of rects) strings.push(lifeRectString(rect));
  return strings;
}

export function lifeTripDots(weeks: readonly LifePosterWeek[], metrics: LifePosterMetrics): LifeTripDot[] {
  if (!metrics.showDots) return [];
  const dots: LifeTripDot[] = [];
  for (const week of weeks) {
    if (!week.trip) continue;
    const origin = lifeCellOrigin(metrics, week.row, week.week - 1);
    dots.push({
      row: week.row,
      week: week.week,
      cx: origin.x + metrics.cell / 2,
      cy: origin.y + metrics.cell / 2,
      planned: week.planned,
    });
  }
  return dots;
}

export function lifeSvgLabels(input: {
  birthday: string;
  rowCount: number;
  showAge: boolean;
  metrics: LifePosterMetrics;
  now: { row: number; week: number } | null;
}): LifeSvgLabel[] {
  const labels: LifeSvgLabel[] = [];
  const { metrics } = input;
  for (let row = 0; row < input.rowCount; row += 10) {
    const origin = lifeCellOrigin(metrics, row, 0);
    labels.push({
      text: lifeAxisText(input.birthday, row, input.showAge),
      x: metrics.axis - 4,
      y: origin.y + Math.max(metrics.cell - 1, 6),
      anchor: 'end',
      size: metrics.labelSize,
    });
  }
  if (metrics.showWeekLabels) {
    for (const week of [1, 14, 27, 40]) {
      const origin = lifeCellOrigin(metrics, 0, week - 1);
      labels.push({ text: `wk ${week}`, x: origin.x, y: 11, anchor: 'start', size: metrics.labelSize });
    }
  }
  if (metrics.showNowLabel && input.now) {
    const rowOrigin = lifeCellOrigin(metrics, input.now.row, input.now.week - 1);
    const end = lifeCellOrigin(metrics, input.now.row, 51);
    labels.push({
      text: '◂ Now',
      x: end.x + metrics.cell + 8,
      y: rowOrigin.y + Math.max(metrics.cell - 1, 8),
      anchor: 'start',
      size: metrics.labelSize,
    });
  }
  return labels;
}

export function lifeNearestWeek(
  metrics: LifePosterMetrics,
  x: number,
  y: number,
  rowCount: number,
): { row: number; week: number } {
  const step = metrics.cell + metrics.gap;
  const row = nearestIndex(y, Math.max(rowCount, 1), metrics.header, step, 10, metrics.rowExtra, metrics.cell);
  const weekIndex = nearestIndex(x, 52, metrics.axis, step, 13, metrics.columnExtra, metrics.cell);
  return { row, week: weekIndex + 1 };
}

export const LIFE_PERF_WEEKS: readonly LifePerfWeek[] = buildPerfWeeks();

function buildPerfWeeks(): LifePerfWeek[] {
  const age = lifeAge(LIFE_PERF_BIRTHDAY, LIFE_PERF_TODAY);
  if (age == null) throw new Error('Life perf fixture has no age');
  const rows = lifeRowCount(age);
  const weeks: LifePerfWeek[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (const span of lifeWeeks(LIFE_PERF_BIRTHDAY, row)) {
      const future = span.start > LIFE_PERF_TODAY;
      const now = span.start <= LIFE_PERF_TODAY && LIFE_PERF_TODAY <= span.end;
      const level = (row * 3 + span.week) % 5;
      const kind: LifeFillKind = future ? 'future' : level === 0 ? 'lived' : (`l${level}` as LifeFillKind);
      const planned = future && (row + span.week) % 23 === 0;
      const trip = planned || (!future && (row + span.week) % 17 === 0);
      weeks.push({
        row,
        week: span.week,
        start: span.start,
        end: span.end,
        kind,
        trip,
        planned,
        now,
      });
    }
  }
  return weeks;
}

function readAge(birthday: string, today: string): number | null {
  try {
    return lifeAge(birthday, today);
  } catch {
    return null;
  }
}

function datesBetween(sorted: readonly string[], start: string, end: string): string[] {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! < start) lo = mid + 1;
    else hi = mid;
  }
  const dates: string[] = [];
  for (let index = lo; index < sorted.length; index += 1) {
    const date = sorted[index]!;
    if (date > end) break;
    dates.push(date);
  }
  return dates;
}

function overlappingTrip(start: string, end: string, trips: readonly TripSpan[]): string | null {
  let match: TripSpan | null = null;
  for (const trip of trips) {
    if (trip.end < start || trip.start > end) continue;
    if (match == null || trip.start > match.start) match = trip;
  }
  return match?.title ?? null;
}

function nearestIndex(
  pos: number,
  count: number,
  origin: number,
  step: number,
  extraEvery: number,
  extra: number,
  cell: number,
): number {
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let index = 0; index < count; index += 1) {
    const start = origin + index * step + Math.floor(index / extraEvery) * extra;
    const dist = Math.abs(start + cell / 2 - pos);
    if (dist < bestDist) {
      bestDist = dist;
      best = index;
    }
  }
  return best;
}
