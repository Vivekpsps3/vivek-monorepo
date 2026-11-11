import type { HubCardState } from '@vivek/ui';

export type { HubCardState };

export const HUB_SUMMARY_DEADLINE_MS = 8_000;
export const TRAVEL_SUMMARY_URL = '/travel/api/summary';
export const MEDIA_SUMMARY_URL = '/media/api/summary';
export const TOWN_SUMMARY_URL = '/api/town/summary';

/** Town "today" depends on the viewer's zone, like every other town read. */
export function townSummaryUrl(): string {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return `${TOWN_SUMMARY_URL}?tz=${encodeURIComponent(tz)}`;
}

export type HubFetch<T> =
  | { status: 'ok'; body: T }
  | { status: 'unavailable' | 'expired' | 'cancelled' };

export async function fetchHubSummary<T>(
  url: string,
  signal: AbortSignal,
  deadlineMs?: number,
): Promise<HubFetch<T>>;
export async function fetchHubSummary<T>(
  url: string,
  signal: AbortSignal,
  decode: (value: unknown) => T | null,
  deadlineMs?: number,
): Promise<HubFetch<T>>;
export async function fetchHubSummary<T>(
  url: string,
  signal: AbortSignal,
  decodeOrDeadline?: number | ((value: unknown) => T | null),
  deadlineMs = HUB_SUMMARY_DEADLINE_MS,
): Promise<HubFetch<T>> {
  const decode = typeof decodeOrDeadline === 'function' ? decodeOrDeadline : undefined;
  const deadline = typeof decodeOrDeadline === 'number' ? decodeOrDeadline : deadlineMs;
  if (signal.aborted) return { status: 'cancelled' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), deadline);
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
    const payload: unknown = await response.json();
    if (signal.aborted) return { status: 'cancelled' };
    // Search still calls this helper without a decoder. That dialog is outside this tranche.
    if (!decode) return { status: 'ok', body: payload as T };
    const body = decode(payload);
    if (signal.aborted) return { status: 'cancelled' };
    if (body == null) return { status: 'unavailable' };
    return { status: 'ok', body };
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
