import type { TownSummary } from './town-hub-card';

/**
 * Owned decoders for the three Hub summary payloads.
 * A null return is an unsupported shape. Null fields inside a success value
 * are real wire nulls and stay null.
 */

export interface TravelTrip {
  id: number;
  title: string;
  destination?: string | null;
  origin_label?: string | null;
  start_date: string;
  end_date: string;
  phase: string;
  days_until: number;
  next_action: string;
  href?: string | null;
}

export interface MediaItem {
  id: number;
  kind: string;
  title: string;
  creator?: string | null;
  status?: string | null;
  progress_label?: string | null;
  rating?: number | null;
  review_excerpt?: string | null;
  release_on?: string | null;
  precision?: string | null;
  when?: string | null;
}

export interface MediaNextEpisode {
  entry_id: number;
  episode_id: number | null;
  show_title: string;
  season: number;
  episode: number;
  title?: string | null;
  air_date?: string | null;
  state?: string | null;
}

export interface MediaSummary {
  currently: MediaItem[];
  recent_reviews: MediaItem[];
  upcoming: MediaItem[];
  next_episodes: MediaNextEpisode[];
}

export interface TravelReminder {
  id: number;
  title: string;
  due_at: string | null;
  done: boolean;
  kind: 'general' | 'parking' | 'flight' | 'packing';
  notes: string | null;
}

export interface TravelEvent {
  id: number;
  kind: 'trip_start' | 'trip_end' | 'transport' | 'reminder';
  date: string;
  time: string | null;
  tz: string | null;
  title: string;
  overdue: boolean;
  trip_id: number;
  trip_title: string;
  href: string;
  reminder: TravelReminder | null;
}

export interface TravelSummary {
  next_trip: TravelTrip | null;
  up_next: TravelEvent[];
}

export interface MediaCalendar {
  month?: string;
  days: { date: string; events: {
    type: string; title: string; entry_id: number | null; watched: boolean; release_status: string | null;
  }[] }[];
}

export interface MediaHubSummary extends MediaSummary {
  calendars: MediaCalendar[];
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function decodeTravelSummary(value: unknown): TravelSummary | null {
  const body = record(value);
  if (!body || !Object.hasOwn(body, 'next_trip')) return null;
  if (!Array.isArray(body['up_next'])) return null;
  const events = body['up_next'].map(travelEvent);
  if (events.some(row => row === null)) return null;
  const trip = body['next_trip'] === null ? null : travelTrip(body['next_trip']);
  if (body['next_trip'] !== null && trip === null) return null;
  return { next_trip: trip, up_next: events as TravelEvent[] };
}

function travelEvent(value: unknown): TravelEvent | null {
  const row = record(value);
  if (!row) return null;
  const id = requiredId(row, 'id');
  const tripId = requiredId(row, 'trip_id');
  const title = requiredString(row, 'title');
  const tripTitle = requiredString(row, 'trip_title');
  const date = requiredDate(row, 'date');
  const kind = row['kind'];
  const time = row['time'];
  const tz = row['tz'];
  if (id === undefined || tripId === undefined || title === undefined || tripTitle === undefined || !date
    || !['trip_start', 'trip_end', 'transport', 'reminder'].includes(String(kind))
    || (time !== null && (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)))
    || (tz !== null && typeof tz !== 'string') || typeof row['overdue'] !== 'boolean') return null;
  let reminder: TravelReminder | null = null;
  if (kind === 'reminder') {
    const item = record(row['reminder']);
    if (!item || requiredId(item, 'id') !== id || typeof item['title'] !== 'string'
      || typeof item['done'] !== 'boolean' || (item['notes'] !== null && typeof item['notes'] !== 'string')
      || !['general', 'parking', 'flight', 'packing'].includes(String(item['kind']))
      || (item['due_at'] !== null && (typeof item['due_at'] !== 'string'
        || !isoDate(item['due_at'].slice(0, 10)) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(item['due_at'])))) return null;
    reminder = { id, title: item['title'], due_at: item['due_at'] as string | null, done: item['done'],
      kind: item['kind'] as TravelReminder['kind'], notes: item['notes'] as string | null };
  } else if (row['reminder'] !== null) return null;
  return { id, trip_id: tripId, title, trip_title: tripTitle, date, kind: kind as TravelEvent['kind'],
    time: time as string | null, tz: tz as string | null, overdue: row['overdue'],
    href: `/travel/trips/${tripId}`, reminder };
}

/** Only exact dated saved events enter Up next; month/year/unknown bands stay in Media. */
export function decodeMediaCalendar(value: unknown): MediaCalendar | null {
  const body = record(value);
  if (!body || !Array.isArray(body['days'])) return null;
  const days: MediaCalendar['days'] = [];
  for (const value of body['days']) {
    const day = record(value);
    if (!day || !isoDate(day['date']) || !Array.isArray(day['events'])) return null;
    const events: MediaCalendar['days'][number]['events'] = [];
    for (const value of day['events']) {
      const event = record(value);
      if (!event || typeof event['type'] !== 'string' || typeof event['title'] !== 'string'
        || typeof event['watched'] !== 'boolean'
        || (event['entry_id'] !== null && requiredId(event, 'entry_id') === undefined)
        || (event['release_status'] !== null && typeof event['release_status'] !== 'string')) return null;
      events.push({ type: event['type'], title: event['title'], entry_id: event['entry_id'] as number | null,
        watched: event['watched'], release_status: event['release_status'] as string | null });
    }
    days.push({ date: day['date'] as string, events });
  }
  return { days };
}

export function decodeMediaSummary(value: unknown): MediaSummary | null {
  const body = record(value);
  if (!body) return null;
  const currently = items(body['currently']);
  const recent = items(body['recent_reviews']);
  const upcoming = items(body['upcoming']);
  const episodes = nextEpisodes(body['next_episodes']);
  if (!currently || !recent || !upcoming || !episodes) return null;
  return { currently, recent_reviews: recent, upcoming, next_episodes: episodes };
}

export function decodeTownSummary(value: unknown): TownSummary | null {
  const body = record(value);
  if (!body) return null;
  const name = requiredString(body, 'name');
  const founded = requiredNullableDate(body, 'founded_on');
  const level = requiredNumber(body, 'level');
  const xp = requiredNumber(body, 'xp');
  const levelStart = requiredNumber(body, 'level_xp_start');
  const nextXp = requiredNullableNumber(body, 'next_level_xp');
  const todayDone = requiredNumber(body, 'today_done');
  const todayTotal = requiredNumber(body, 'today_total');
  const streak = requiredNumber(body, 'longest_streak');
  const unit = streakUnit(body);
  if (
    name === undefined || founded === undefined || level === undefined || xp === undefined
    || levelStart === undefined || nextXp === undefined || todayDone === undefined
    || todayTotal === undefined || streak === undefined || unit === undefined
  ) return null;
  return {
    name,
    founded_on: founded,
    level,
    xp,
    level_xp_start: levelStart,
    next_level_xp: nextXp,
    today_done: todayDone,
    today_total: todayTotal,
    longest_streak: streak,
    longest_streak_unit: unit,
  };
}

function travelTrip(value: unknown): TravelTrip | null {
  const row = record(value);
  if (!row) return null;
  const id = requiredId(row, 'id');
  const title = requiredString(row, 'title');
  const destination = optionalNullableString(row, 'destination');
  const origin = optionalNullableString(row, 'origin_label');
  const start = requiredDate(row, 'start_date');
  const end = requiredDate(row, 'end_date');
  const phase = requiredString(row, 'phase');
  const daysUntil = requiredNumber(row, 'days_until');
  const nextAction = requiredString(row, 'next_action');
  const href = optionalNullableString(row, 'href');
  if (
    id === undefined || title === undefined || destination === invalid || origin === invalid
    || start === undefined || end === undefined || phase === undefined || daysUntil === undefined
    || nextAction === undefined || href === invalid
  ) return null;
  const trip: TravelTrip = {
    id,
    title,
    start_date: start,
    end_date: end,
    phase,
    days_until: daysUntil,
    next_action: nextAction,
  };
  if (destination !== undefined) trip.destination = destination;
  if (origin !== undefined) trip.origin_label = origin;
  if (href !== undefined) trip.href = href;
  return trip;
}

function items(value: unknown): MediaItem[] | null {
  if (!Array.isArray(value)) return null;
  const items: MediaItem[] = [];
  for (const entry of value) {
    const item = mediaItem(entry);
    if (!item) return null;
    items.push(item);
  }
  return items;
}

function mediaItem(value: unknown): MediaItem | null {
  const row = record(value);
  if (!row) return null;
  const id = requiredId(row, 'id');
  const kind = requiredString(row, 'kind');
  const title = requiredString(row, 'title');
  const creator = optionalNullableString(row, 'creator');
  const status = optionalNullableString(row, 'status');
  const progress = optionalNullableString(row, 'progress_label');
  const rating = optionalNullableNumber(row, 'rating');
  const excerpt = optionalNullableString(row, 'review_excerpt');
  const release = optionalNullableString(row, 'release_on');
  const precision = optionalNullableString(row, 'precision');
  const when = optionalNullableString(row, 'when');
  if (
    id === undefined || kind === undefined || title === undefined
    || creator === invalid || status === invalid || progress === invalid || rating === invalid
    || excerpt === invalid || release === invalid || precision === invalid || when === invalid
  ) return null;
  const item: MediaItem = { id, kind, title };
  if (creator !== undefined) item.creator = creator;
  if (status !== undefined) item.status = status;
  if (progress !== undefined) item.progress_label = progress;
  if (rating !== undefined) item.rating = rating;
  if (excerpt !== undefined) item.review_excerpt = excerpt;
  if (release !== undefined) item.release_on = release;
  if (precision !== undefined) item.precision = precision;
  if (when !== undefined) item.when = when;
  return item;
}

function nextEpisodes(value: unknown): MediaNextEpisode[] | null {
  if (!Array.isArray(value)) return null;
  const episodes: MediaNextEpisode[] = [];
  for (const entry of value) {
    const episode = nextEpisode(entry);
    if (!episode) return null;
    episodes.push(episode);
  }
  return episodes;
}

function nextEpisode(value: unknown): MediaNextEpisode | null {
  const row = record(value);
  if (!row) return null;
  const entryId = requiredId(row, 'entry_id');
  const episodeId = optionalNullableId(row, 'episode_id');
  const show = requiredString(row, 'show_title');
  const season = requiredNumber(row, 'season');
  const episode = requiredNumber(row, 'episode');
  const title = optionalNullableString(row, 'title');
  const airDate = optionalNullableString(row, 'air_date');
  const state = optionalNullableString(row, 'state');
  if (
    entryId === undefined || episodeId === invalid || show === undefined || season === undefined
    || episode === undefined || title === invalid || airDate === invalid || state === invalid
  ) return null;
  const rowEpisode: MediaNextEpisode = {
    entry_id: entryId,
    episode_id: episodeId ?? null,
    show_title: show,
    season,
    episode,
  };
  if (title !== undefined) rowEpisode.title = title;
  if (airDate !== undefined) rowEpisode.air_date = airDate;
  if (state !== undefined) rowEpisode.state = state;
  return rowEpisode;
}

function streakUnit(body: Record<string, unknown>): TownSummary['longest_streak_unit'] | undefined {
  if (!Object.hasOwn(body, 'longest_streak_unit')) return undefined;
  const value = body['longest_streak_unit'];
  if (value === null) return null;
  if (value === 'days' || value === 'weeks') return value;
  return undefined;
}

const invalid = Symbol('invalid');

function record(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function requiredString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' ? value : undefined;
}

function requiredNumber(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function requiredId(source: Record<string, unknown>, key: string): number | undefined {
  const value = requiredNumber(source, key);
  return value !== undefined && Number.isSafeInteger(value) ? value : undefined;
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

function requiredNullableNumber(source: Record<string, unknown>, key: string): number | null | undefined {
  if (!Object.hasOwn(source, key)) return undefined;
  const value = source[key];
  if (value === null) return null;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function optionalNullableString(
  source: Record<string, unknown>,
  key: string,
): string | null | undefined | typeof invalid {
  if (!Object.hasOwn(source, key)) return undefined;
  const value = source[key];
  if (value === null) return null;
  if (typeof value === 'string') return value;
  return invalid;
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

function optionalNullableId(
  source: Record<string, unknown>,
  key: string,
): number | null | undefined | typeof invalid {
  const value = optionalNullableNumber(source, key);
  if (value === invalid || value === undefined || value === null) return value;
  return Number.isSafeInteger(value) ? value : invalid;
}

/** Calendar date text, unchanged. Invalid dates are rejected rather than shifted. */
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
