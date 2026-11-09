import {
  Component,
  DestroyRef,
  HostListener,
  inject,
  input,
  signal,
} from "@angular/core";
import { NgTemplateOutlet } from "@angular/common";
import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
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
import { hoursPerDayError } from "./pto-model.mjs";
import { travelError, type PtoSettings } from "./travel.models";
interface Settings {
  flightaware: {
    configured: boolean;
    source: string;
    last4: string | null;
  };
  pto: {
    hours_per_day: string;
    sick_prompt_dismissed: boolean;
  };
}
@Component({
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
    <ui-page-header [title]="embedded() ? 'Travel' : 'Settings'" />
    <ui-card>
      <h2>Flight schedules</h2>
      <p class="muted">
        FlightAware AeroAPI can fill airport-local schedules near departure.
        Availability depends on your account and date horizon. Manual entry is
        always available.
      </p>
      @if (data(); as settings) {
        <p>
          {{
            settings.flightaware.configured ? "Configured" : "No key configured"
          }}
          @if (settings.flightaware.last4) {
            · Key ending {{ settings.flightaware.last4 }}
          }
        </p>
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
  </ng-template>
  @if (embedded()) {
    <div class="page travel-page travel-page--embedded"><ng-container *ngTemplateOutlet="settingsBody" /></div>
  } @else {
    <main class="page travel-page"><ng-container *ngTemplateOutlet="settingsBody" /></main>
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
  /** Suite settings supplies the page heading and padding. `/travel/settings` keeps its own. */
  readonly embedded = input(false);
  private readonly session = inject(SESSION_CONTEXT);
  private readonly ownerId = this.session.currentUser?.id;
  private get ownsSession(): boolean {
    return !!this.ownerId && this.ownerId === this.session.currentUser?.id;
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
  readonly error = signal("");
  readonly saving = signal(false);
  readonly savingHours = signal(false);
  readonly hoursError = signal("");
  readonly message = signal("");
  canLeave(): boolean | Promise<boolean> {
    return (
      !this.ownsSession ||
      (!this.key && !this.hoursDirty() && !this.saving() && !this.savingHours()) ||
      this.confirm.ask(
        "Leave this key draft?",
        "Your new API key has not been saved. A pending save may still finish.",
        "Leave settings",
        "Keep editing",
      )
    );
  }
  @HostListener("window:beforeunload", ["$event"])
  unload(event: BeforeUnloadEvent): void {
    if (this.ownsSession && (this.key || this.hoursDirty() || this.saving() || this.savingHours())) {
      event.preventDefault();
      event.returnValue = "";
    }
  }
  constructor() {
    this.load();
    this.destroy.onDestroy(() => (this.key = ""));
  }
  load(): void {
    this.http
      .get<Settings>("/travel/api/settings")
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (d) => {
          this.data.set(d);
          const value = d.pto?.hours_per_day || "8";
          this.savedHours = value;
          if (!this.hoursEdited) this.hours = value;
        },
        error: (e) => this.error.set(travelError(e)),
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
    this.hoursError.set(hoursPerDayError(this.hours, this.savedHours));
  }
  saveHours(): void {
    if (this.savingHours() || !this.ownsSession) return;
    const problem = hoursPerDayError(this.hours, this.savedHours);
    this.hoursError.set(problem);
    if (problem || !this.hoursDirty()) return;
    const submitted = this.hours.trim();
    this.savingHours.set(true);
    this.http
      .put<PtoSettings>(
        "/travel/api/settings/pto",
        { hours_per_day: submitted },
        { context: silentErrorToast() },
      )
      .pipe(takeUntilDestroyed(this.destroy))
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
          const fields = (e.error as { field_errors?: Record<string, unknown> } | null)?.field_errors;
          const message = fields?.["hours_per_day"];
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
    if (this.saving() || !this.key.trim() || !this.ownsSession) return;
    const submitted = this.key;
    this.saving.set(true);
    this.error.set("");
    this.message.set("");
    this.http
      .put("/travel/api/settings/flightaware", { api_key: submitted })
      .pipe(takeUntilDestroyed(this.destroy))
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
    if (this.saving() || !this.ownsSession) return;
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
      .pipe(takeUntilDestroyed(this.destroy))
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
