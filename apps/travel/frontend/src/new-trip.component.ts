import {
  Component,
  DestroyRef,
  HostListener,
  inject,
  signal,
} from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { FormsModule } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  SESSION_CONTEXT,
  ConfirmService,
  UiDialogComponent,
  UiButtonComponent,
  UiCardComponent,
  UiFieldComponent,
  UiFieldControlDirective,
  UiPageHeaderComponent,
} from "@vivek/ui";
import {
  addDays,
  blankRange,
  changeCity,
  confirmSpan,
  defaultTripName,
  guardSpan,
  removeChange,
  saveState,
  segments,
  summaryText,
} from "./composer-model.mjs";
import { TransportEditorComponent } from "./transport-editor.component";
import { Trip, travelError } from "./travel.models";
@Component({
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    UiDialogComponent,
    TransportEditorComponent,
    UiButtonComponent,
    UiCardComponent,
    UiFieldComponent,
    UiFieldControlDirective,
    UiPageHeaderComponent,
  ],
  template: `<main class="page travel-page">
    <ui-page-header
      backLabel="← Trips"
      backLink="/travel"
      eyebrow="Something to look forward to"
      title="Plan a trip"
      subtitle="Start with dates and a destination. Everything else can wait."
    />
    <ui-card
      ><form class="travel-form" (ngSubmit)="save()" #form="ngForm">
        <div class="form-row">
          <ui-field label="Departure date" [required]="true"
            ><input
              uiFieldControl
              required
              type="date"
              name="start"
              [(ngModel)]="start"
              (change)="range()" /></ui-field
          ><ui-field label="Return date" [required]="true"
            ><input
              uiFieldControl
              required
              type="date"
              name="end"
              [(ngModel)]="end"
              [min]="start"
              (change)="range()"
          /></ui-field>
        </div>
        <p role="status">{{ summary(model().start, model().end) }}</p>
        @for (segment of parts(); track segment.key; let index = $index) {
          <section class="destination-segment">
            <ui-field
              [label]="
                index === 0 ? 'Destination city' : 'Next destination city'
              "
              [required]="true"
            >
              <input
                uiFieldControl
                [id]="'city-' + index"
                [name]="'city-' + index"
                required
                maxlength="200"
                [ngModel]="model().cities[segment.key] || ''"
                (ngModelChange)="city(segment.key, $event)"
                autocomplete="address-level2"
              />
            </ui-field>
            <p class="muted">
              {{ segment.arrive }} – {{ segment.leave }}
              @if (index > 0) {
                · First day here: {{ segment.arrive }}
              }
            </p>
            @if (index > 0) {
              <ui-button
                variant="ghost"
                size="sm"
                type="button"
                (click)="remove(segment.key)"
              >
                Remove destination change
              </ui-button>
            }
          </section>
        }
        @if (model().start && model().end && model().start < model().end) {
          <details>
            <summary>Add destination</summary>
            <p class="muted">Choose the first day at your next destination.</p>
            <ui-field label="Change city on date"
              ><input
                uiFieldControl
                type="date"
                name="changeDate"
                [(ngModel)]="changeDate"
                [min]="next(model().start, 1)"
                [max]="model().end" /></ui-field
            ><ui-button
              variant="ghost"
              type="button"
              [disabled]="
                !changeDate ||
                changeDate <= model().start ||
                changeDate > model().end
              "
              (click)="split()"
            >
              Add destination
            </ui-button>
          </details>
        }
        <p>
          <strong>Trip: {{ name() || "Your next trip" }}</strong>
        </p>
        <details>
          <summary>Rename trip</summary>
          <ui-field label="Trip name (optional)"
            ><input
              uiFieldControl
              name="title"
              maxlength="200"
              [ngModel]="model().tripName"
              (ngModelChange)="rename($event)"
              [placeholder]="name()"
          /></ui-field>
        </details>
        <details>
          <summary>Time off</summary>
          <label class="check-label"
            ><input
              type="checkbox"
              name="pto"
              [ngModel]="model().pto"
              (ngModelChange)="pto($event)"
            />Count selected dates as PTO</label
          >
          <p class="muted">
            Weekdays start as one day. Weekends start as Not PTO. Turning PTO
            off keeps your choices.
          </p>
          <div class="button-row">
            <ui-button
              variant="ghost"
              size="sm"
              type="button"
              (click)="weekdays()"
            >
              Select weekdays</ui-button
            ><ui-button
              variant="ghost"
              size="sm"
              type="button"
              (click)="clearPto()"
            >
              Clear PTO
            </ui-button>
          </div>
          <div class="pto-dates">
            @for (day of dates(); track day) {
              <ui-field [label]="day"
                ><select
                  uiFieldControl
                  [name]="'pto-' + day"
                  [ngModel]="charges[day]"
                  (ngModelChange)="charges[day] = +$event"
                >
                  <option [ngValue]="0">Not PTO</option>
                  <option [ngValue]="0.5">Half day</option>
                  <option [ngValue]="1">PTO</option>
                </select></ui-field
              >
            }
          </div>
          <p>{{ total() }} PTO days selected.</p>
        </details>
        @if (transports.length) {
          <section>
            <h2>Transport</h2>
            @for (transport of transports; track $index) {
              <p>
                {{ transport["mode"] }} · {{ transport["depart_place"] }} →
                {{ transport["arrive_place"] }}
                <ui-button
                  variant="ghost"
                  size="sm"
                  type="button"
                  (click)="transports.splice($index, 1)"
                >
                  Remove draft transport
                </ui-button>
              </p>
            }
          </section>
        }
        <ui-button
          variant="ghost"
          size="sm"
          type="button"
          (click)="transportOpen = true"
        >
          Add transport
        </ui-button>
        @if (error()) {
          <p role="alert" class="local-error">{{ error() }}</p>
        }
        <div class="button-row">
          <ui-button
            variant="primary"
            type="submit"
            [disabled]="
              saving() || !form.valid || (!!start && !!end && end < start)
            "
          >
            {{ saving() ? "Saving trip…" : "Save trip" }}</ui-button
          ><a routerLink="/travel">Cancel</a>
        </div>
      </form></ui-card
    >
    <ui-dialog
      [open]="transportOpen"
      labelledBy="new-transport-title"
      (closed)="transportOpen = false"
      ><h2 id="new-transport-title" class="visually-hidden">Add transport</h2>
      @if (transportOpen) {
        <travel-transport-editor
          [date]="start"
          (submitted)="transports.push($event); transportOpen = false"
          (cancelled)="transportOpen = false"
        />
      }
    </ui-dialog>
  </main>`,
})
export class NewTripComponent {
  private readonly session = inject(SESSION_CONTEXT);
  private readonly ownerId = this.session.currentUser?.id;
  private get ownsSession(): boolean {
    return !!this.ownerId && this.ownerId === this.session.currentUser?.id;
  }
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);
  private readonly confirm = inject(ConfirmService);
  readonly model = signal(blankRange());
  readonly parts = () => segments(this.model());
  readonly name = () => defaultTripName(this.model());
  readonly summary = summaryText;
  readonly next = addDays;
  private readonly startDate = signal("");
  private readonly endDate = signal("");
  get start(): string {
    return this.startDate();
  }
  set start(value: string) {
    this.startDate.set(value);
  }
  get end(): string {
    return this.endDate();
  }
  set end(value: string) {
    this.endDate.set(value);
  }
  changeDate = "";
  charges: Record<string, number> = {};
  transports: Record<string, unknown>[] = [];
  transportOpen = false;
  readonly error = signal("");
  readonly saving = signal(false);
  private saved = false;
  private attemptKey = "";
  private attemptBody = "";
  canLeave(): boolean | Promise<boolean> {
    return (
      !this.ownsSession ||
      this.saved ||
      !(this.start || this.end || this.transports.length) ||
      this.confirm.ask(
        "Leave this trip draft?",
        "This trip has not been saved yet.",
        "Leave draft",
        "Keep planning",
      )
    );
  }
  @HostListener("window:beforeunload", ["$event"])
  unload(event: BeforeUnloadEvent): void {
    if (this.ownsSession && !this.saved && (this.start || this.end)) {
      event.preventDefault();
      event.returnValue = "";
    }
  }
  async range(): Promise<void> {
    if (this.start && this.end && this.end < this.start) {
      this.error.set("Return date must be on or after departure.");
      return;
    }
    let next = guardSpan(this.model(), this.start, this.end);
    if (next.pendingSpan) {
      if (
        !(await this.confirm.ask(
          "Change trip dates?",
          "These destinations fall outside the new dates: " +
            next.pendingSpan.dropped
              .map((part) => part.city || part.key)
              .join(", ") +
            ".",
          "Change dates",
          "Keep dates",
        ))
      ) {
        this.start = this.model().start;
        this.end = this.model().end;
        return;
      }
      next = confirmSpan(next);
    }
    this.model.set(next);
    for (const day of this.dates())
      if (this.charges[day] === undefined)
        this.charges[day] = this.weekday(day);
    this.error.set("");
  }
  city(key: string, value: string): void {
    this.model.update((m) => ({ ...m, cities: { ...m.cities, [key]: value } }));
  }
  rename(value: string): void {
    this.model.update((m) => ({ ...m, tripName: value, nameTouched: true }));
  }
  pto(value: boolean): void {
    this.model.update((m) => ({ ...m, pto: value }));
  }
  split(): void {
    this.model.update((m) => changeCity(m, this.changeDate));
    this.changeDate = "";
  }
  async remove(key: string): Promise<void> {
    if (
      this.model().cities[key]?.trim() &&
      !(await this.confirm.ask(
        "Remove destination change?",
        "The previous city will cover these dates.",
        "Remove change",
        "Keep destination",
      ))
    )
      return;
    this.model.update((m) => removeChange(m, key));
  }
  dates(): string[] {
    const days: string[] = [];
    if (!this.model().start || !this.model().end) return days;
    for (
      let time = Date.parse(this.model().start + "T00:00:00Z"),
        end = Date.parse(this.model().end + "T00:00:00Z");
      time <= end;
      time += 86400000
    )
      days.push(new Date(time).toISOString().slice(0, 10));
    return days;
  }
  private weekday(day: string): number {
    const weekday = new Date(day + "T12:00:00").getDay();
    return weekday === 0 || weekday === 6 ? 0 : 1;
  }
  weekdays(): void {
    for (const day of this.dates()) this.charges[day] = this.weekday(day);
  }
  clearPto(): void {
    for (const day of this.dates()) this.charges[day] = 0;
  }
  total(): number {
    return this.model().pto
      ? this.dates().reduce((sum, day) => sum + (this.charges[day] || 0), 0)
      : 0;
  }
  save(): void {
    if (this.saving()) return;
    if (this.start && this.end && this.end < this.start) {
      this.error.set("Return date must be on or after departure.");
      return;
    }
    const state = saveState(this.model());
    if (!state.ok) {
      this.error.set(state.helper);
      return;
    }
    const payload = {
      title: state.title,
      start_date: this.start,
      end_date: this.end,
      counts_as_pto: this.model().pto,
      stays: state.parts.map((part) => ({
        city: part.city,
        arrive_on: part.arrive,
        leave_on: part.leave,
      })),
      transports: this.transports,
      pto_dates: this.dates().map((on_date) => ({
        on_date,
        amount: this.charges[on_date] || 0,
      })),
    };
    const encoded = JSON.stringify(payload);
    if (encoded !== this.attemptBody) {
      this.attemptKey = crypto.randomUUID();
      this.attemptBody = encoded;
    }
    this.saving.set(true);
    this.error.set("");
    this.http
      .post<Trip>("/travel/api/trips", {
        ...payload,
        client_request_id: this.attemptKey,
      })
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (trip) => {
          this.saved = true;
          this.router.navigate(["/travel/trips", trip.id]);
        },
        error: (e) => {
          this.error.set(travelError(e));
          this.saving.set(false);
        },
      });
  }
}
