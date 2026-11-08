import { CHUNK_W } from '../engine/constants';

const DAY_MS = 86_400_000;
/** Weeks before the newest Monday. Inclusive span is one more (26). */
const WEEKS_BEFORE = 25;
const PAGE_CHUNKS = 4;

/** UTC calendar shift. `iso` is YYYY-MM-DD; the clock never leaves UTC. */
export function addIsoDays(iso: string, days: number): string {
  const utc = Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return new Date(utc + days * DAY_MS).toISOString().slice(0, 10);
}

/** ISO Monday (UTC) of the week that contains `iso`. */
export function isoMonday(iso: string): string {
  const utc = Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  const weekday = new Date(utc).getUTCDay();
  return new Date(utc - ((weekday + 6) % 7) * DAY_MS).toISOString().slice(0, 10);
}

export function initialRange(currentWeek: string, startWeek: string): { from: string; to: string } {
  const to = currentWeek;
  const unclamped = addIsoDays(to, -WEEKS_BEFORE * 7);
  const from = unclamped < startWeek ? startWeek : unclamped;
  return { from, to };
}

export function nextOlderRange(
  oldestLoaded: string,
  startWeek: string,
): { from: string; to: string } | null {
  if (oldestLoaded <= startWeek) return null;
  const to = addIsoDays(oldestLoaded, -7);
  const unclamped = addIsoDays(to, -WEEKS_BEFORE * 7);
  const from = unclamped < startWeek ? startWeek : unclamped;
  return { from, to };
}

/** True when the camera's left edge is within four chunks of the oldest loaded week. */
export function shouldPage(cameraX: number, oldestOriginTile: number): boolean {
  return cameraX - oldestOriginTile <= PAGE_CHUNKS * CHUNK_W;
}

/** Guard: a page may start only when nothing else is in flight. */
export function oneInFlight(inFlight: boolean): boolean {
  return !inFlight;
}

/** Weeks inserted before the previous oldest week. Zero when the strip did not grow backward. */
export function prependedWeekCount(before: readonly string[], after: readonly string[]): number {
  if (before.length === 0) return 0;
  const index = after.indexOf(before[0]);
  return index > 0 ? index : 0;
}
