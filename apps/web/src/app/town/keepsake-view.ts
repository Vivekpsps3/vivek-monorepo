import { ARTIFACT } from '../world/engine/constants';
import { biomeFor } from '../world/engine/normalize';
import type { MediaKeepsake, TripKeepsake } from './keepsake.types';

export const SHELF_PREVIEW = 3;

export function artifactLabel(kind: MediaKeepsake['kind'] | string): string {
  if (kind === 'book' || kind === 'movie' || kind === 'tv' || kind === 'game') return ARTIFACT[kind];
  return kind;
}

export function sceneryFor(item: TripKeepsake): { biome: string; text: string } {
  const biome = biomeFor({
    id: item.trip_id,
    start: item.span_start,
    end: item.span_end,
    place: item.place,
  });
  return { biome, text: `${item.scenery} The illustrative scenery is ${biome}.` };
}

export function matchesFind(title: string, draft: string): boolean {
  const needle = draft.trim().toLowerCase();
  if (!needle) return true;
  return title.toLowerCase().includes(needle);
}

export function shownRows<T extends { title: string }>(
  rows: readonly T[],
  draft: string,
  expanded: boolean,
): { shown: T[]; hidden: number; matched: number } {
  const matchedRows = rows.filter(row => matchesFind(row.title, draft));
  const shown = expanded ? matchedRows : matchedRows.slice(0, SHELF_PREVIEW);
  return { shown, hidden: matchedRows.length - shown.length, matched: matchedRows.length };
}
