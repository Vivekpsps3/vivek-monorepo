import { DestroyRef, Injectable, Injector, InjectionToken, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Subject, firstValueFrom } from 'rxjs';
import { silentErrorToast } from '@vivek/ui';
import {
  bindLockNotices,
  bindLockSnapshots,
  financeVaultPresent,
  loadFinanceBudgetKeptDays,
  type BudgetKeptDaysResult,
} from '../../../../finance/frontend/src/public-api';
import { inclusiveWindows } from './pixels-dates';
import { composeSnapshot, withoutFinance, type PixelApiBody } from './pixels-model';
import type { FinanceJoinStatus, PixelsLoadRequest, PixelsLoadResult, PixelsSnapshot, TripSpan } from './pixels.types';

/** Inclusive days allowed by GET /api/pixels when profile=1. (end - start).days <= 36525. */
export const PIXELS_PROFILE_MAX_INCLUSIVE = 36526;
/** Inclusive days allowed by GET /api/pixels without a profile. */
export const PIXELS_PLAIN_MAX_INCLUSIVE = 401;
/** Inclusive days accepted by loadFinanceBudgetKeptDays. */
export const FINANCE_MAX_INCLUSIVE = 3640;

export type FinanceDaysLoader = (
  injector: Injector,
  signal: AbortSignal,
  opts: { from: string; to: string; deadlineMs?: number },
) => Promise<BudgetKeptDaysResult>;

export const PIXELS_FINANCE_DAYS = new InjectionToken<FinanceDaysLoader>('PIXELS_FINANCE_DAYS', {
  factory: () => loadFinanceBudgetKeptDays,
});

export const PIXELS_VAULT_PRESENT = new InjectionToken<() => boolean>('PIXELS_VAULT_PRESENT', {
  factory: () => financeVaultPresent,
});

interface HomeTrip {
  id: number;
  title: string;
  start_date: string;
  end_date: string;
}

@Injectable({ providedIn: 'root' })
export class PixelsDataService {
  private readonly http = inject(HttpClient);
  private readonly injector = inject(Injector);
  private readonly financeDays = inject(PIXELS_FINANCE_DAYS);
  private readonly vaultPresent = inject(PIXELS_VAULT_PRESENT);
  private generation = 0;
  private userId: number | null = null;
  readonly financeCleared$ = new Subject<void>();
  readonly userChanged$ = new Subject<void>();

  constructor() {
    const destroy = inject(DestroyRef);
    destroy.onDestroy(bindLockSnapshots(() => this.dropFinance()));
    destroy.onDestroy(bindLockNotices(() => this.dropFinance()));
  }

  noteUser(userId: number | null): void {
    const previous = this.userId;
    this.userId = userId;
    if (previous != null && previous !== userId) {
      this.dropFinance();
      this.userChanged$.next();
    }
  }

  /** Forget Finance values. A load already in flight cannot publish them afterwards. */
  dropFinance(): void {
    this.generation += 1;
    this.financeCleared$.next();
  }

  /** Leave /pixels. Finance from this visit is gone. */
  release(): void {
    this.dropFinance();
  }

  async load(request: PixelsLoadRequest): Promise<PixelsLoadResult> {
    const generation = this.generation;
    const pixels = await this.fetchPixels(request);
    if (generation !== this.generation) return { status: 'dropped' };
    if (pixels.status !== 'ready') return pixels;
    const trips = request.includeTrips ? await this.fetchTrips() : [];
    if (generation !== this.generation) return { status: 'dropped' };
    const finance = await this.joinFinance(request, generation);
    if (finance.status === 'dropped') return finance;
    const snapshot = composeSnapshot({
      body: pixels.body,
      today: request.today,
      trips,
      financeStatus: finance.financeStatus,
      financeKept: finance.kept,
      fetchedAt: Date.now(),
      profile: request.profile ? readProfile(pixels.body) : null,
    });
    if (generation !== this.generation) return { status: 'dropped' };
    return { status: 'ready', snapshot: this.vaultPresent() ? snapshot : withoutFinance(snapshot, request.today) };
  }

  private async joinFinance(
    request: PixelsLoadRequest,
    generation: number,
  ): Promise<{ status: 'ok'; financeStatus: FinanceJoinStatus; kept: Map<string, boolean | null> } | { status: 'dropped' }> {
    if (!this.vaultPresent()) return { status: 'ok', financeStatus: 'locked', kept: new Map() };
    const kept = new Map<string, boolean | null>();
    const financeStatus: FinanceJoinStatus = 'ready';
    const windows = inclusiveWindows(request.from, request.to, FINANCE_MAX_INCLUSIVE);
    for (const window of windows) {
      if (generation !== this.generation || !this.vaultPresent()) return { status: 'dropped' };
      const ctrl = new AbortController();
      let result: BudgetKeptDaysResult;
      try {
        result = await this.financeDays(this.injector, ctrl.signal, window);
      } catch {
        result = { status: 'unavailable' };
      }
      if (generation !== this.generation || !this.vaultPresent()) return { status: 'dropped' };
      if (result.status !== 'ready') return { status: 'ok', financeStatus: result.status, kept: new Map() };
      for (const day of result.days) kept.set(day.date, day.kept);
    }
    return { status: 'ok', financeStatus, kept };
  }

  private async fetchPixels(
    request: PixelsLoadRequest,
  ): Promise<{ status: 'ready'; body: PixelApiBody } | { status: 'expired' } | { status: 'unavailable' }> {
    const max = request.profile ? PIXELS_PROFILE_MAX_INCLUSIVE : PIXELS_PLAIN_MAX_INCLUSIVE;
    const windows = inclusiveWindows(request.from, request.to, max);
    const bodies: PixelApiBody[] = [];
    for (const window of windows) {
      const params: Record<string, string> = { from: window.from, to: window.to };
      if (request.profile) params['profile'] = '1';
      const result = await this.getJson<PixelApiBody>('/api/pixels', params);
      if (result.status === 'expired' || result.status === 'unavailable') return result;
      bodies.push(result.body);
    }
    return { status: 'ready', body: mergeBodies(bodies, request) };
  }

  private async fetchTrips(): Promise<TripSpan[]> {
    const result = await this.getJson<{ in_progress?: HomeTrip[]; upcoming?: HomeTrip[]; past?: HomeTrip[] }>('/travel/api/home');
    if (result.status !== 'ready') return [];
    const rows = [...(result.body.in_progress ?? []), ...(result.body.upcoming ?? []), ...(result.body.past ?? [])];
    return rows
      .filter(row => typeof row.id === 'number' && typeof row.title === 'string' && typeof row.start_date === 'string' && typeof row.end_date === 'string')
      .map(row => ({ id: row.id, title: row.title, start: row.start_date.slice(0, 10), end: row.end_date.slice(0, 10) }));
  }

  private async getJson<T>(url: string, params?: Record<string, string>): Promise<{ status: 'ready'; body: T } | { status: 'expired' } | { status: 'unavailable' }> {
    try {
      const body = await firstValueFrom(this.http.get<T>(url, { params, context: silentErrorToast() }));
      return { status: 'ready', body };
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 401) return { status: 'expired' };
      return { status: 'unavailable' };
    }
  }

}

function readProfile(body: PixelApiBody): { birthday: string | null; showAge: boolean } {
  return {
    birthday: body.profile?.birthday ?? null,
    showAge: body.profile?.show_age === true,
  };
}

function mergeBodies(bodies: PixelApiBody[], request: PixelsLoadRequest): PixelApiBody {
  const first = bodies[0];
  const last = bodies[bodies.length - 1];
  if (!first || !last) {
    return {
      from: request.from,
      to: request.to,
      days: [],
      sources: { town: 'unavailable', media: 'unavailable', travel: 'unavailable' },
      first_activity_on: null,
    };
  }
  const days = bodies.flatMap(body => body.days);
  const profile = bodies.find(body => body.profile)?.profile ?? null;
  return {
    from: request.from,
    to: request.to,
    days,
    sources: first.sources,
    first_activity_on: bodies.map(body => body.first_activity_on).filter((value): value is string => value != null).sort()[0] ?? null,
    profile,
  };
}

export function clearFinanceView(snapshot: PixelsSnapshot, today: string): PixelsSnapshot {
  return withoutFinance(snapshot, today);
}
