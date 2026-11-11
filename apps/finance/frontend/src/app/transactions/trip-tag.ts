/** Matches Travel's recent-past preview (`PAST_PREVIEW` in trip-list.mjs). */
export const RECENT_PAST_TRIP_LIMIT = 6;

export const TRIP_LIST_UNAVAILABLE = "Couldn't load trips. You can save without a trip tag.";

export interface TripTagTrip {
  id: number;
  title: string;
}

export interface TripTagHome {
  in_progress?: TripTagTrip[] | null;
  upcoming?: TripTagTrip[] | null;
  past?: TripTagTrip[] | null;
}

export interface TripTagChoice {
  id: number | null;
  label: string;
  key: string;
}

/** Positive integer trip id, or null when the value cannot be a tag. */
export function normalizeTripId(value: unknown): number | null {
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) return null;
  return value;
}

function tripRows(rows: TripTagTrip[] | null | undefined): TripTagTrip[] {
  return Array.isArray(rows) ? rows : [];
}

/**
 * No trip, then current, upcoming, and the recent past, de-duplicated in that order.
 * A saved id outside the visible list stays as Earlier trip. A missing home list
 * still keeps that saved id so a failed load does not wipe it.
 */
export function tripTagChoices(home: TripTagHome | null, selected: unknown): TripTagChoice[] {
  const choices: TripTagChoice[] = [{ id: null, label: 'No trip', key: 'none' }];
  const seen = new Set<number>();
  const add = (trip: TripTagTrip) => {
    const id = normalizeTripId(trip?.id);
    if (id == null || seen.has(id)) return;
    const title = typeof trip?.title === 'string' ? trip.title.trim() : '';
    seen.add(id);
    choices.push({ id, label: title || `Trip ${id}`, key: String(id) });
  };
  if (home) {
    for (const trip of tripRows(home.in_progress)) add(trip);
    for (const trip of tripRows(home.upcoming)) add(trip);
    for (const trip of tripRows(home.past).slice(0, RECENT_PAST_TRIP_LIMIT)) add(trip);
  }
  const current = normalizeTripId(selected);
  if (current != null && !seen.has(current)) {
    choices.push({ id: current, label: 'Earlier trip', key: `earlier-${current}` });
  }
  return choices;
}
