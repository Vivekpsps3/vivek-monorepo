import { Component, DestroyRef, inject, signal } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { RouterLink } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { showRange } from "./display";
import { Home, Trip, travelError } from "./travel.models";
import {
  UiButtonComponent,
  UiCardComponent,
  UiPageHeaderComponent,
  UiEmptyStateComponent,
  UiBadgeComponent,
} from "@vivek/ui";
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
  template: `<main class="page travel-page">
    <ui-page-header
      eyebrow="Your time away"
      title="Trips"
      subtitle="A little space for where you're going next."
    >
      <ui-button
        uiPageActions
        variant="primary"
        href="/travel/trips/new"
        label="New trip"
      />
    </ui-page-header>
    @if (error()) {
      <p class="local-error" role="alert">{{ error() }}</p>
      <ui-button variant="ghost" (click)="load()">Retry trips</ui-button>
    }
    @if (data(); as home) {
      @if (home.pto.configured) {
        <ui-card>
          PTO balance today:
          <strong>{{ home.pto.balance_today }} days</strong> ·
          <a routerLink="/travel/pto">View forecast</a>
        </ui-card>
      }
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
          <section>
            <h2>{{ group.title }}</h2>
            <div class="trip-grid">
              @for (trip of group.trips; track trip.id) {
                <a class="trip-card" [routerLink]="['/travel/trips', trip.id]">
                  <ui-card>
                    <ui-badge>{{ trip.status }}</ui-badge>
                    <h3>{{ trip.title }}</h3>
                    <p>{{ showRange(trip.start_date, trip.end_date) }}</p>
                    <p class="muted">
                      {{ trip.cities.join(" → ") }} ·
                      {{ trip.pto_days_effective }} PTO days
                    </p>
                    @if (trip.pto.conflicts.length) {
                      <p>PTO overlaps</p>
                    }
                  </ui-card>
                </a>
              }
            </div>
          </section>
        }
      }
      @if (!home.in_progress.length && !home.upcoming.length) {
        <ui-empty-state
          title="Your next trip starts with a date"
          message="Add a destination and dates. Flights, bookings, and plans can follow."
        >
          <ui-button
            variant="ghost"
            href="/travel/trips/new"
            label="Plan a trip"
          />
        </ui-empty-state>
      }
      @if (home.past.length) {
        <details>
          <summary>Past trips ({{ home.past.length }})</summary>
          <div class="trip-grid">
            @for (trip of home.past; track trip.id) {
              <a class="trip-card" [routerLink]="['/travel/trips', trip.id]">
                <ui-card>
                  <h3>{{ trip.title }}</h3>
                  <p>{{ showRange(trip.start_date, trip.end_date) }}</p>
                </ui-card>
              </a>
            }
          </div>
        </details>
      }
    } @else {
      @if (!error()) {
        <p role="status">Loading trips…</p>
      }
    }
  </main>`,
})
export class TravelComponent {
  readonly showRange = showRange;
  private readonly http = inject(HttpClient);
  private readonly destroy = inject(DestroyRef);
  readonly data = signal<Home | null>(null);
  readonly error = signal("");
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
  }
  groups(home: Home): {
    title: string;
    trips: Trip[];
  }[] {
    return [
      { title: "Away now", trips: home.in_progress },
      { title: "Coming up", trips: home.upcoming },
    ];
  }
}
