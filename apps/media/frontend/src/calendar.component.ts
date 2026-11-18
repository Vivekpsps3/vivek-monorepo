import { Component, DestroyRef, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Subject, catchError, finalize, map, merge, of, switchMap } from "rxjs";
import { showDay } from "./display";
import { releaseBand } from "./format.mjs";
import { errorCopy } from "./media.models";
import {
  CalendarEvent,
  CalendarMonth,
  SavedCalendar,
  localMonth,
} from "./saved-calendar.service";
import {
  SESSION_CONTEXT,
  UiButtonComponent,
  UiCardComponent,
  UiFieldComponent,
  UiFieldControlDirective,
  UiPageHeaderComponent,
} from "@vivek/ui";

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
  template: `<main class="page media-page" data-place="calendar">
    <ui-page-header title="Media calendar" [concealTitle]="true">
      <ui-button
        variant="ghost"
        [ariaDisabled]="refreshing()"
        (clicked)="refresh()"
      >
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
      @if (!data()) {
        <ui-button variant="ghost" (clicked)="retry()">Retry calendar</ui-button>
      }
    }
    @if (data(); as calendar) {
      <p class="muted">Today in your timezone: {{ calendar.today }}</p>
      @if (unconfigured(calendar); as missing) {
        <p role="status">{{ missing }}</p>
      }
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
          <h2>{{ showDay(day.date) }}</h2>
          @for (event of day.events; track event.title + event.entry_id) {
            <article class="episode-row">
              <div>
                <h3>
                  @if (event.entry_id) {
                    <a
                      class="release-link"
                      [routerLink]="['/media/item', event.entry_id]"
                      >{{ event.title }}</a
                    >
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
            @for (event of band.events; track event.title + event.entry_id) {
              <p class="release-band">
                @if (event.entry_id) {
                  <a
                    class="release-link"
                    [routerLink]="['/media/item', event.entry_id]"
                    >{{ event.title }}</a
                  >
                } @else {
                  {{ event.title }}
                }
                · {{ releaseBand(event) }}
              </p>
            }
          </ui-card>
        }
      }
    }
  </main>`,
})
export class CalendarComponent {
  readonly showDay = showDay;
  readonly releaseBand = releaseBand;
  private readonly saved = inject(SavedCalendar);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly session = inject(SESSION_CONTEXT);
  private readonly destroy = inject(DestroyRef);
  private readonly retry$ = new Subject<boolean>();
  private ownerId = this.session.currentUser?.id ?? null;
  private flight = 0;
  month = "";
  readonly data = signal<CalendarMonth | null>(null);
  readonly error = signal("");
  readonly refreshing = signal(false);

  constructor() {
    this.session.cleared$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.flight += 1;
      this.data.set(null);
      this.refreshing.set(false);
    });
    this.session.user$.pipe(takeUntilDestroyed()).subscribe((user) => {
      const next = user?.id ?? null;
      if (next === this.ownerId) return;
      this.ownerId = next;
      this.data.set(null);
      if (next != null) this.retry$.next(true);
    });
    merge(
      this.route.queryParamMap.pipe(
        map((params) => ({ month: params.get("month"), force: false })),
      ),
      this.retry$.pipe(map((force) => ({ month: this.month, force }))),
    )
      .pipe(
        switchMap(({ month, force }) => {
          this.month = month || localMonth();
          this.error.set("");
          return this.saved.read(this.month, force).pipe(
            catchError((error: unknown) => {
              this.error.set(errorCopy(error));
              return of(null);
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((month) => {
        if (month) this.data.set(month);
      });
  }

  refresh(): void {
    const month = this.month || localMonth();
    this.month = month;
    const flight = ++this.flight;
    this.refreshing.set(true);
    this.error.set("");
    this.saved
      .refresh(month)
      .pipe(
        finalize(() => {
          if (flight === this.flight) this.refreshing.set(false);
        }),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({
        next: (data) => {
          if (this.month === month) this.data.set(data);
        },
        error: (error: unknown) => {
          if (this.month === month) this.error.set(errorCopy(error));
        },
      });
  }

  retry(): void {
    this.retry$.next(true);
  }

  change(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { month: this.month },
      onSameUrlNavigation: "reload",
    });
  }

  unconfigured(calendar: CalendarMonth): string {
    return calendar.unconfigured?.includes("tmdb")
      ? "TMDB is not configured. Saved release dates stay available."
      : "";
  }

  bands(calendar: CalendarMonth): { title: string; events: CalendarEvent[] }[] {
    return [
      { title: "This month", events: calendar.month_band },
      { title: "This year", events: calendar.year_band },
      { title: "Date to be announced", events: calendar.unknown },
    ];
  }
}
