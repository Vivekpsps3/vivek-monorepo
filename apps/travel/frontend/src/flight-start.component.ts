import {
  Component,
  DestroyRef,
  ViewChild,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { FormsModule } from "@angular/forms";
import { Subject, Subscription, debounceTime, filter, merge, take, timeout } from "rxjs";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  SESSION_CONTEXT,
  UiButtonComponent,
  UiCardComponent,
  UiDialogComponent,
  UiFieldComponent,
  UiFieldControlDirective,
} from "@vivek/ui";
import {
  acceptFlight,
  beginManual,
  canAccept,
  candidateLabel,
  clearFlightStart,
  editFlightField,
  existingTrips,
  flightSectionDirty,
  lookupApplies,
  reviewFromFlights,
  reviewOf,
  reviseFlightQuery,
  type AcceptedFlight,
  type FlightReview,
} from "./flight-start.mjs";
import {
  FLIGHT_LOOKUP_DELAY,
  flightProblem,
  lookupQuery,
  type Candidate,
} from "./flight-model.mjs";
import { SettingsComponent } from "./settings.component";
import { travelError, type Home } from "./travel.models";

@Component({
  selector: "travel-flight-start",
  standalone: true,
  imports: [
    FormsModule,
    SettingsComponent,
    UiButtonComponent,
    UiCardComponent,
    UiDialogComponent,
    UiFieldComponent,
    UiFieldControlDirective,
  ],
  template: `<ui-card
    ><section class="flight-start" aria-labelledby="flight-start-title">
      <h2 id="flight-start-title">Start with a flight</h2>
      <p class="muted">
        Enter one flight number and date. Travel proposes the route and local
        times. Nothing is saved until you choose a new trip or an existing trip.
        You can still type the trip below.
      </p>
      <div class="form-row">
        <ui-field label="Flight number"
          ><input
            uiFieldControl
            name="flightIdent"
            [ngModel]="ident"
            (ngModelChange)="onIdent($event)"
            autocomplete="off"
            placeholder="UA 837" /></ui-field
        ><ui-field label="Flight date"
          ><input
            uiFieldControl
            type="date"
            name="flightDate"
            [ngModel]="departOn"
            (ngModelChange)="onDate($event)"
        /></ui-field>
      </div>
      @if (looking()) {
        <p role="status">Finding the flight schedule…</p>
      }
      @if (problem() && !candidates().length) {
        <p class="local-error" role="status">{{ problem() }}</p>
        <ui-button variant="ghost" type="button" (clicked)="lookup()">
          Retry flight schedule
        </ui-button>
      }
      @if (problem() && candidates().length) {
        <p role="status">{{ problem() }}</p>
      }
      @for (candidate of candidates(); track candidate.ident + candidate.origin_iata + candidate.scheduled_out) {
        <ui-button variant="secondary" type="button" (clicked)="choose(candidate)">
          {{ label(candidate) }}
        </ui-button>
      }
      @if (review(); as proposed) {
        <ui-card class="flight-preview">
          <h3>Proposed flight</h3>
          <p>{{ proposed.from }} → {{ proposed.to }}</p>
          <p>Scheduled departure: {{ proposed.departLabel }}</p>
          <p>Scheduled arrival: {{ proposed.arriveLabel }}</p>
          @if (proposed.relation || proposed.status) {
            <p>
              {{ proposed.relation }}
              @if (proposed.relation && proposed.status) {
                ·
              }
              {{ proposed.status }}
            </p>
          }
          @if (proposed.notice) {
            <p>{{ proposed.notice }}</p>
          }
          <p>Proposed. Not saved yet.</p>
          @if (choiceFlights.length > 1) {
            <ui-button variant="ghost" type="button" (clicked)="different()">
              Choose a different flight
            </ui-button>
          }
        </ui-card>
      }
      @if (manual) {
        <p class="muted">Your times stay as you type them. Choosing a trip accepts them.</p>
        <div class="form-row">
          <ui-field label="Your departure airport"
            ><input
              uiFieldControl
              name="flightFrom"
              [ngModel]="text('depart_place')"
              (ngModelChange)="onField('depart_place', $event)" /></ui-field
          ><ui-field label="Your arrival airport"
            ><input
              uiFieldControl
              name="flightTo"
              [ngModel]="text('arrive_place')"
              (ngModelChange)="onField('arrive_place', $event)"
          /></ui-field>
        </div>
        <div class="form-row">
          <ui-field label="Your departure local date and time"
            ><input
              uiFieldControl
              type="datetime-local"
              name="flightDepart"
              [ngModel]="text('depart_at')"
              (ngModelChange)="onField('depart_at', $event)" /></ui-field
          ><ui-field label="Your arrival local date and time"
            ><input
              uiFieldControl
              type="datetime-local"
              name="flightArrive"
              [ngModel]="text('arrive_at')"
              (ngModelChange)="onField('arrive_at', $event)"
          /></ui-field>
        </div>
      }
      <div class="button-row">
        <ui-button
          variant="primary"
          type="button"
          [disabled]="busy() || !ready()"
          (clicked)="planNew()"
        >
          Plan as a new trip
        </ui-button>
        <ui-button
          variant="secondary"
          type="button"
          [disabled]="busy() || !ready()"
          [ariaExpanded]="existingOpen()"
          ariaControls="existing-trips"
          (clicked)="showExisting()"
        >
          Add to an existing trip
        </ui-button>
        <ui-button variant="ghost" type="button" [disabled]="busy()" (clicked)="manualEdit()">
          Edit times manually
        </ui-button>
        <ui-button variant="secondary" type="button" [disabled]="busy()" (clicked)="openConnection()">
          FlightAware settings
        </ui-button>
      </div>
      @if (existingOpen()) {
        <div id="existing-trips">
          <h3>Existing trips</h3>
          @if (tripsLoading()) {
            <p role="status">Loading trips…</p>
          }
          @if (tripsError()) {
            <p class="local-error" role="alert">{{ tripsError() }}</p>
            <ui-button variant="ghost" type="button" (clicked)="loadTrips()">Retry trips</ui-button>
          }
          @if (!tripsLoading() && !tripsError() && !trips().length) {
            <p>No saved trips yet. Plan this as a new trip.</p>
          }
          @for (trip of trips(); track trip.id) {
            <ui-button
              variant="secondary"
              type="button"
              [pressed]="chosenTrip() === trip.id"
              (clicked)="chooseTrip(trip.id)"
            >
              {{ trip.title }} · {{ trip.start }} to {{ trip.end }}
            </ui-button>
          }
          <ui-button
            variant="primary"
            type="button"
            [disabled]="busy() || chosenTrip() === null || !ready()"
            (clicked)="addToTrip()"
          >
            Add flight to this trip
          </ui-button>
        </div>
      }
    </section></ui-card
  >
  <ui-dialog
    [open]="connectionOpen()"
    [closeOnBackdrop]="false"
    labelledBy="flight-start-settings-title"
    (closed)="closeConnection()"
  >
    <h2 id="flight-start-settings-title" tabindex="-1" data-dialog-initial-focus>
      FlightAware settings
    </h2>
    @if (connectionOpen()) {
      <travel-settings presentation="dialog" />
    }
    <ui-button variant="secondary" type="button" (clicked)="closeConnection()">
      Back to flight
    </ui-button>
  </ui-dialog>`,
})
export class FlightStartComponent {
  readonly busy = input(false);
  readonly staged = output<AcceptedFlight>();
  readonly attach = output<{ tripId: number; leg: Record<string, unknown>; number: string }>();
  private readonly session = inject(SESSION_CONTEXT);
  private readonly ownerId = this.session.currentUser?.id;
  private sessionActive = true;
  private readonly http = inject(HttpClient);
  private readonly destroy = inject(DestroyRef);
  private readonly changes = new Subject<void>();
  private pending?: Subscription;
  private listRequest?: Subscription;
  private epoch = 0;
  private listEpoch = 0;
  private fetchedAt = "";
  choiceFlights: Candidate[] = [];
  ident = "";
  departOn = "";
  private acceptedIdent = "";
  private acceptedDate = "";
  private acceptedManual = "";
  values: Record<string, unknown> = {};
  overrides: string[] = [];
  private filled: string[] = [];
  manual = false;
  readonly looking = signal(false);
  readonly problem = signal("");
  readonly candidates = signal<Candidate[]>([]);
  readonly review = signal<FlightReview | null>(null);
  readonly connectionOpen = signal(false);
  readonly existingOpen = signal(false);
  readonly trips = signal<{ id: number; title: string; start: string; end: string }[]>([]);
  readonly tripsLoading = signal(false);
  readonly tripsError = signal("");
  readonly chosenTrip = signal<number | null>(null);
  readonly label = candidateLabel;
  @ViewChild(SettingsComponent) private settings?: SettingsComponent;
  constructor() {
    this.changes
      .pipe(debounceTime(FLIGHT_LOOKUP_DELAY), takeUntilDestroyed())
      .subscribe(() => this.lookup());
    merge(
      this.session.cleared$,
      this.session.user$.pipe(filter((user) => user?.id !== this.ownerId)),
    )
      .pipe(take(1), takeUntilDestroyed())
      .subscribe(() => this.clear());
    this.destroy.onDestroy(() => {
      this.pending?.unsubscribe();
      this.listRequest?.unsubscribe();
    });
  }
  unfinished(): boolean {
    if (this.settings?.key) return true;
    return flightSectionDirty({
      ident: this.ident,
      departOn: this.departOn,
      review: this.review(),
      manualDirty: this.manual && JSON.stringify(this.manualSnapshot()) !== this.acceptedManual,
      stagedNumber: this.acceptedIdent,
      stagedDate: this.acceptedDate,
    });
  }
  private manualSnapshot(): Record<string, string> {
    return {
      depart_place: String(this.values["depart_place"] || ""),
      arrive_place: String(this.values["arrive_place"] || ""),
      depart_at: String(this.values["depart_at"] || ""),
      arrive_at: String(this.values["arrive_at"] || ""),
    };
  }
  currentNumber(): string {
    return this.ident.toUpperCase().replace(/\s+/g, "");
  }
  ready(): boolean {
    return canAccept({ review: this.review(), manual: this.manual, values: this.values });
  }
  clear(): void {
    this.sessionActive = false;
    this.epoch += 1;
    this.listEpoch += 1;
    this.pending?.unsubscribe();
    this.listRequest?.unsubscribe();
    const cleared = clearFlightStart();
    this.ident = cleared.ident;
    this.departOn = cleared.departOn;
    this.acceptedIdent = "";
    this.acceptedDate = "";
    this.acceptedManual = "";
    this.values = cleared.values;
    this.overrides = cleared.overrides;
    this.filled = cleared.filled;
    this.manual = cleared.manual;
    this.choiceFlights = [];
    this.fetchedAt = "";
    this.looking.set(false);
    this.problem.set("");
    this.candidates.set([]);
    this.review.set(null);
    this.connectionOpen.set(false);
    this.existingOpen.set(false);
    this.trips.set([]);
    this.tripsLoading.set(false);
    this.tripsError.set("");
    this.chosenTrip.set(null);
  }
  onIdent(value: string): void {
    this.ident = value;
    this.revise();
  }
  onDate(value: string): void {
    this.departOn = value;
    this.revise();
  }
  text(name: string): string {
    const value = this.values[name];
    return value == null ? "" : String(value);
  }
  onField(name: string, value: string): void {
    const next = editFlightField(this.values, this.overrides, name, value);
    this.values = next.values;
    this.overrides = next.overrides;
    this.manual = true;
  }
  manualEdit(): void {
    const next = beginManual(this.values, this.review()?.flight || null);
    this.values = next.values;
    this.overrides = next.overrides;
    this.filled = [];
    this.manual = true;
  }
  different(): void {
    this.review.set(null);
    this.candidates.set(this.choiceFlights);
    this.problem.set(this.choiceFlights.length > 1 ? "Choose the matching flight." : "");
  }
  private revise(): void {
    this.epoch += 1;
    this.pending?.unsubscribe();
    this.looking.set(false);
    const next = reviseFlightQuery({
      ident: this.ident,
      departOn: this.departOn,
      values: this.values,
      overrides: this.overrides,
      filled: this.filled,
      manual: this.manual,
    });
    this.values = next.values;
    this.overrides = next.overrides;
    this.filled = [];
    this.review.set(null);
    this.candidates.set([]);
    this.problem.set("");
    if (!this.connectionOpen()) this.changes.next();
  }
  lookup(): void {
    if (!this.sessionActive || this.connectionOpen()) return;
    const started = lookupQuery(this.ident, this.departOn);
    if (!started) return;
    const epoch = ++this.epoch;
    this.pending?.unsubscribe();
    this.looking.set(true);
    this.problem.set("");
    this.pending = this.http
      .post<{ flights: Candidate[]; incomplete?: boolean; fetched_at?: string }>(
        "/travel/api/flights/lookup",
        started,
      )
      .pipe(timeout(20000))
      .subscribe({
        next: (body) => {
          const current = lookupQuery(this.ident, this.departOn);
          if (
            !lookupApplies({
              epoch,
              currentEpoch: this.epoch,
              sessionActive: this.sessionActive,
              settingsOpen: this.connectionOpen(),
              query: started,
              currentQuery: current,
            })
          ) {
            return;
          }
          this.looking.set(false);
          this.fetchedAt = body.fetched_at || "";
          const choice = reviewFromFlights(body.flights, this.departOn, {
            incomplete: Boolean(body.incomplete),
            fetchedAt: this.fetchedAt,
          });
          this.choiceFlights = choice.flights;
          this.review.set(choice.review);
          this.candidates.set(choice.kind === "choose" ? choice.flights : []);
          this.problem.set(choice.note);
        },
        error: (error) => {
          const current = lookupQuery(this.ident, this.departOn);
          if (
            !lookupApplies({
              epoch,
              currentEpoch: this.epoch,
              sessionActive: this.sessionActive,
              settingsOpen: this.connectionOpen(),
              query: started,
              currentQuery: current,
            })
          ) {
            return;
          }
          this.looking.set(false);
          this.problem.set(flightProblem(error).message || travelError(error));
        },
      });
  }
  choose(candidate: Candidate): void {
    this.review.set(reviewOf(candidate, this.fetchedAt));
    this.candidates.set([]);
    this.problem.set("");
  }
  planNew(): void {
    const accepted = this.accepted();
    if (!accepted) return;
    this.acceptedIdent = accepted.number;
    this.acceptedDate = this.departOn;
    this.acceptedManual = JSON.stringify(this.manualSnapshot());
    this.staged.emit(accepted);
  }
  showExisting(): void {
    const open = !this.existingOpen();
    this.existingOpen.set(open);
    if (open) this.loadTrips();
  }
  chooseTrip(id: number): void {
    this.chosenTrip.set(id);
  }
  addToTrip(): void {
    const tripId = this.chosenTrip();
    const accepted = this.accepted();
    if (tripId == null || !accepted) return;
    this.attach.emit({ tripId, leg: accepted.leg, number: accepted.number });
  }
  loadTrips(): void {
    if (!this.sessionActive) return;
    const epoch = ++this.listEpoch;
    this.listRequest?.unsubscribe();
    this.tripsLoading.set(true);
    this.tripsError.set("");
    this.listRequest = this.http
      .get<Home>("/travel/api/home")
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (home) => {
          if (!this.sessionActive || epoch !== this.listEpoch) return;
          this.trips.set(existingTrips(home));
          this.tripsLoading.set(false);
        },
        error: (error) => {
          if (!this.sessionActive || epoch !== this.listEpoch) return;
          this.tripsLoading.set(false);
          this.tripsError.set(travelError(error));
        },
      });
  }
  openConnection(): void {
    if (!this.sessionActive || this.connectionOpen()) return;
    this.epoch += 1;
    this.pending?.unsubscribe();
    this.looking.set(false);
    this.connectionOpen.set(true);
  }
  async closeConnection(): Promise<void> {
    if (this.settings && !(await this.settings.canLeave())) return;
    if (!this.destroy.destroyed) this.connectionOpen.set(false);
  }
  private accepted(): AcceptedFlight | null {
    const result = acceptFlight({
      review: this.review(),
      values: this.values,
      overrides: this.overrides,
      manual: this.manual,
      ident: this.ident,
      fetchedAt: this.fetchedAt,
    });
    if (!result.ok) {
      this.problem.set(result.helper);
      return null;
    }
    return result;
  }
}
