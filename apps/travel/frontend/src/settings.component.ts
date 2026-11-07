import {
  Component,
  DestroyRef,
  HostListener,
  inject,
  input,
  signal,
} from "@angular/core";
import { NgTemplateOutlet } from "@angular/common";
import { HttpClient } from "@angular/common/http";
import { FormsModule } from "@angular/forms";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  SESSION_CONTEXT,
  ConfirmService,
  UiButtonComponent,
  UiFieldComponent,
  UiFieldControlDirective,
  UiCardComponent,
  UiPageHeaderComponent,
} from "@vivek/ui";
import { travelError } from "./travel.models";
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
    UiButtonComponent,
    UiFieldComponent,
    UiFieldControlDirective,
    UiCardComponent,
    UiPageHeaderComponent,
  ],
  template: `<ng-template #settingsBody>
    <ui-page-header eyebrow="Travel preferences" [title]="embedded() ? 'Travel' : 'Settings'" />
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
      <p class="muted">
        Leave buckets track hours. This rate converts them to days on the
        Time off page.
      </p>
      <form class="travel-form" #ptoForm="ngForm" (ngSubmit)="savePto()">
        <ui-field label="Hours per day" [required]="true"
          ><input
            uiFieldControl
            required
            type="number"
            min="0.01"
            max="24"
            step="0.01"
            name="hoursPerDay"
            [(ngModel)]="hoursPerDay"
        /></ui-field>
        <div class="button-row">
          <ui-button
            variant="primary"
            type="submit"
            [disabled]="saving() || !ptoForm.valid || !ptoDirty"
          >
            Save hours per day
          </ui-button>
        </div>
      </form>
      @if (ptoError()) {
        <p class="local-error" role="alert">{{ ptoError() }}</p>
      }
      @if (ptoMessage()) {
        <p role="status">{{ ptoMessage() }}</p>
      }
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
  key = "";
  hoursPerDay = "";
  private savedHoursPerDay = "";
  readonly ptoError = signal("");
  readonly ptoMessage = signal("");
  get ptoDirty(): boolean {
    return this.hoursPerDay !== this.savedHoursPerDay;
  }
  readonly data = signal<Settings | null>(null);
  readonly error = signal("");
  readonly saving = signal(false);
  readonly message = signal("");
  canLeave(): boolean | Promise<boolean> {
    return (
      !this.ownsSession ||
      (!this.key && !this.ptoDirty && !this.saving()) ||
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
    if (this.ownsSession && (this.key || this.ptoDirty || this.saving())) {
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
          if (!this.ptoDirty && d.pto) {
            this.hoursPerDay = d.pto.hours_per_day;
            this.savedHoursPerDay = d.pto.hours_per_day;
          }
        },
        error: (e) => this.error.set(travelError(e)),
      });
  }
  savePto(): void {
    if (this.saving() || !this.ptoDirty || !this.ownsSession) return;
    const submitted = this.hoursPerDay;
    this.saving.set(true);
    this.ptoError.set("");
    this.ptoMessage.set("");
    this.http
      .put<{ hours_per_day: string; sick_prompt_dismissed: boolean }>(
        "/travel/api/settings/pto",
        { hours_per_day: submitted },
      )
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (d) => {
          this.savedHoursPerDay = d.hours_per_day;
          if (this.hoursPerDay === submitted) this.hoursPerDay = d.hours_per_day;
          this.saving.set(false);
          this.ptoMessage.set(
            this.ptoDirty
              ? "Hours per day saved. Your newer edit still needs saving."
              : "Hours per day saved.",
          );
        },
        error: (e) => {
          this.ptoError.set(travelError(e));
          this.saving.set(false);
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
