import {
  Component,
  DestroyRef,
  HostListener,
  computed,
  inject,
  input,
  signal,
} from "@angular/core";
import { NgTemplateOutlet } from "@angular/common";
import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Subject, Subscription, filter, merge, take, takeUntil } from "rxjs";
import {
  SESSION_CONTEXT,
  ConfirmService,
  ToastService,
  UiButtonComponent,
  UiFieldComponent,
  UiFieldControlDirective,
  UiCardComponent,
  UiPageHeaderComponent,
  silentErrorToast,
} from "@vivek/ui";
import { blurHoursPerDay, fieldErrorMap } from "./pto-model.mjs";
import { travelError, type PtoSettings } from "./travel.models";
interface Settings {
  flightaware: {
    configured: boolean;
    source: string | null;
    last4: string | null;
  };
  pto: {
    hours_per_day: string;
    sick_prompt_dismissed: boolean;
  };
}
@Component({
  selector: "travel-settings",
  standalone: true,
  imports: [
    FormsModule,
    NgTemplateOutlet,
    RouterLink,
    UiButtonComponent,
    UiFieldComponent,
    UiFieldControlDirective,
    UiCardComponent,
    UiPageHeaderComponent,
  ],
  template: `<ng-template #settingsBody>
    @if (presentation() !== "dialog") {
      <ui-page-header [title]="presentation() === 'connection' ? 'Flight schedules' : presentation() === 'embedded' ? 'Travel' : 'Settings'" />
    }
    <ui-card>
      @if (!connectionOnly()) { <h2>Flight schedules</h2> }
      <p class="muted">
        FlightAware AeroAPI can fill airport-local schedules near departure.
        Availability depends on your account and date horizon. Manual entry is
        always available.
      </p>
      @if (data(); as settings) {
        <p>
          {{
            settings.flightaware.source === "environment" ? "Using the site’s FlightAware key"
              : settings.flightaware.configured ? "Personal key configured" : "No key configured"
          }}
          @if (settings.flightaware.source === "database" && settings.flightaware.last4) {
            · Key ending {{ settings.flightaware.last4 }}
          }
        </p>
      } @else if (!statusError()) {
        <p role="status">Checking FlightAware settings…</p>
      }
      @if (statusError()) {
        <p role="alert" class="local-error">{{ statusError() }}</p>
        <ui-button variant="secondary" type="button" (clicked)="load()">Retry connection status</ui-button>
      }
      <form class="travel-form" (ngSubmit)="save()">
        <ui-field label="New FlightAware API key"
          ><input
            uiFieldControl
            type="password"
            name="key"
            [(ngModel)]="key"
            autocomplete="new-password"
        /></ui-field>
        <div class="button-row">
          <ui-button
            variant="primary"
            type="submit"
            [disabled]="saving() || !key.trim()"
          >
            Save key</ui-button
          ><ui-button
            variant="ghost"
            type="button"
            [disabled]="saving() || !data()?.flightaware?.configured"
            (click)="clear()"
          >
            Remove personal key
          </ui-button>
        </div>
      </form>
      @if (error()) {
        <p class="local-error" role="alert">{{ error() }}</p>
      }
      @if (message()) {
        <p role="status">{{ message() }}</p>
      }
    </ui-card>
    @if (!connectionOnly()) {
      <ui-card>
        <h2>Time off</h2>
        <form class="travel-form" novalidate (ngSubmit)="saveHours()">
          <ui-field label="Hours in a workday" [required]="true" [error]="hoursError()">
            <span class="hours-suffix">
              <input
                uiFieldControl
                inputmode="decimal"
                name="hours-per-day"
                [ngModel]="hours"
                (ngModelChange)="editHours($event)"
                (blur)="checkHours()"
              />
              <span aria-hidden="true">h</span>
            </span>
          </ui-field>
          <ui-button variant="primary" type="submit" [disabled]="savingHours() || !hoursDirty()">
            {{ savingHours() ? "Saving…" : "Save hours" }}
          </ui-button>
        </form>
        <a class="pto-policy-link" routerLink="/travel/pto">PTO policy</a>
      </ui-card>
      <ui-card>
        <h2>Maps</h2>
        <p>
          OpenStreetMap tiles and explicit Nominatim location search. Choose each
          city location from its trip page.
        </p>
        <p class="muted">Map data © OpenStreetMap contributors.</p>
      </ui-card>
    }
  </ng-template>
  @if (presentation() === "dialog") {
    <ng-container *ngTemplateOutlet="settingsBody" />
  } @else if (presentation() === "page") {
    <main class="page travel-page"><ng-container *ngTemplateOutlet="settingsBody" /></main>
  } @else {
    <div class="page travel-page travel-page--embedded"><ng-container *ngTemplateOutlet="settingsBody" /></div>
  }`,
  styles: [
    `
      .hours-suffix { display: flex; align-items: center; gap: 0.4rem; }
      .hours-suffix input { min-height: 44px; min-width: 0; flex: 1; }
      .pto-policy-link {
        display: flex;
        align-items: center;
        min-height: 44px;
        margin-top: 0.75rem;
      }
    `,
  ],
})
export class SettingsComponent {
  readonly presentation = input<"page" | "embedded" | "connection" | "dialog">("page");
  readonly connectionOnly = computed(
    () => this.presentation() === "connection" || this.presentation() === "dialog",
  );
  private readonly session = inject(SESSION_CONTEXT);
  private readonly ownerId = this.session.currentUser?.id;
  private sessionActive = true;
  private readonly invalidated = new Subject<void>();
  private loadRequest?: Subscription;
  private get ownsSession(): boolean {
    return this.sessionActive && !!this.ownerId && this.ownerId === this.session.currentUser?.id;
  }
  private readonly http = inject(HttpClient);
  private readonly destroy = inject(DestroyRef);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  key = "";
  hours = "";
  private savedHours = "";
  private hoursEdited = false;
  readonly data = signal<Settings | null>(null);
  readonly statusError = signal("");
  readonly error = signal("");
  readonly saving = signal(false);
  readonly savingHours = signal(false);
  readonly hoursError = signal("");
  readonly message = signal("");
  canLeave(): boolean | Promise<boolean> {
    if (!this.ownsSession || !this.hasUnfinishedWork()) return true;
    const keyWork = Boolean(this.key) || this.saving();
    return this.confirm.ask(
      keyWork ? "Leave this key draft?" : "Leave these settings?",
      keyWork
        ? "A new key draft will be cleared. A pending change may still finish."
        : "Your hours have not been saved. A pending change may still finish.",
      "Leave settings",
      "Keep editing",
    );
  }
  @HostListener("window:beforeunload", ["$event"])
  unload(event: BeforeUnloadEvent): void {
    if (this.ownsSession && this.hasUnfinishedWork()) {
      event.preventDefault();
      event.returnValue = "";
    }
  }
  constructor() {
    merge(
      this.session.cleared$,
      this.session.user$.pipe(filter(user => user?.id !== this.ownerId)),
    ).pipe(take(1), takeUntilDestroyed(this.destroy)).subscribe(() => this.clearOwnedState());
    this.destroy.onDestroy(() => this.clearOwnedState());
    this.load();
  }
  private hasUnfinishedWork(): boolean {
    return Boolean(this.key) || this.saving() || this.hoursDirty() || this.savingHours();
  }
  private clearOwnedState(): void {
    this.sessionActive = false;
    this.invalidated.next();
    this.invalidated.complete();
    this.data.set(null);
    this.key = "";
    this.hours = "";
    this.savedHours = "";
    this.hoursEdited = false;
    this.statusError.set("");
    this.error.set("");
    this.message.set("");
    this.hoursError.set("");
    this.saving.set(false);
    this.savingHours.set(false);
  }
  load(): void {
    if (!this.ownsSession || this.destroy.destroyed) return;
    this.loadRequest?.unsubscribe();
    this.statusError.set("");
    this.loadRequest = this.http
      .get<Settings>("/travel/api/settings", { context: silentErrorToast() })
      .pipe(takeUntil(this.invalidated), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (d) => {
          this.data.set(d);
          const value = d.pto?.hours_per_day || "8";
          this.savedHours = value;
          if (!this.hoursEdited) this.hours = value;
        },
        error: () => this.statusError.set("Could not check the FlightAware connection."),
      });
  }
  hoursDirty(): boolean {
    return this.hoursEdited && this.hours !== this.savedHours;
  }
  editHours(value: string): void {
    this.hours = value;
    this.hoursEdited = true;
    this.hoursError.set("");
  }
  checkHours(): void {
    if (!this.hoursEdited) {
      this.hoursError.set(blurHoursPerDay(this.hours, this.savedHours).error);
      return;
    }
    const next = blurHoursPerDay(this.hours, this.savedHours);
    this.hours = next.text;
    this.hoursError.set(next.error);
  }
  saveHours(): void {
    if (this.savingHours() || !this.ownsSession || this.destroy.destroyed) return;
    const next = blurHoursPerDay(this.hours, this.savedHours);
    this.hours = next.text;
    this.hoursError.set(next.error);
    if (next.error || !this.hoursDirty()) return;
    const submitted = next.text;
    this.savingHours.set(true);
    this.http
      .put<PtoSettings>(
        "/travel/api/settings/pto",
        { hours_per_day: submitted },
        { context: silentErrorToast() },
      )
      .pipe(takeUntil(this.invalidated), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (body) => {
          this.savingHours.set(false);
          const stored = body.hours_per_day || submitted;
          this.savedHours = stored;
          if (this.hours.trim() === submitted) {
            this.hours = stored;
            this.hoursEdited = false;
          }
          this.toast.success("Hours in a workday saved.");
        },
        error: (e: HttpErrorResponse) => {
          this.savingHours.set(false);
          if (e.status === 401) return;
          const message = fieldErrorMap(e.error)?.["hours_per_day"];
          if (e.status === 422 && typeof message === "string") {
            this.hoursError.set(message);
            return;
          }
          this.toast.error("Couldn't save Hours in a workday.", {
            label: "Retry",
            run: () => this.saveHours(),
          });
        },
      });
  }
  save(): void {
    if (this.saving() || !this.key.trim() || !this.ownsSession || this.destroy.destroyed) return;
    const submitted = this.key;
    this.saving.set(true);
    this.error.set("");
    this.message.set("");
    this.http
      .put("/travel/api/settings/flightaware", { api_key: submitted })
      .pipe(takeUntil(this.invalidated), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: () => {
          if (this.key === submitted) this.key = "";
          this.saving.set(false);
          this.message.set(
            this.key
              ? "Key saved. Your newer key draft still needs saving."
              : "Key saved.",
          );
          this.load();
        },
        error: (e) => {
          this.error.set(travelError(e));
          this.saving.set(false);
        },
      });
  }
  async clear(): Promise<void> {
    if (this.saving() || !this.ownsSession || this.destroy.destroyed) return;
    if (
      !(await this.confirm.ask(
        "Remove your FlightAware key?",
        "You can still enter transport manually.",
        "Remove key",
        "Keep key",
      ))
    )
      return;
    if (this.destroy.destroyed || !this.ownsSession || this.saving()) return;
    this.saving.set(true);
    this.error.set("");
    this.message.set("");
    this.http
      .delete("/travel/api/settings/flightaware")
      .pipe(takeUntil(this.invalidated), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.message.set(
            this.key
              ? "Personal key removed. Your new key draft still needs saving."
              : "Personal key removed.",
          );
          this.load();
        },
        error: (e) => {
          this.error.set(travelError(e));
          this.saving.set(false);
        },
      });
  }
}
