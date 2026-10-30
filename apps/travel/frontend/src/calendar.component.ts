import { Component, inject, signal } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Subject, catchError, of, startWith, switchMap, EMPTY } from "rxjs";
import { travelError } from "./travel.models";
import {
  UiButtonComponent,
  UiFieldComponent,
  UiFieldControlDirective,
  UiCardComponent,
  UiPageHeaderComponent,
  UiEmptyStateComponent,
} from "@vivek/ui";

interface Calendar {
  trips: {
    id: number;
    title: string;
    start_date: string;
    end_date: string;
    cities: string[];
    pto_dates: string[];
  }[];
  plans: {
    id: number;
    trip_id: number;
    on_date: string;
    title: string;
    start_time: string | null;
    place_name: string | null;
  }[];
}

/** Calendar month in the browser's zone. `toISOString()` is UTC and shifts the month near midnight. */
export function localMonth(now = new Date()): string {
  return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
}

function monthEnd(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return (
    month +
    "-" +
    String(new Date(year, monthNumber, 0).getDate()).padStart(2, "0")
  );
}

@Component({
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    UiButtonComponent,
    UiFieldComponent,
    UiFieldControlDirective,
    UiCardComponent,
    UiPageHeaderComponent,
    UiEmptyStateComponent,
  ],
  template: `<main class="page travel-page">
    <ui-page-header eyebrow="See your time away" title="Travel calendar">
      <ui-field uiPageActions label="Month"
        ><input
          uiFieldControl
          type="month"
          name="month"
          [ngModel]="month"
          (ngModelChange)="onMonth($event)"
      /></ui-field>
    </ui-page-header>
    @if (error()) {
      <p class="local-error" role="alert">{{ error() }}</p>
      <ui-button variant="ghost" type="button" (click)="retry()">
        Retry calendar
      </ui-button>
    }
    @if (data(); as calendar) {
      @for (trip of calendar.trips; track trip.id) {
        <ui-card>
          <h2>
            <a [routerLink]="['/travel/trips', trip.id]">{{ trip.title }}</a>
          </h2>
          <p>
            {{ trip.start_date }} – {{ trip.end_date }} ·
            {{ trip.cities.join(" → ") }}
          </p>
          <p class="muted">
            PTO dates in this month: {{ trip.pto_dates.join(", ") || "None" }}
          </p>
          @for (plan of calendar.plans; track plan.id) {
            @if (plan.trip_id === trip.id) {
              <p>
                {{ plan.on_date }} {{ plan.start_time }} · {{ plan.title }} ·
                {{ plan.place_name }}
              </p>
            }
          }
        </ui-card>
      } @empty {
        <ui-empty-state
          title="No trips this month"
          message="Choose another month or plan a new trip."
        >
          <ui-button
            variant="ghost"
            href="/travel/trips/new"
            label="New trip"
          />
        </ui-empty-state>
      }
    }
  </main>`,
})
export class CalendarComponent {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly refresh = new Subject<void>();
  month = "";
  readonly data = signal<Calendar | null>(null);
  readonly error = signal("");
  constructor() {
    this.route.queryParamMap
      .pipe(
        switchMap((params) => {
          const requested = params.get("month");
          this.month = requested || localMonth();
          if (!requested) {
            void this.router.navigate([], {
              relativeTo: this.route,
              queryParams: { month: this.month },
              replaceUrl: true,
            });
            return EMPTY;
          }
          return this.refresh.pipe(
            startWith(undefined),
            switchMap(() => this.load()),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((data) => this.data.set(data));
  }
  onMonth(month: string): void {
    this.month = month;
    this.openMonth();
  }
  retry(): void {
    this.openMonth();
  }
  private openMonth(): void {
    if (this.route.snapshot.queryParamMap.get("month") === this.month) {
      this.refresh.next();
      return;
    }
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { month: this.month },
    });
  }
  private load() {
    this.error.set("");
    return this.http
      .get<Calendar>("/travel/api/calendar", {
        params: { start: this.month + "-01", end: monthEnd(this.month) },
      })
      .pipe(
        catchError((error) => {
          this.error.set(travelError(error));
          return of(null);
        }),
      );
  }
}
