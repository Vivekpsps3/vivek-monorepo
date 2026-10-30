import {
  Component,
  DestroyRef,
  Input,
  OnInit,
  inject,
  output,
  signal,
} from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { FormsModule } from "@angular/forms";
import { Subject, Subscription, debounceTime, timeout } from "rxjs";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  Candidate,
  Clock,
  arrivalNote,
  decideCandidates,
  editManually,
  fillPreview,
  flightProblem,
  invalidateCandidate,
  localClock,
  lookupQuery,
  overridesFromSaved,
  useSchedule,
} from "./flight-model.mjs";
import { travelError } from "./travel.models";
@Component({
  selector: "travel-transport-editor",
  standalone: true,
  imports: [FormsModule],
  template: `<form class="travel-form" #form="ngForm" (ngSubmit)="save()">
    <h2>{{ initial ? "Edit transport" : "Add transport" }}</h2>
    <p class="muted">
      Choose a mode. Schedule and booking details are optional.
    </p>
    <div class="form-row">
      <label
        >Mode<select
          required
          name="mode"
          [(ngModel)]="values['mode']"
          (ngModelChange)="invalidate()"
        >
          <option value="">Choose mode…</option>
          <option value="flight">Flight</option>
          <option value="drive">Drive</option>
          <option value="train">Train</option>
          <option value="bus">Bus</option>
          <option value="ferry">Ferry</option>
          <option value="other">Other</option>
        </select></label
      ><label
        >Leg<select name="role" [(ngModel)]="values['role']">
          <option value="outbound">Outbound</option>
          <option value="inbound">Return</option>
          <option value="connection">Connection</option>
          <option value="local">Local</option>
        </select></label
      >
    </div>
    @if (values["mode"] === "flight") {
      <div class="form-row">
        <label
          >Flight number<input
            name="number"
            [(ngModel)]="values['number']"
            (ngModelChange)="invalidate()"
            placeholder="UA 837" /></label
        ><label
          >Departure date<input
            type="date"
            name="flightDate"
            [(ngModel)]="flightDate"
            (ngModelChange)="invalidate()"
        /></label>
      </div>
      @if (looking()) {
        <p role="status">Finding the flight schedule…</p>
      }
      @if (problem()) {
        <p class="local-error" role="status">{{ problem() }}</p>
        <button type="button" class="btn" (click)="lookup()">
          Retry flight schedule
        </button>
      }
      @for (candidate of candidates(); track $index) {
        <button class="btn" type="button" (click)="choose(candidate)">
          {{ candidate.ident_iata || candidate.ident }} ·
          {{ candidate.origin_iata }} → {{ candidate.destination_iata }} ·
          {{ clock(candidate.scheduled_out, candidate.origin_timezone) }}
        </button>
      }
      @if (selected(); as flight) {
        <section class="surface flight-preview">
          <h3>Flight schedule</h3>
          <p>{{ flight.origin_iata }} → {{ flight.destination_iata }}</p>
          <p>
            Scheduled departure:
            {{ clock(flight.scheduled_out, flight.origin_timezone) }}
          </p>
          <p>
            Scheduled arrival:
            {{ clock(flight.scheduled_in, flight.destination_timezone) }}
          </p>
          <p>{{ arrivalNote(flight) }} · {{ flight.status }}</p>
          <button class="btn" type="button" (click)="useFlight()">
            Use flight schedule
          </button>
        </section>
      }
      <button class="btn" type="button" (click)="manual()">
        Edit times manually
      </button>
    }
    <div class="form-row">
      <label
        >From<input
          name="from"
          [(ngModel)]="values['depart_place']"
          (ngModelChange)="lock('depart_place')" /></label
      ><label
        >To<input
          name="to"
          [(ngModel)]="values['arrive_place']"
          (ngModelChange)="lock('arrive_place')"
      /></label>
    </div>
    <div class="form-row">
      <label
        >Departure local date and time<input
          type="datetime-local"
          name="depart"
          [(ngModel)]="values['depart_at']"
          (ngModelChange)="lock('depart_at')" /></label
      ><label
        >Arrival local date and time<input
          type="datetime-local"
          name="arrive"
          [(ngModel)]="values['arrive_at']"
          (ngModelChange)="lock('arrive_at')"
      /></label>
    </div>
    @if (overrides.length) {
      <p class="muted">Edited by you. New lookups preserve your times.</p>
    }
    <details>
      <summary>Booking and optional details</summary>
      <div class="form-row">
        <label
          >Carrier<input
            name="carrier"
            [(ngModel)]="values['carrier']"
            (ngModelChange)="lock('carrier')" /></label
        ><label
          >Status<select name="status" [(ngModel)]="values['status']">
            <option value="planned">Planning</option>
            <option value="booked">Booked</option>
            <option value="completed">Done</option>
            <option value="cancelled">Cancelled</option>
          </select></label
        >
      </div>
      <div class="form-row">
        <label
          >Confirmation<input
            name="confirmation"
            [(ngModel)]="values['confirmation']" /></label
        ><label>Seat<input name="seat" [(ngModel)]="values['seat']" /></label>
      </div>
      <div class="form-row">
        <label
          >Cost<input
            type="number"
            min="0"
            step="0.01"
            name="cost"
            [(ngModel)]="values['cost']" /></label
        ><label
          >Currency<input
            name="currency"
            maxlength="3"
            [(ngModel)]="values['currency']"
        /></label>
      </div>
      <label class="check-label"
        ><input
          type="checkbox"
          name="paid"
          [(ngModel)]="values['paid']"
        />Paid</label
      ><label
        >Notes<textarea name="notes" [(ngModel)]="values['notes']"></textarea>
      </label>
    </details>
    @if (saveError) {
      <p class="local-error" role="alert">{{ saveError }}</p>
    }
    <div class="button-row">
      <button class="btn btn-primary" [disabled]="saving || !form.valid">
        {{ saving ? "Saving…" : "Save transport" }}</button
      ><button type="button" class="btn" (click)="cancelled.emit()">
        Cancel
      </button>
    </div>
  </form>`,
})
export class TransportEditorComponent implements OnInit {
  @Input()
  initial: Record<string, unknown> | null = null;
  @Input()
  date = "";
  @Input()
  saving = false;
  @Input()
  saveError = "";
  readonly submitted = output<Record<string, unknown>>();
  readonly cancelled = output<void>();
  private readonly http = inject(HttpClient);
  private readonly destroy = inject(DestroyRef);
  private readonly changes = new Subject<void>();
  private pending?: Subscription;
  values: Record<string, unknown> = {
    mode: "",
    role: "outbound",
    status: "planned",
    currency: "USD",
    paid: false,
  };
  flightDate = "";
  overrides: string[] = [];
  private filled: string[] = [];
  readonly looking = signal(false);
  readonly problem = signal("");
  readonly candidates = signal<Candidate[]>([]);
  readonly selected = signal<Candidate | null>(null);
  readonly arrivalNote = arrivalNote;
  constructor() {
    this.changes
      .pipe(debounceTime(400), takeUntilDestroyed())
      .subscribe(() => this.lookup());
    this.destroy.onDestroy(() => this.pending?.unsubscribe());
  }
  ngOnInit(): void {
    if (this.initial) {
      this.values = { ...this.values, ...this.initial };
      this.overrides = overridesFromSaved(this.initial);
    }
    this.flightDate = String(this.values["depart_at"] || this.date).slice(
      0,
      10,
    );
  }
  lock(name: string): void {
    if (!this.overrides.includes(name)) this.overrides.push(name);
  }
  manual(): void {
    const result = editManually(this.values);
    this.overrides = result.overrides;
    this.filled = [];
  }
  invalidate(): void {
    this.pending?.unsubscribe();
    this.looking.set(false);
    this.values = invalidateCandidate(this.values, this.filled, this.overrides);
    this.filled = [];
    this.selected.set(null);
    this.candidates.set([]);
    this.problem.set("");
    if (this.values["mode"] === "flight") this.changes.next();
  }
  lookup(): void {
    const query = lookupQuery(
      String(this.values["number"] || ""),
      this.flightDate,
    );
    if (!query || this.values["mode"] !== "flight") return;
    this.pending?.unsubscribe();
    this.looking.set(true);
    this.problem.set("");
    this.pending = this.http
      .post<{
        flights: Candidate[];
      }>("/travel/api/flights/lookup", query)
      .pipe(timeout(5000))
      .subscribe({
        next: (r) => {
          this.looking.set(false);
          const choice = decideCandidates(r.flights, this.flightDate);
          if (choice.kind === "preview" && choice.flight)
            this.choose(choice.flight);
          else if (choice.kind === "choose") {
            this.candidates.set(choice.flights);
            this.problem.set(choice.note || "Choose the matching flight.");
          } else {
            this.candidates.set([]);
            this.problem.set(
              "No matching flight on that date. Type the times yourself.",
            );
          }
        },
        error: (e) => {
          this.looking.set(false);
          this.problem.set(flightProblem(e).message || travelError(e));
        },
      });
  }
  choose(candidate: Candidate): void {
    this.selected.set(candidate);
    this.candidates.set([]);
    const result = fillPreview(this.values, candidate, this.overrides);
    this.values = result.values;
    this.filled = result.filled;
    this.overrides = result.overrides;
  }
  useFlight(): void {
    const flight = this.selected();
    if (!flight) return;
    const result = useSchedule(this.values, flight);
    this.values = result.values;
    this.filled = result.filled;
    this.overrides = [];
  }
  clock(iso: string, zone: string): string {
    const value: Clock | null = localClock(iso, zone);
    return value
      ? value.day + " " + value.time + " " + value.zone
      : "Time unavailable";
  }
  save(): void {
    if (this.saving || !this.values["mode"]) return;
    const values = Object.fromEntries(
      Object.entries(this.values)
        .filter(
          ([key]) =>
            !["id", "label", "route", "category", "sort_order"].includes(key),
        )
        .map(([key, value]) => [key, value === "" ? null : value]),
    );
    if (this.selected()) values["fa_fetched_at"] = new Date().toISOString();
    this.submitted.emit(values);
  }
}
