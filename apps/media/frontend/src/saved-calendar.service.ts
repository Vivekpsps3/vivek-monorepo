import { DestroyRef, Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { browserTimeZone, isoDateInZone } from "@vivek/browser";
import { SESSION_CONTEXT } from "@vivek/ui";
import {
  EMPTY,
  Observable,
  catchError,
  filter,
  finalize,
  of,
  shareReplay,
  tap,
  throwError,
} from "rxjs";

export interface CalendarEvent {
  title: string;
  detail?: string | null;
  short?: string | null;
  because?: string | null;
  entry_id: number | null;
  on?: string | null;
  release_on: string | null;
  precision?: string;
  release_status?: string | null;
  watched?: boolean;
  type?: string;
}

export interface CalendarMonth {
  today: string;
  month: string;
  partial: boolean;
  unconfigured?: string[];
  days: { date: string; events: CalendarEvent[] }[];
  month_band: CalendarEvent[];
  year_band: CalendarEvent[];
  unknown: CalendarEvent[];
}

interface Slot {
  epoch: number;
  fresh: boolean;
  ownerId: number | null;
  payload: CalendarMonth | null;
  read$: Observable<CalendarMonth> | null;
  refresh$: Observable<CalendarMonth> | null;
}

/** YYYY-MM in the browser zone. The same key Now and Calendar use for one saved read. */
export function localMonth(now = new Date()): string {
  return isoDateInZone(now, browserTimeZone()).slice(0, 7);
}

/**
 * One saved calendar for Now and Calendar. A read is one GET. A refresh is one
 * POST. Opening both screens does not ask the provider twice.
 */
@Injectable({ providedIn: "root" })
export class SavedCalendar {
  private readonly http = inject(HttpClient);
  private readonly session = inject(SESSION_CONTEXT);
  private readonly slots = new Map<string, Slot>();
  private edits = 0;
  private seenOwner = this.session.currentUser?.id ?? null;

  constructor() {
    const destroy = inject(DestroyRef);
    this.session.cleared$.pipe(takeUntilDestroyed(destroy)).subscribe(() => this.drop());
    this.session.user$.pipe(takeUntilDestroyed(destroy)).subscribe((user) => {
      const next = user?.id ?? null;
      if (next === this.seenOwner) return;
      this.seenOwner = next;
      this.drop();
    });
  }

  read(month: string, force = false): Observable<CalendarMonth> {
    const slot = this.slot(month);
    const ownerId = this.ownerId();
    if (!force && slot.fresh && slot.payload && slot.ownerId === ownerId) {
      return of(slot.payload);
    }
    if (slot.read$) return slot.read$;
    const epoch = slot.epoch;
    const edits = this.edits;
    const flight = this.http
      .get<CalendarMonth>("/media/api/calendar", { params: this.params(month) })
      .pipe(
        tap((body) => this.keep(slot, epoch, ownerId, month, body, edits)),
        filter((body) => this.kept(slot, epoch, ownerId, body)),
        catchError((error: unknown) => this.lose(slot, epoch, ownerId, error)),
        finalize(() => {
          if (slot.read$ === flight) slot.read$ = null;
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    slot.read$ = flight;
    return flight;
  }

  refresh(month: string): Observable<CalendarMonth> {
    const slot = this.slot(month);
    if (slot.refresh$) return slot.refresh$;
    slot.epoch += 1;
    const epoch = slot.epoch;
    const ownerId = this.ownerId();
    const edits = this.edits;
    const flight = this.http
      .post<CalendarMonth>("/media/api/calendar/refresh", null, {
        params: this.params(month),
      })
      .pipe(
        tap((body) => this.keep(slot, epoch, ownerId, month, body, edits)),
        filter((body) => this.kept(slot, epoch, ownerId, body)),
        catchError((error: unknown) => this.lose(slot, epoch, ownerId, error)),
        finalize(() => {
          if (slot.refresh$ === flight) slot.refresh$ = null;
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    slot.refresh$ = flight;
    return flight;
  }

  /** The next open reads the database again. This does not call a provider. */
  forget(): void {
    this.edits += 1;
    for (const slot of this.slots.values()) slot.fresh = false;
  }

  private drop(): void {
    this.edits += 1;
    for (const slot of this.slots.values()) {
      slot.epoch += 1;
      slot.fresh = false;
      slot.payload = null;
      slot.ownerId = null;
    }
  }

  private slot(month: string): Slot {
    const key = `${this.ownerId() ?? "signed-out"}|${browserTimeZone()}|${month}`;
    let slot = this.slots.get(key);
    if (!slot) {
      slot = {
        epoch: 0,
        fresh: false,
        ownerId: this.ownerId(),
        payload: null,
        read$: null,
        refresh$: null,
      };
      this.slots.set(key, slot);
    }
    return slot;
  }

  private params(month: string): { month: string; tz: string } {
    return { month, tz: browserTimeZone() };
  }

  private ownerId(): number | null {
    return this.session.currentUser?.id ?? null;
  }

  private keep(
    slot: Slot,
    epoch: number,
    ownerId: number | null,
    month: string,
    body: CalendarMonth,
    edits: number,
  ): void {
    if (!this.same(slot, epoch, ownerId)) return;
    if (body?.month && body.month !== month) return;
    slot.payload = body;
    slot.ownerId = ownerId;
    slot.fresh = edits === this.edits;
  }

  private kept(slot: Slot, epoch: number, ownerId: number | null, body: CalendarMonth): boolean {
    return this.same(slot, epoch, ownerId) && slot.payload === body;
  }

  private lose(slot: Slot, epoch: number, ownerId: number | null, error: unknown) {
    if (!this.same(slot, epoch, ownerId)) return EMPTY;
    return throwError(() => error);
  }

  private same(slot: Slot, epoch: number, ownerId: number | null): boolean {
    return epoch === slot.epoch && ownerId === this.ownerId();
  }
}
