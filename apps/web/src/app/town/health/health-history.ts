import { formatHealthStat, labRange, labRangeText, type HealthUnits, type LabRange } from './health-entry';
import type { HealthStat } from './health.types';

/** Initial window for each Clinic kind. Show more reveals the next window. */
export const HEALTH_HISTORY_PAGE = 100;
/** Newest plottable points drawn oldest-to-newest, with the same text beside the line. */
export const HEALTH_SPARKLINE_POINTS = 12;

const SPARK_WIDTH = 120;
const SPARK_HEIGHT = 36;
const SPARK_PAD = 3;

const KIND_ORDER: readonly HealthStat['kind'][] = ['weight', 'rhr', 'bp', 'sleep', 'lab', 'checkup'];

const SERIES_COPY: Record<HealthStat['kind'], { title: string; noun: string }> = {
  weight: { title: 'Weight', noun: 'weight' },
  rhr: { title: 'Resting heart rate', noun: 'resting heart rate' },
  bp: { title: 'Blood pressure', noun: 'blood pressure' },
  sleep: { title: 'Sleep', noun: 'sleep' },
  lab: { title: 'Lab results', noun: 'lab results' },
  checkup: { title: 'Checkups', noun: 'checkups' },
};

export interface HealthHistoryPoint {
  clientId: string;
  text: string;
  y: number | null;
  y2: number | null;
}

export interface HealthSparklineView {
  points: readonly HealthHistoryPoint[];
  line: string;
  line2: string;
  dot: { x: number; y: number } | null;
  dot2: { x: number; y: number } | null;
}

export interface HealthHistoryRow {
  clientId: string;
  label: string;
  kind: HealthStat['kind'];
}

export interface LabTableRow {
  clientId: string;
  measuredOn: string;
  value: string;
  unit: string;
  /** Same words as the saved label. No range does not invent a bound. */
  range: string;
}

export interface LabRangeGroupView {
  id: LabRange;
  label: string;
  rows: readonly LabTableRow[];
}

export interface CheckupVisitView {
  clientId: string;
  measuredOn: string;
  note: string;
}

export interface HealthFolderView {
  title: string;
  latestLabel: string;
  /** Display sentence for the unit saved on the result. Not a conversion. */
  unitLine: string;
  sparkline: HealthSparklineView;
  rows: readonly HealthHistoryRow[];
  groups: readonly LabRangeGroupView[];
}

export interface HealthSeriesView {
  kind: HealthStat['kind'];
  title: string;
  noun: string;
  latestLabel: string;
  /** Measured date of the newest row. Display only; the row stays the record. */
  latestMeasuredOn: string;
  sparkline: HealthSparklineView;
  /** Newest first. This is the store snapshot, not a second history. */
  rows: readonly HealthHistoryRow[];
  folders: readonly HealthFolderView[];
  visits: readonly CheckupVisitView[];
}

export interface HealthVisibleFolder extends HealthFolderView {
  id: string;
}

export interface HealthSeriesPage extends HealthSeriesView {
  shown: number;
  total: number;
  more: boolean;
  visibleRows: readonly HealthHistoryRow[];
  visibleFolders: readonly HealthVisibleFolder[];
  visibleVisits: readonly CheckupVisitView[];
}

interface DatedEntry {
  clientId: string;
  value: HealthStat;
}

const EMPTY_SPARKLINE: HealthSparklineView = { points: [], line: '', line2: '', dot: null, dot2: null };

const RANGE_ORDER: readonly LabRange[] = ['below', 'in', 'above', 'none'];

const RANGE_GROUP_LABEL: Record<LabRange, string> = {
  below: 'Below range',
  in: 'In range',
  above: 'Above range',
  none: 'No range',
};

function roundCoord(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Map stored numbers into the sparkline viewBox. Display text stays on the points. */
export function sparklineGeometry(points: readonly { y: number; y2: number | null }[]): Omit<HealthSparklineView, 'points'> {
  if (points.length === 0) return { line: '', line2: '', dot: null, dot2: null };
  const values = points.flatMap(point => point.y2 == null ? [point.y] : [point.y, point.y2]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const xAt = (index: number): number => points.length === 1
    ? SPARK_WIDTH / 2
    : SPARK_PAD + (index * (SPARK_WIDTH - SPARK_PAD * 2)) / (points.length - 1);
  const yAt = (value: number): number => max === min
    ? SPARK_HEIGHT / 2
    : SPARK_PAD + (1 - (value - min) / (max - min)) * (SPARK_HEIGHT - SPARK_PAD * 2);
  const lineOf = (pick: (point: { y: number; y2: number | null }) => number | null): string => {
    if (points.length < 2) return '';
    return points.map((point, index) => {
      const value = pick(point);
      return value == null ? '' : `${roundCoord(xAt(index))},${roundCoord(yAt(value))}`;
    }).filter(Boolean).join(' ');
  };
  const dotOf = (value: number | null): { x: number; y: number } | null => (
    points.length === 1 && value != null ? { x: roundCoord(xAt(0)), y: roundCoord(yAt(value)) } : null
  );
  return {
    line: lineOf(point => point.y),
    line2: lineOf(point => point.y2),
    dot: dotOf(points[0]?.y ?? null),
    dot2: dotOf(points[0]?.y2 ?? null),
  };
}

function plotted(stat: HealthStat): { y: number; y2: number | null } | null {
  switch (stat.kind) {
    case 'weight':
      return stat.kg != null && Number.isFinite(stat.kg) ? { y: stat.kg, y2: null } : null;
    case 'rhr':
      return stat.bpm != null && Number.isFinite(stat.bpm) ? { y: stat.bpm, y2: null } : null;
    case 'bp':
      return stat.sys != null && stat.dia != null && Number.isFinite(stat.sys) && Number.isFinite(stat.dia)
        ? { y: stat.sys, y2: stat.dia }
        : null;
    case 'sleep':
      return stat.hours != null && Number.isFinite(stat.hours) ? { y: stat.hours, y2: null } : null;
    case 'lab':
      return stat.lab != null && Number.isFinite(stat.lab.value) ? { y: stat.lab.value, y2: null } : null;
    case 'checkup':
      return null;
  }
}

/** Newest measured date, then newest logged date, then later input. */
function newestFirst(entries: readonly DatedEntry[]): DatedEntry[] {
  return entries.map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      if (a.entry.value.measured_on !== b.entry.value.measured_on) {
        return a.entry.value.measured_on < b.entry.value.measured_on ? 1 : -1;
      }
      if (a.entry.value.logged_on !== b.entry.value.logged_on) {
        return a.entry.value.logged_on < b.entry.value.logged_on ? 1 : -1;
      }
      return b.index - a.index;
    })
    .map(item => item.entry);
}

function toRow(entry: DatedEntry, units: HealthUnits): HealthHistoryRow {
  return {
    clientId: entry.clientId,
    label: formatHealthStat(entry.value, units),
    kind: entry.value.kind,
  };
}

function sparklineFor(entries: readonly DatedEntry[], units: HealthUnits, numeric: boolean): HealthSparklineView {
  const chosen: HealthHistoryPoint[] = [];
  for (const entry of entries) {
    const plot = plotted(entry.value);
    if (numeric && !plot) continue;
    chosen.push({
      clientId: entry.clientId,
      text: formatHealthStat(entry.value, units),
      y: plot?.y ?? null,
      y2: plot?.y2 ?? null,
    });
    if (chosen.length === HEALTH_SPARKLINE_POINTS) break;
  }
  chosen.reverse();
  const drawable = chosen.filter((point): point is HealthHistoryPoint & { y: number } => point.y != null);
  return { points: chosen, ...sparklineGeometry(drawable) };
}

function labTableRow(entry: DatedEntry): LabTableRow {
  const lab = entry.value.lab;
  const value = lab && Number.isFinite(lab.value) ? String(lab.value) : '';
  return {
    clientId: entry.clientId,
    measuredOn: entry.value.measured_on,
    value,
    unit: lab?.unit.trim() ?? '',
    range: lab ? labRangeText(lab) : 'no range',
  };
}

function labUnitLine(entries: readonly DatedEntry[]): string {
  const units = new Set(entries.map(entry => entry.value.lab?.unit.trim() ?? ''));
  if (units.size !== 1) return 'Each result keeps the unit saved with it.';
  const unit = [...units][0] ?? '';
  return unit ? `Shown in ${unit}.` : 'No unit was saved with this result.';
}

function labGroups(entries: readonly DatedEntry[]): LabRangeGroupView[] {
  const buckets = new Map<LabRange, LabTableRow[]>();
  for (const entry of entries) {
    const id = labRange(entry.value.lab);
    const rows = buckets.get(id) ?? [];
    rows.push(labTableRow(entry));
    buckets.set(id, rows);
  }
  return RANGE_ORDER.flatMap(id => {
    const rows = buckets.get(id);
    return rows && rows.length > 0 ? [{ id, label: RANGE_GROUP_LABEL[id], rows }] : [];
  });
}

function checkupVisits(entries: readonly DatedEntry[]): CheckupVisitView[] {
  return entries.map(entry => ({
    clientId: entry.clientId,
    measuredOn: entry.value.measured_on,
    note: entry.value.note?.trim() ?? '',
  }));
}

function labFolders(entries: readonly DatedEntry[], units: HealthUnits): HealthFolderView[] {
  const groups: { title: string; entries: DatedEntry[] }[] = [];
  for (const entry of entries) {
    const title = entry.value.lab?.name || 'Lab';
    const existing = groups.find(group => group.title === title);
    if (existing) existing.entries.push(entry);
    else groups.push({ title, entries: [entry] });
  }
  return groups.map(group => {
    const rows = group.entries.map(entry => toRow(entry, units));
    return {
      title: group.title,
      latestLabel: rows[0]?.label ?? '',
      unitLine: labUnitLine(group.entries),
      sparkline: sparklineFor(group.entries, units, true),
      rows,
      groups: labGroups(group.entries),
    };
  });
}

/** One series per Clinic kind, read from the same records the room already holds. */
export function buildClinicSeries(entries: readonly DatedEntry[], units: HealthUnits): HealthSeriesView[] {
  const ordered = newestFirst(entries);
  return KIND_ORDER.flatMap(kind => {
    const matching = ordered.filter(entry => entry.value.kind === kind);
    if (matching.length === 0) return [];
    const rows = matching.map(entry => toRow(entry, units));
    const copy = SERIES_COPY[kind];
    return [{
      kind,
      title: copy.title,
      noun: copy.noun,
      latestLabel: rows[0]?.label ?? '',
      latestMeasuredOn: matching[0]?.value.measured_on ?? '',
      sparkline: kind === 'lab' ? EMPTY_SPARKLINE : sparklineFor(matching, units, kind !== 'checkup'),
      rows,
      folders: kind === 'lab' ? labFolders(matching, units) : [],
      visits: kind === 'checkup' ? checkupVisits(matching) : [],
    }];
  });
}

/** Slice each kind. A deep-linked row past the window stays reachable. */
export function pageClinicSeries(
  series: readonly HealthSeriesView[],
  shownByKind: Partial<Record<HealthStat['kind'], number>>,
  entryId: string | null,
): HealthSeriesPage[] {
  return series.map(item => {
    const requested = shownByKind[item.kind] ?? HEALTH_HISTORY_PAGE;
    const entryIndex = entryId ? item.rows.findIndex(row => row.clientId === entryId) : -1;
    const limit = Math.min(item.rows.length, Math.max(requested, entryIndex >= 0 ? entryIndex + 1 : 0));
    const visibleRows = item.rows.slice(0, limit);
    const visibleIds = new Set(visibleRows.map(row => row.clientId));
    const visibleFolders = item.folders.flatMap(folder => {
      const rows = folder.rows.filter(row => visibleIds.has(row.clientId));
      if (rows.length === 0) return [];
      const groups = folder.groups.flatMap(group => {
        const groupRows = group.rows.filter(row => visibleIds.has(row.clientId));
        return groupRows.length === 0 ? [] : [{ ...group, rows: groupRows }];
      });
      return [{ ...folder, rows, groups }];
    }).map((folder, index) => ({ ...folder, id: `health-lab-folder-${index}` }));
    return {
      ...item,
      shown: visibleRows.length,
      total: item.rows.length,
      more: visibleRows.length < item.rows.length,
      visibleRows,
      visibleFolders,
      visibleVisits: item.visits.filter(visit => visibleIds.has(visit.clientId)),
    };
  });
}
