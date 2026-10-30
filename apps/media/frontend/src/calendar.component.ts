import { Component, DestroyRef, inject, signal } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  BehaviorSubject,
  combineLatest,
  switchMap,
  catchError,
  of,
} from "rxjs";
import { errorCopy } from "./media.models";
import {
  UiButtonComponent,
  UiCardComponent,
  UiFieldComponent,
  UiFieldControlDirective,
  UiPageHeaderComponent,
} from "@vivek/ui";
interface Event {
  title: string;
  detail: string;
  entry_id: number | null;
  on: string | null;
  release_on: string | null;
  precision: string;
  watched: boolean;
}
interface Calendar {
  today: string;
  month: string;
  partial: boolean;
  days: {
    date: string;
    events: Event[];
  }[];
  month_band: Event[];
  year_band: Event[];
  unknown: Event[];
}
@Component({
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    UiButtonComponent,
    UiCardComponent,
    UiFieldComponent,
    UiFieldControlDirective,
    UiPageHeaderComponent,
  ],
  template: `<main class="page media-page">
    <ui-page-header
      eyebrow="On the horizon"
      title="Media calendar"
      subtitle="Known episode dates and anticipated releases. Opening this page uses saved metadata."
    >
      <ui-button variant="ghost" [disabled]="refreshing()" (click)="refresh()">
        {{ refreshing() ? "Refreshing releases…" : "Refresh release metadata" }}
      </ui-button>
      <form uiPageActions (ngSubmit)="change()">
        <ui-field label="Month"
          ><input
            uiFieldControl
            type="month"
            name="month"
            [(ngModel)]="month"
            (ngModelChange)="change()"
        /></ui-field>
      </form>
    </ui-page-header>
    @if (error()) {
      <p role="alert" class="local-error">{{ error() }}</p>
      <ui-button variant="ghost" (click)="reload.next(0)"
        >Retry calendar</ui-button
      >
    }
    @if (data(); as calendar) {
      <p class="muted">Today in your timezone: {{ calendar.today }}</p>
      @if (calendar.partial) {
        <p role="status" class="local-error">
          Some release metadata is unavailable. Saved dates are still shown;
          refresh to check sources.
        </p>
      }
      @for (day of calendar.days; track day.date) {
        <ui-card
          [attr.aria-current]="day.date === calendar.today ? 'date' : null"
        >
          <h2>{{ day.date }}</h2>
          @for (event of day.events; track $index) {
            <article class="episode-row">
              <div>
                <h3>
                  @if (event.entry_id) {
                    <a [routerLink]="['/media/item', event.entry_id]">{{
                      event.title
                    }}</a>
                  } @else {
                    {{ event.title }}
                  }
                </h3>
                <p class="muted">
                  {{ event.detail }}
                  @if (event.watched) {
                    · Watched
                  }
                </p>
              </div>
            </article>
          }
        </ui-card>
      } @empty {
        <p class="muted">No dated releases this month.</p>
      }
      @for (band of bands(calendar); track band.title) {
        @if (band.events.length) {
          <ui-card>
            <h2>{{ band.title }}</h2>
            <p class="muted">These dates have not been announced precisely.</p>
            @for (event of band.events; track $index) {
              <p>
                @if (event.entry_id) {
                  <a [routerLink]="['/media/item', event.entry_id]">{{
                    event.title
                  }}</a>
                } @else {
                  {{ event.title }}
                }
                · {{ event.release_on || "Date unknown" }}
              </p>
            }
          </ui-card>
        }
      }
    }
  </main>`,
})
export class CalendarComponent {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly reload = new BehaviorSubject(0);
  month = "";
  readonly data = signal<Calendar | null>(null);
  readonly error = signal("");
  readonly refreshing = signal(false);
  private readonly destroy = inject(DestroyRef);
  constructor() {
    combineLatest([this.route.queryParamMap, this.reload])
      .pipe(
        switchMap(([p]) => {
          this.month = p.get("month") || localMonth();
          this.error.set("");
          return this.http
            .get<Calendar>("/media/api/calendar", {
              params: {
                month: this.month,
                tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
              },
            })
            .pipe(
              catchError((e) => {
                this.error.set(errorCopy(e));
                return of(null);
              }),
            );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((d) => this.data.set(d));
  }
  refresh(): void {
    if (this.refreshing()) return;
    this.refreshing.set(true);
    this.error.set("");
    const month = this.month;
    this.http
      .post<Calendar>("/media/api/calendar/refresh", null, {
        params: {
          month: this.month,
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      })
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (d) => {
          if (this.month === month) this.data.set(d);
          this.refreshing.set(false);
        },
        error: (e) => {
          if (this.month === month) this.error.set(errorCopy(e));
          this.refreshing.set(false);
        },
      });
  }
  change(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { month: this.month },
      onSameUrlNavigation: "reload",
    });
  }
  bands(calendar: Calendar): {
    title: string;
    events: Event[];
  }[] {
    return [
      { title: "This month", events: calendar.month_band },
      { title: "This year", events: calendar.year_band },
      { title: "Date to be announced", events: calendar.unknown },
    ];
  }
}
function localMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
