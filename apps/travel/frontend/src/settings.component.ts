import {
  Component,
  DestroyRef,
  HostListener,
  inject,
  signal,
} from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { FormsModule } from "@angular/forms";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { SESSION_CONTEXT, ConfirmService } from "@vivek/ui";
import { travelError } from "./travel.models";
interface Settings {
  flightaware: {
    configured: boolean;
    source: string;
    last4: string | null;
  };
}
@Component({
  standalone: true,
  imports: [FormsModule],
  template: `<main class="page travel-page">
    <header class="page-heading">
      <div>
        <p class="eyebrow">Travel preferences</p>
        <h1>Settings</h1>
      </div>
    </header>
    <section class="surface">
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
        <label
          >New FlightAware API key<input
            type="password"
            name="key"
            [(ngModel)]="key"
            autocomplete="new-password"
        /></label>
        <div class="button-row">
          <button class="btn btn-primary" [disabled]="saving() || !key.trim()">
            Save key</button
          ><button
            class="btn"
            type="button"
            [disabled]="saving() || !data()?.flightaware?.configured"
            (click)="clear()"
          >
            Remove personal key
          </button>
        </div>
      </form>
      @if (error()) {
        <p class="local-error" role="alert">{{ error() }}</p>
      }
      @if (message()) {
        <p role="status">{{ message() }}</p>
      }
    </section>
    <section class="surface">
      <h2>Maps</h2>
      <p>
        OpenStreetMap tiles and explicit Nominatim location search. Choose each
        city location from its trip page.
      </p>
      <p class="muted">Map data © OpenStreetMap contributors.</p>
    </section>
  </main>`,
})
export class SettingsComponent {
  private readonly session = inject(SESSION_CONTEXT);
  private readonly ownerId = this.session.currentUser?.id;
  private get ownsSession(): boolean {
    return !!this.ownerId && this.ownerId === this.session.currentUser?.id;
  }
  private readonly http = inject(HttpClient);
  private readonly destroy = inject(DestroyRef);
  private readonly confirm = inject(ConfirmService);
  key = "";
  readonly data = signal<Settings | null>(null);
  readonly error = signal("");
  readonly saving = signal(false);
  readonly message = signal("");
  canLeave(): boolean | Promise<boolean> {
    return (
      !this.ownsSession ||
      (!this.key && !this.saving()) ||
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
    if (this.ownsSession && (this.key || this.saving())) {
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
        next: (d) => this.data.set(d),
        error: (e) => this.error.set(travelError(e)),
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
