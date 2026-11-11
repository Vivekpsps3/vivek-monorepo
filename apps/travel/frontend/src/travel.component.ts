import { Component, DestroyRef, inject, signal } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { RouterLink } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { formatDateRange, formatMoney, formatRelativeDay } from "@vivek/browser";
import { Home, PtoBoard, Trip, travelError } from "./travel.models";
import {
  PAST_PREVIEW,
  cardPtoText,
  countdownText,
  isEmpty,
  localToday,
  pastSlice,
  totals,
} from "./trip-list.mjs";
import {
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
              <a [routerLink]="['/travel/trips', item.trip_id]">{{
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
                <a class="trip-card surface" [routerLink]="['/travel/trips', trip.id]">
                  <div class="trip-card-top">
                    <ui-badge
                      [variant]="
                        trip.phase === 'in_progress' ? 'success' : 'default'
                      "
                      >{{ chipText(trip) }}</ui-badge
                    >
                    @if (trip.pto.conflicts.length) {
                      <ui-badge variant="warning">PTO overlaps</ui-badge>
                    }
                  </div>
                  <h3>{{ trip.title }}</h3>
                  <p class="trip-card-when">
                    {{ formatDateRange(trip.start_date, trip.end_date) }}
                  </p>
                  <p class="muted">
                    {{ trip.cities.join(" → ")
                    }}{{ trip.cities.length ? " · " : "" }}{{ cardPtoText(trip) }}
                  </p>
                  @if (totals(trip).length) {
                    <p class="trip-card-cost num">{{ totalsText(trip) }}</p>
                  }
                  @if (trip.next_action) {
                    <p class="trip-card-next">
                      {{ trip.next_action }} <span aria-hidden="true">→</span>
                    </p>
                  }
                </a>
              }
            </div>
          </section>
        }
      }
      @if (isEmpty(home)) {
        <ui-empty-state
          title="Your next trip starts with a date"
          message="Add a destination and dates. Flights, bookings, and plans can follow."
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
              <a class="trip-card surface" [routerLink]="['/travel/trips', trip.id]">
                <h3>{{ trip.title }}</h3>
                <p class="trip-card-when">
                  {{ formatDateRange(trip.start_date, trip.end_date) }}
                </p>
                <p class="muted">{{ trip.cities.join(" → ") }}</p>
              </a>
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
      @if (!error()) {
        <p role="status">Loading trips…</p>
      }
    }
  </main>`,
})
export class TravelComponent {
  readonly formatDateRange = formatDateRange;
  readonly isEmpty = isEmpty;
  readonly totals = totals;
  readonly pastSlice = pastSlice;
  readonly cardPtoText = cardPtoText;
  readonly pastPreview = PAST_PREVIEW;
  private readonly http = inject(HttpClient);
  private readonly destroy = inject(DestroyRef);
  readonly data = signal<Home | null>(null);
  readonly error = signal("");
  readonly leave = signal<PtoBoard | null>(null);
  readonly leaveError = signal("");
  readonly leaveLoading = signal(true);
  readonly pastExpanded = signal(false);
  /** Browser-local calendar day (LA-day ruling, #113): never the UTC/server date. */
  readonly today = localToday();
  constructor() {
    this.load();
  }
  load(): void {
    this.error.set("");
    this.http
      .get<Home>("/travel/api/home")
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (d) => this.data.set(d),
        error: (e) => this.error.set(travelError(e)),
      });
    this.loadLeave();
  }
  loadLeave(): void {
    this.leaveError.set("");
    this.leaveLoading.set(true);
    this.http
      .get<PtoBoard>("/travel/api/pto")
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (d) => {
          this.leave.set(d);
          this.leaveLoading.set(false);
        },
        error: () => {
          this.leave.set(null);
          this.leaveLoading.set(false);
          this.leaveError.set("Couldn't load time off.");
        },
      });
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
