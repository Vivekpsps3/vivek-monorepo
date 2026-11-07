/**
 * Search recents (Bundle S): IDs only, never titles. Stored most recent
 * first, de-duplicated, capped at five, in localStorage.
 */
export interface SearchRecentRef {
  app: string;
  kind: string;
  id: number;
}

export const SEARCH_RECENT_KEY = 'suite-search-recent';
export const SEARCH_RECENT_MAX = 5;

export function readSearchRecents(): SearchRecentRef[] {
  try {
    const raw = localStorage.getItem(SEARCH_RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is SearchRecentRef =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as SearchRecentRef).app === 'string' &&
          typeof (item as SearchRecentRef).kind === 'string' &&
          Number.isInteger((item as SearchRecentRef).id),
      )
      .slice(0, SEARCH_RECENT_MAX);
  } catch {
    return [];
  }
}

export function writeSearchRecents(refs: readonly SearchRecentRef[]): void {
  try {
    localStorage.setItem(SEARCH_RECENT_KEY, JSON.stringify(refs.slice(0, SEARCH_RECENT_MAX)));
  } catch {
    /* private mode: recents are best-effort */
  }
}

export function recordSearchRecent(ref: SearchRecentRef): SearchRecentRef[] {
  const next = [
    ref,
    ...readSearchRecents().filter(
      item => !(item.app === ref.app && item.kind === ref.kind && item.id === ref.id),
    ),
  ].slice(0, SEARCH_RECENT_MAX);
  writeSearchRecents(next);
  return next;
}

/** Drop refs the server no longer resolves; refs never sent are kept. */
export function pruneSearchRecents(
  sent: readonly SearchRecentRef[],
  resolved: readonly SearchRecentRef[],
): SearchRecentRef[] {
  const resolvedKeys = new Set(resolved.map(ref => `${ref.app}:${ref.kind}:${ref.id}`));
  const sentKeys = new Set(sent.map(ref => `${ref.app}:${ref.kind}:${ref.id}`));
  const next = readSearchRecents().filter(ref => {
    const key = `${ref.app}:${ref.kind}:${ref.id}`;
    return !sentKeys.has(key) || resolvedKeys.has(key);
  });
  writeSearchRecents(next);
  return next;
}

export function recentRefsParam(refs: readonly SearchRecentRef[]): string {
  return refs.map(ref => `${ref.app}:${ref.kind}:${ref.id}`).join(',');
}
