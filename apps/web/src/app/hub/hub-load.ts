import type { HubCardState } from '@vivek/ui';

export type { HubCardState };

export const HUB_SUMMARY_DEADLINE_MS = 8_000;
export const TRAVEL_SUMMARY_URL = '/travel/api/summary';
export const MEDIA_SUMMARY_URL = '/media/api/summary';

export type HubFetch<T> =
  | { status: 'ok'; body: T }
  | { status: 'unavailable' | 'expired' | 'cancelled' };

export async function fetchHubSummary<T>(
  url: string,
  signal: AbortSignal,
  deadlineMs = HUB_SUMMARY_DEADLINE_MS,
): Promise<HubFetch<T>> {
  if (signal.aborted) return { status: 'cancelled' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), deadlineMs);
  const onAbort = () => ctrl.abort();
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    const response = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (signal.aborted) return { status: 'cancelled' };
    if (response.status === 401) return { status: 'expired' };
    if (!response.ok) return { status: 'unavailable' };
    return { status: 'ok', body: await response.json() as T };
  } catch {
    if (signal.aborted) return { status: 'cancelled' };
    return { status: 'unavailable' };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  }
}

/** Keep a previous snapshot when a refresh fails. A cancelled load must not publish. */
export function settleHubCard<T>(
  previous: T | null,
  result: HubFetch<T>,
  isEmpty: (body: T) => boolean,
): { state: Exclude<HubCardState, 'loading' | 'locked'>; data: T | null } | null {
  if (result.status === 'cancelled') return null;
  if (result.status === 'ok') {
    return { state: isEmpty(result.body) ? 'empty' : 'ready', data: result.body };
  }
  if (result.status === 'expired') return { state: 'expired', data: null };
  if (previous != null && !isEmpty(previous)) return { state: 'stale', data: previous };
  return { state: 'unavailable', data: null };
}
