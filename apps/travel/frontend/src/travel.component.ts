import { NgTemplateOutlet } from "@angular/common";
import { Component, DestroyRef, Injector, afterNextRender, inject, signal } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { NavigationStart, Router, RouterLink, Scroll } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Subscription, filter, merge, take } from "rxjs";
import { formatDateRange, formatMoney, formatRelativeDay } from "@vivek/browser";
import { Home, PtoBoard, Trip, travelError } from "./travel.models";
import {
  PAST_PREVIEW,
  acceptListedLoad,
  cardNextAction,
  cardPlaces,
  cardPtoText,
  cardStatus,
  countdownText,
  isEmpty,
  localToday,
  pastSlice,
  totals,
} from "./trip-list.mjs";
import {
  ReturnContext,
  SESSION_CONTEXT,
  UiButtonComponent,
  UiCardComponent,
  UiPageHeaderComponent,
  UiEmptyStateComponent,
  UiBadgeComponent,
} from "@vivek/ui";

type HomeTrip = Trip & {
  days_until?: number | null;
  next_action?: string | null;
};

@Component({
  standalone: true,
  imports: [
    NgTemplateOutlet,
    RouterLink,
    UiButtonComponent,
    UiCardComponent,
    UiPageHeaderComponent,
    UiEmptyStateComponent,
    UiBadgeComponent,
  ],
  styleUrl: "./travel.component.css",
  template: `<main class="page travel-page">
    <ui-page-header title="Trips" [concealTitle]="true">
      @if (!data() || !isEmpty(data()!)) {
        <ui-button
          uiPageActions
          variant="primary"
          href="/travel/trips/new"
          label="New trip"
        />
      }
    </ui-page-header>
    @if (error()) {
      <p class="local-error" role="alert">{{ error() }}</p>
      <ui-button variant="ghost" (click)="load()">Retry trips</ui-button>
    }
    @if (data(); as home) {
      <section class="time-off" aria-label="Time off">
        <ui-card>
          @if (leaveError()) {
            <p class="local-error" role="alert">{{ leaveError() }}</p>
            <ui-button variant="ghost" (click)="loadLeave()">Retry time off</ui-button>
          } @else if (leaveLoading() && !leave()) {
            <p role="status">Loading time off…</p>
          } @else if (leave(); as board) {
            @if (!board.buckets.pto && !board.buckets.sick) {
              <p>PTO and Sick are not set up.</p>
              <a routerLink="/travel/pto">Set up PTO</a>
            } @else {
              @if (board.buckets.pto; as pto) {
                <p>
                  PTO balance today:
                  <strong
                    >{{ pto.balance_today_days }} days · {{ pto.balance_today_hours }} h</strong
                  >
                </p>
              }
              @if (board.buckets.sick; as sick) {
                <p>
                  Sick balance today:
                  <strong
                    >{{ sick.balance_today_days }} days · {{ sick.balance_today_hours }} h</strong
                  >
                </p>
              }
              @if (board.buckets.pto && home.next_pto) {
                <p>
                  Next trip {{ home.next_pto.title }} uses
                  {{ home.next_pto.days }} days · {{ home.next_pto.hours }} h.
                  {{ home.next_pto.balance_when_you_leave }} days ·
                  {{ home.next_pto.balance_when_you_leave_hours }} h before the trip,
                  {{ home.next_pto.leftover_after }} days ·
                  {{ home.next_pto.leftover_after_hours }} h after.
                </p>
              }
              @if (!board.buckets.pto) {
                <a routerLink="/travel/pto">Set up PTO</a>
              } @else if (!board.buckets.sick) {
                <a routerLink="/travel/pto">Set up Sick</a>
              }
              <a routerLink="/travel/pto">View forecast</a>
            }
          }
        </ui-card>
      </section>
      @if (home.attention.length) {
        <section>
          <h2>Needs a look</h2>
          @for (item of home.attention; track $index) {
            <p>
              <a [routerLink]="['/travel/trips', item.trip_id]" [state]="listReturn()">{{
                item.trip_title
              }}</a>
              · {{ item.text }}
            </p>
          }
        </section>
      }
      @for (group of groups(home); track group.title) {
        @if (group.trips.length) {
          <section [attr.aria-labelledby]="group.headingId">
            <h2 [id]="group.headingId">{{ group.title }}</h2>
            <div class="trip-grid">
              @for (trip of group.trips; track trip.id) {
                <ng-container
                  [ngTemplateOutlet]="postcard"
                  [ngTemplateOutletContext]="{ trip: trip }"
                />
              }
            </div>
          </section>
        }
      }
      @if (isEmpty(home)) {
        <ui-empty-state
          title="Your next trip can start with a flight"
          message="Enter a flight number and date, or type a destination and dates."
          icon="calendar"
        >
          <ui-button
            variant="primary"
            href="/travel/trips/new"
            label="Plan a trip"
          />
        </ui-empty-state>
      }
      @if (home.past.length) {
        <section aria-labelledby="past-heading">
          <h2 id="past-heading">Past</h2>
          <div class="trip-grid" id="past-grid">
            @for (trip of pastSlice(home.past, pastExpanded()); track trip.id) {
              <ng-container
                [ngTemplateOutlet]="postcard"
                [ngTemplateOutletContext]="{ trip: trip }"
              />
            }
          </div>
          @if (home.past.length > pastPreview) {
            <ui-button
              variant="ghost"
              size="sm"
              [ariaExpanded]="pastExpanded()"
              ariaControls="past-grid"
              (clicked)="pastExpanded.set(!pastExpanded())"
            >
              {{
                pastExpanded()
                  ? "Show fewer"
                  : "Show all " + home.past.length + " past trips"
              }}
            </ui-button>
          }
        </section>
      }
    } @else {
      @if (!error() && !listClosed()) {
        <p role="status">Loading trips…</p>
      }
    }
    <ng-template #postcard let-trip="trip">
      <a
        class="trip-card trip-postcard"
        [id]="'trip-card-' + trip.id"
        [routerLink]="['/travel/trips', trip.id]"
        [state]="listReturn()"
      >
        <span class="trip-postcard__scene" aria-hidden="true">
          <svg viewBox="0 0 320 88" focusable="false">
            <path d="M0 64h320" />
            <path d="M16 64V42h26v22M24 42V30h8v12" />
            <path d="M52 64V36h44v28" />
            <path d="M62 64V48h8v16M78 64V48h8v16" />
            <path d="M214 60h58l12 8H202z" />
            <path d="M8 74c18 5 34-5 52 0s34 5 52 0 34-5 52 0 34 5 52 0 34-5 52 0 18 4 44 0" />
          </svg>
        </span>
        @if (cardStatus(trip); as status) {
          <span class="trip-postcard__stamp">{{ status }}</span>
        }
        <span class="trip-postcard__body">
          <span class="trip-card-top">
            @if (chipText(trip); as chip) {
              <ui-badge [variant]="trip.phase === 'in_progress' ? 'success' : 'default'">{{
                chip
              }}</ui-badge>
            }
            @if (trip.pto.conflicts.length) {
              <ui-badge variant="warning">PTO overlaps</ui-badge>
            }
          </span>
          <h3>{{ trip.title }}</h3>
          <p class="trip-card-when">{{ formatDateRange(trip.start_date, trip.end_date) }}</p>
          <ul class="trip-card-places">
            @for (place of cardPlaces(trip); track place.kind + place.label) {
              <li>
                <span class="place-kind">{{ place.kindLabel }}</span>
                {{ place.label }}
              </li>
            } @empty {
              <li>No destination saved.</li>
            }
          </ul>
          @if (cardPtoText(trip)) {
            <p class="muted">{{ cardPtoText(trip) }}</p>
          }
          @if (totals(trip).length) {
            <p class="trip-card-cost num">{{ totalsText(trip) }}</p>
          }
          @if (cardNextAction(trip); as action) {
            <p class="trip-card-next">
              {{ action }} <span aria-hidden="true">→</span>
            </p>
          }
        </span>
      </a>
    </ng-template>
  </main>`,
})
export class TravelComponent {
  readonly formatDateRange = formatDateRange;
  readonly isEmpty = isEmpty;
  readonly totals = totals;
  readonly pastSlice = pastSlice;
  readonly cardPtoText = cardPtoText;
  readonly cardPlaces = cardPlaces;
  readonly cardStatus = cardStatus;
  readonly cardNextAction = cardNextAction;
  readonly pastPreview = PAST_PREVIEW;
  private readonly http = inject(HttpClient);
  private readonly destroy = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly router = inject(Router);
  private readonly context = inject(ReturnContext);
  private readonly session = inject(SESSION_CONTEXT, { optional: true });
  private readonly ownerId = this.session?.currentUser?.id;
  private restoredView = this.context.view("/travel");
  private homeEpoch = 0;
  private leaveEpoch = 0;
  private sessionActive = true;
  private homeRequest?: Subscription;
  private leaveRequest?: Subscription;
  readonly data = signal<Home | null>(null);
  readonly error = signal("");
  readonly leave = signal<PtoBoard | null>(null);
  readonly leaveError = signal("");
  readonly leaveLoading = signal(true);
  readonly pastExpanded = signal(false);
  readonly listClosed = signal(false);
  /** Browser-local calendar day (LA-day ruling, #113): never the UTC/server date. */
  readonly today = localToday();
  constructor() {
    if (this.session) {
      merge(
        this.session.cleared$,
        this.session.user$.pipe(filter((user) => user?.id !== this.ownerId)),
      )
        .pipe(take(1), takeUntilDestroyed())
        .subscribe(() => this.retireList());
    }
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationStart && event.navigationTrigger === "imperative") {
        const id = /^\/travel\/trips\/(\d+)(?:[/?#]|$)/.exec(event.url)?.[1] ?? null;
        if (id) this.context.saveView("/travel", id);
      }
      if (event instanceof Scroll) {
        this.restoredView = this.context.view("/travel");
        const home = this.data();
        if (home) this.restoreCardFocus(home);
      }
    });
    this.load();
  }
  listReturn(): Record<string, unknown> {
    return this.context.link("/travel");
  }
  load(): void {
    if (!this.sessionActive) return;
    const epoch = ++this.homeEpoch;
    this.error.set("");
    this.homeRequest?.unsubscribe();
    this.homeRequest = this.http
      .get<Home>("/travel/api/home")
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (d) => {
          if (!this.current(epoch, this.homeEpoch)) return;
          this.data.set(d);
          this.restoreCardFocus(d);
        },
        error: (e) => {
          if (!this.current(epoch, this.homeEpoch)) return;
          this.error.set(travelError(e));
        },
      });
    this.loadLeave();
  }
  loadLeave(): void {
    if (!this.sessionActive) return;
    const epoch = ++this.leaveEpoch;
    this.leaveError.set("");
    this.leaveLoading.set(true);
    this.leaveRequest?.unsubscribe();
    this.leaveRequest = this.http
      .get<PtoBoard>("/travel/api/pto")
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (d) => {
          if (!this.current(epoch, this.leaveEpoch)) return;
          this.leave.set(d);
          this.leaveLoading.set(false);
        },
        error: () => {
          if (!this.current(epoch, this.leaveEpoch)) return;
          this.leave.set(null);
          this.leaveLoading.set(false);
          this.leaveError.set("Couldn't load time off.");
        },
      });
  }
  private current(epoch: number, currentEpoch: number): boolean {
    return acceptListedLoad(epoch, currentEpoch, this.sessionActive);
  }
  private retireList(): void {
    this.sessionActive = false;
    this.homeEpoch += 1;
    this.leaveEpoch += 1;
    this.homeRequest?.unsubscribe();
    this.leaveRequest?.unsubscribe();
    this.data.set(null);
    this.leave.set(null);
    this.error.set("");
    this.leaveError.set("");
    this.listClosed.set(true);
  }
  private restoreCardFocus(home: Home): void {
    const focus = this.restoredView?.focus;
    if (!focus || !this.sessionActive) return;
    const shown = pastSlice(home.past, this.pastExpanded());
    if (
      home.past.some((trip) => String(trip.id) === focus) &&
      !shown.some((trip) => String(trip.id) === focus)
    ) {
      this.pastExpanded.set(true);
    }
    const top = this.restoredView?.top ?? 0;
    this.restoredView = null;
    afterNextRender(() => {
      if (this.destroy.destroyed || !this.sessionActive) return;
      document.getElementById("trip-card-" + focus)?.focus({ preventScroll: true });
      window.scrollTo({ top, left: 0, behavior: "instant" });
    }, { injector: this.injector });
  }
  groups(home: Home): {
    title: string;
    headingId: string;
    trips: HomeTrip[];
  }[] {
    return [
      { title: "Away now", headingId: "away-heading", trips: home.in_progress },
      { title: "Upcoming", headingId: "upcoming-heading", trips: home.upcoming },
    ];
  }
  chipText(trip: HomeTrip): string {
    return countdownText(trip, this.today) ?? formatRelativeDay(trip.start_date);
  }
  totalsText(trip: HomeTrip): string {
    return totals(trip)
      .map((total) => formatMoney(total.cents, { currency: total.currency }))
      .join(" · ");
  }
}
