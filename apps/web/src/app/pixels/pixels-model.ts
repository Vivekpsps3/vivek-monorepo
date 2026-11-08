import { dayLevel, dayScore, dominantApp, scoreParts, type DayChannels } from '@vivek/ui';
import type { HubCardState } from '@vivek/ui';
import { eachDate } from './pixels-dates';
import type {
  FinanceJoinStatus,
  PixelDayView,
  PixelSources,
  PixelsProfile,
  PixelsSnapshot,
  TripSpan,
} from './pixels.types';

export interface PixelApiDay {
  date: string;
  town?: number;
  media?: number;
  trip?: number;
}

export interface PixelApiBody {
  from: string;
  to: string;
  days: PixelApiDay[];
  sources: PixelSources;
  first_activity_on: string | null;
  profile?: { birthday: string | null; show_age: boolean } | null;
}

/** Ready with a boolean becomes 1 or 0. Every other status, and a null kept flag, is no-data. */
export function financeChannel(status: FinanceJoinStatus, kept: boolean | null | undefined): number | null {
  if (status !== 'ready') return null;
  if (typeof kept !== 'boolean') return null;
  return kept ? 1 : 0;
}

export function tripOn(date: string, trips: readonly TripSpan[]): TripSpan | null {
  let match: TripSpan | null = null;
  for (const trip of trips) {
    if (date < trip.start || date > trip.end) continue;
    if (match == null || trip.start > match.start) match = trip;
  }
  return match;
}

export function tripDayLabel(trip: TripSpan, date: string): string {
  const index = eachDate(trip.start, date).length;
  const total = eachDate(trip.start, trip.end).length;
  return `${trip.title}, day ${index} of ${total}`;
}

export function buildDay(date: string, channels: DayChannels, today: string, trips: readonly TripSpan[]): PixelDayView {
  const trip = tripOn(date, trips);
  const future = date > today;
  const score = dayScore(channels);
  return {
    date,
    channels,
    score,
    level: dayLevel(score),
    dominant: dominantApp(scoreParts(channels)),
    trip,
    future,
    planned: future && trip != null,
    today: date === today,
  };
}

export function composeSnapshot(input: {
  body: PixelApiBody;
  today: string;
  trips: readonly TripSpan[];
  financeStatus: FinanceJoinStatus;
  financeKept: ReadonlyMap<string, boolean | null>;
  fetchedAt: number;
  profile: PixelsProfile | null;
}): PixelsSnapshot {
  const counts = new Map(input.body.days.map(day => [day.date, day]));
  const days = eachDate(input.body.from, input.body.to).map(date => {
    const raw = counts.get(date);
    const channels: DayChannels = {
      town: countOrZero(raw?.town),
      media: countOrZero(raw?.media),
      trip: countOrZero(raw?.trip),
      fin: financeChannel(input.financeStatus, input.financeKept.get(date)),
    };
    return buildDay(date, channels, input.today, input.trips);
  });
  return {
    from: input.body.from,
    to: input.body.to,
    days,
    sources: input.body.sources,
    firstActivityOn: input.body.first_activity_on,
    profile: input.profile,
    financeStatus: input.financeStatus,
    trips: [...input.trips],
    fetchedAt: input.fetchedAt,
  };
}

/** Rebuild days without Finance. A stale Finance payload must not be reapplied after this. */
export function withoutFinance(snapshot: PixelsSnapshot, today: string): PixelsSnapshot {
  return {
    ...snapshot,
    financeStatus: 'locked',
    days: snapshot.days.map(day => buildDay(day.date, { ...day.channels, fin: null }, today, snapshot.trips)),
  };
}

export function yearStats(days: readonly PixelDayView[], financeStatus: FinanceJoinStatus): {
  active: number;
  longestRun: number;
  tripDays: number;
  budgetKept: number | null;
} {
  let active = 0;
  let longestRun = 0;
  let run = 0;
  let tripDays = 0;
  let budgetKept = 0;
  for (const day of days) {
    if (day.future) continue;
    if (day.score > 0) {
      active += 1;
      run += 1;
      longestRun = Math.max(longestRun, run);
    } else {
      run = 0;
    }
    if (day.channels.trip > 0) tripDays += 1;
    if (day.channels.fin === 1) budgetKept += 1;
  }
  return {
    active,
    longestRun,
    tripDays,
    budgetKept: financeStatus === 'ready' ? budgetKept : null,
  };
}

export function sourceNotices(sources: PixelSources): string[] {
  const notices: string[] = [];
  if (sources.town === 'unavailable') notices.push('Town data unavailable. Squares show Media and Travel.');
  if (sources.town === 'absent') notices.push('Town is not set up. Squares show Media and Travel.');
  if (sources.media === 'unavailable') notices.push('Media data unavailable. Squares show the other channels.');
  if (sources.media === 'absent') notices.push('Media is not available. Squares show the other channels.');
  if (sources.travel === 'unavailable') notices.push('Travel data unavailable. Squares show the other channels.');
  if (sources.travel === 'absent') notices.push('Travel is not available. Squares show the other channels.');
  return notices;
}

export function yearScreenState(snapshot: PixelsSnapshot | null, phase: HubCardState, _today: string): HubCardState {
  if (phase === 'loading' || phase === 'expired' || phase === 'unavailable') return phase;
  if (!snapshot) return phase === 'stale' ? 'stale' : 'loading';
  if (sourceNotices(snapshot.sources).length > 0) return phase === 'stale' ? 'stale' : 'ready';
  return phase === 'stale' ? 'stale' : 'ready';
}

function countOrZero(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}
