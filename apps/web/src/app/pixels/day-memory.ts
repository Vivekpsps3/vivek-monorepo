import { tripDayLabel } from './pixels-model';
import type {
  DayFactsStatus,
  FactKind,
  FinanceJoinStatus,
  PixelDayFacts,
  PixelDayView,
  PixelFact,
  SourceCoverage,
} from './pixels.types';

/** Honest source slot. A failed join is unavailable, never a factual empty. */
export type SlotState = 'loading' | 'empty' | 'absent' | 'expired' | 'unavailable' | 'locked' | 'ready';

export interface MemoryRecord {
  id: string;
  date: string;
  label: string;
  detail: string | null;
  provenance: string | null;
  href: string | null;
  action: string;
}

export interface MemorySlot {
  id: string;
  label: string;
  state: SlotState;
  text: string;
  coverage: string | null;
  preview: string | null;
  records: MemoryRecord[];
}

export interface DayMemory {
  slots: MemorySlot[];
  recap: string;
}

const SOURCE_LABEL = {
  town: 'Town',
  media: 'Media',
  travel: 'Travel',
  concepts: 'Learning annotations',
} as const;

export function financeReading(status: FinanceJoinStatus, fin: number | null): { state: SlotState; text: string } {
  switch (status) {
    case 'locked':
      return { state: 'locked', text: 'Finance is locked. Unlock to include budget kept.' };
    case 'expired':
      return { state: 'expired', text: 'Finance session expired. Sign in again to include budget kept.' };
    case 'unavailable':
    case 'cancelled':
      return { state: 'unavailable', text: 'Finance is unavailable.' };
    case 'no_plan':
      return { state: 'absent', text: 'Finance has no budget plan.' };
    case 'no_data':
      return { state: 'empty', text: 'Finance has no budget activity in this range.' };
    case 'ready':
      if (fin === 1) return { state: 'ready', text: 'Finance · budget kept' };
      if (fin === 0) return { state: 'ready', text: 'Finance · over budget pace' };
      return { state: 'empty', text: 'Finance · the budget is not in this day.' };
  }
}

/** Short year-stat label. Failures stay distinct from an empty plan. */
export function financeStatLabel(status: FinanceJoinStatus): string {
  const reading = financeReading(status, null);
  if (reading.state === 'unavailable') return 'unavailable';
  if (reading.state === 'expired') return 'expired';
  if (reading.state === 'absent') return 'no plan';
  if (reading.state === 'empty') return 'none';
  if (reading.state === 'locked') return 'locked';
  return '';
}

export function weekFinanceText(status: FinanceJoinStatus, known: boolean, kept: number): string {
  if (status !== 'ready') return financeReading(status, null).text;
  if (!known) return 'Finance · not recorded this week.';
  const noun = kept === 1 ? 'day' : 'days';
  return `Finance · ${kept} ${noun} kept`;
}

export function buildDayMemory(input: {
  day: PixelDayView;
  financeStatus: FinanceJoinStatus;
  facts: PixelDayFacts | null;
  factsStatus: DayFactsStatus;
}): DayMemory {
  const facts = input.factsStatus === 'ready' ? input.facts : null;
  const coverage = facts?.coverage ?? null;
  return {
    slots: [
      factSlot('town', 'Town', 'checkin', input.factsStatus, coverage?.town ?? null, facts),
      factSlot('media', 'Media', 'episode', input.factsStatus, coverage?.media ?? null, facts),
      travelSlot(input.day, input.factsStatus, coverage?.travel ?? null, facts),
      financeSlot(input.financeStatus, input.day.channels.fin),
      connectorSlot('photos', 'Photos'),
      connectorSlot('notes', 'Notes'),
    ],
    recap: recapText(input.day.date, input.factsStatus, facts),
  };
}

function financeSlot(status: FinanceJoinStatus, fin: number | null): MemorySlot {
  const reading = financeReading(status, fin);
  return {
    id: 'finance',
    label: 'Finance',
    state: reading.state,
    text: reading.text,
    coverage: null,
    preview: null,
    records: [],
  };
}

function connectorSlot(id: string, label: string): MemorySlot {
  return {
    id,
    label,
    state: 'absent',
    text: `${label} are not connected.`,
    coverage: null,
    preview: null,
    records: [],
  };
}

function factSlot(
  id: string,
  label: string,
  kind: FactKind,
  status: DayFactsStatus,
  coverage: SourceCoverage | null,
  facts: PixelDayFacts | null,
): MemorySlot {
  const state = sourceState(status, coverage);
  const records = state === 'ready' && facts ? facts.facts.filter(fact => fact.kind === kind).map(recordFrom) : [];
  return {
    id,
    label,
    state: state === 'ready' && records.length === 0 ? 'empty' : state,
    text: slotText(label, state, records.length, coverage),
    coverage: coverage ? coverageLine(label, coverage) : null,
    preview: null,
    records,
  };
}

function travelSlot(
  day: PixelDayView,
  status: DayFactsStatus,
  coverage: SourceCoverage | null,
  facts: PixelDayFacts | null,
): MemorySlot {
  const slot = factSlot('travel', 'Travel', 'trip_span', status, coverage, facts);
  const trip = day.trip;
  if (!trip) return slot;
  // A failed or unconfigured travel read must not repeat the score snapshot as a saved fact.
  const label = tripDayLabel(trip, day.date);
  if (slot.state === 'unavailable' || slot.state === 'absent' || slot.state === 'expired') return slot;
  const matched = slot.records.some(record => record.href === `/travel/trips/${trip.id}` || record.label.includes(trip.title));
  if (matched) {
    slot.records = slot.records.map(record => (
      record.href === `/travel/trips/${trip.id}` || record.label.includes(trip.title)
        ? { ...record, detail: joinDetail(label, record.detail) }
        : record
    ));
    return slot;
  }
  if (slot.state === 'loading') {
    slot.preview = label;
    return slot;
  }
  return slot;
}

function sourceState(status: DayFactsStatus, coverage: SourceCoverage | null): SlotState {
  if (status === 'idle' || status === 'loading') return 'loading';
  if (status === 'expired') return 'expired';
  if (status === 'unavailable') return 'unavailable';
  if (!coverage || coverage.status === 'unavailable') return 'unavailable';
  if (coverage.status === 'absent') return 'absent';
  return 'ready';
}

function slotText(label: string, state: SlotState, count: number, coverage: SourceCoverage | null): string {
  if (state === 'loading') return `${label} records are still loading.`;
  if (state === 'expired') return `Sign in again to load ${label} records. The score is unchanged.`;
  if (state === 'unavailable') return `${label} records are unavailable. The score is unchanged.`;
  if (state === 'absent') return `${label} is not set up.`;
  if (count === 0) return `Nothing recorded for ${label} on this day.`;
  return coverage ? coverageLine(label, coverage) : `${label} records on this day.`;
}

function coverageLine(label: string, coverage: SourceCoverage): string {
  if (coverage.status === 'absent') return `${label} is not set up.`;
  if (coverage.status !== 'ok') return `${label} is unavailable.`;
  const suffix = coverage.truncated ? ', truncated' : '';
  return `${label}: ${coverage.included} of ${coverage.total}${suffix}.`;
}

function recordFrom(fact: PixelFact): MemoryRecord {
  const label = recordLabel(fact);
  const span = fact.spanStart && fact.spanEnd ? `Span ${fact.spanStart} to ${fact.spanEnd}` : null;
  return {
    id: fact.id,
    date: fact.date,
    label,
    detail: span,
    provenance: fact.provenance,
    href: fact.route,
    action: `Open ${label}`,
  };
}

function recordLabel(fact: PixelFact): string {
  const kind = fact.kind === 'checkin' ? 'Town check-in' : fact.kind === 'episode' ? 'Watched episode' : 'Trip span';
  return fact.title ? `${kind} · ${fact.title}` : kind;
}

function joinDetail(dayLabel: string, span: string | null): string {
  return span ? `${dayLabel}. ${span}` : dayLabel;
}

function recapText(date: string, status: DayFactsStatus, facts: PixelDayFacts | null): string {
  if (status === 'idle' || status === 'loading') return `Loading the recap for ${date}.`;
  if (status === 'expired') return `Sign in again to recap ${date}. The score is unchanged.`;
  if (status !== 'ready' || !facts) return `The recap for ${date} is unavailable. The score is unchanged.`;
  const names = facts.facts.map(fact => fact.title).filter((title): title is string => !!title);
  const learned = facts.annotations.map(note => note.name);
  const parts: string[] = [];
  if (names.length === 0 && learned.length === 0) parts.push(`No saved records on ${date}.`);
  if (names.length > 0) parts.push(`Saved records on ${date}: ${names.join(', ')}.`);
  if (learned.length > 0) parts.push(`Learning: ${learned.join(', ')}.`);
  for (const key of ['town', 'media', 'travel', 'concepts'] as const) {
    parts.push(coverageLine(SOURCE_LABEL[key], facts.coverage[key]));
  }
  parts.push('Weekly review is not available.');
  return parts.join(' ');
}
