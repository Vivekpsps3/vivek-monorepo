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
  town?: number | null;
  media?: number | null;
  trip?: number | null;
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

function countOrZero(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const invalid = Symbol('invalid');

/** GET /api/pixels. Null means the body is not a supported shape. */
export function decodePixelApiBody(value: unknown): PixelApiBody | null {
  const body = record(value);
  if (!body) return null;
  const from = requiredDate(body, 'from');
  const to = requiredDate(body, 'to');
  const days = pixelDays(body['days']);
  const sources = pixelSources(body['sources']);
  const first = requiredNullableDate(body, 'first_activity_on');
  const profile = pixelProfile(body);
  if (!from || !to || !days || !sources || first === undefined || profile === invalid) return null;
  const decoded: PixelApiBody = { from, to, days, sources, first_activity_on: first };
  if (profile !== undefined) decoded.profile = profile;
  return decoded;
}

/** Trip titles from GET /travel/api/home. Money and PTO fields are not read. */
export function decodeHomeTrips(value: unknown): TripSpan[] | null {
  const body = record(value);
  if (!body) return null;
  const current = tripList(body, 'in_progress');
  const upcoming = tripList(body, 'upcoming');
  const past = tripList(body, 'past');
  if (!current || !upcoming || !past) return null;
  return [...current, ...upcoming, ...past];
}

function pixelDays(value: unknown): PixelApiDay[] | null {
  if (!Array.isArray(value)) return null;
  const days: PixelApiDay[] = [];
  for (const entry of value) {
    const day = pixelDay(entry);
    if (!day) return null;
    days.push(day);
  }
  return days;
}

function pixelDay(value: unknown): PixelApiDay | null {
  const row = record(value);
  if (!row) return null;
  const date = isoDate(row['date']);
  if (!date) return null;
  const day: PixelApiDay = { date };
  for (const key of ['town', 'media', 'trip'] as const) {
    const count = optionalNullableNumber(row, key);
    if (count === invalid) return null;
    if (count !== undefined) day[key] = count;
  }
  return day;
}

function pixelSources(value: unknown): PixelSources | null {
  const row = record(value);
  if (!row) return null;
  const town = sourceStatus(row['town']);
  const media = sourceStatus(row['media']);
  const travel = sourceStatus(row['travel']);
  if (!town || !media || !travel) return null;
  return { town, media, travel };
}

function sourceStatus(value: unknown): PixelSources['town'] | null {
  if (value === 'ok' || value === 'absent' || value === 'unavailable') return value;
  return null;
}

function pixelProfile(body: Record<string, unknown>): PixelApiBody['profile'] | undefined | typeof invalid {
  if (!Object.hasOwn(body, 'profile')) return undefined;
  if (body['profile'] === null) return null;
  const row = record(body['profile']);
  if (!row) return invalid;
  const birthday = requiredNullableDate(row, 'birthday');
  if (birthday === undefined || typeof row['show_age'] !== 'boolean') return invalid;
  return { birthday, show_age: row['show_age'] };
}

function tripList(body: Record<string, unknown>, key: string): TripSpan[] | null {
  if (!Object.hasOwn(body, key)) return [];
  const value = body[key];
  if (!Array.isArray(value)) return null;
  const trips: TripSpan[] = [];
  for (const entry of value) {
    const trip = tripSpan(entry);
    if (!trip) return null;
    trips.push(trip);
  }
  return trips;
}

function tripSpan(value: unknown): TripSpan | null {
  const row = record(value);
  if (!row) return null;
  const id = requiredId(row, 'id');
  const title = typeof row['title'] === 'string' ? row['title'] : undefined;
  const start = isoDate(row['start_date']);
  const end = isoDate(row['end_date']);
  if (id === undefined || title === undefined || !start || !end) return null;
  return { id, title, start, end };
}

function record(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function requiredDate(source: Record<string, unknown>, key: string): string | undefined {
  return isoDate(source[key]);
}

function requiredNullableDate(source: Record<string, unknown>, key: string): string | null | undefined {
  if (!Object.hasOwn(source, key)) return undefined;
  const value = source[key];
  if (value === null) return null;
  return isoDate(value);
}

function requiredId(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key];
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined;
}

function optionalNullableNumber(
  source: Record<string, unknown>,
  key: string,
): number | null | undefined | typeof invalid {
  if (!Object.hasOwn(source, key)) return undefined;
  const value = source[key];
  if (value === null) return null;
  return typeof value === 'number' && Number.isFinite(value) ? value : invalid;
}

function isoDate(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const match = ISO_DATE.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return undefined;
  return value;
}
