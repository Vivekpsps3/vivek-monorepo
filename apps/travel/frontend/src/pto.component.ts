import {
  Component,
  DestroyRef,
  HostListener,
  inject,
  signal,
} from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
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
import { Subscription } from "rxjs";
import { showDay, showRange } from "./display";
import { PtoChartComponent, type PtoSeriesPoint } from "./pto-chart.component";
import { travelError } from "./travel.models";
interface Policy {
  configured: boolean;
  balance_saved: string | null;
  balance_as_of: string | null;
  balance_today: string | null;
  accrual_amount: string | null;
  accrual_unit: string;
  accrual_cadence: string;
  hours_per_day: string;
  annual_cap_days: string | null;
  conflicts: {
    on_date: string;
    amount: string;
    labels: string[];
  }[];
}
interface BucketState {
  bucket: string;
  configured: boolean;
  start_balance_hours: string;
  balance_as_of: string;
  accrual_hours: string;
  accrual_cadence: string;
  cap_hours: string | null;
  year_start: string;
  balance_today_hours: string;
  balance_today_days: string;
  at_cap: boolean;
  today_before_balance_date: boolean;
}
interface SeriesBucket {
  bucket: string;
  cap_hours: string | null;
  at_cap_today: boolean;
  balance_today_hours: string;
  balance_today_days: string;
  balance_horizon_hours: string;
  balance_horizon_days: string;
  first_negative: {
    on: string;
    hours: string;
    days: string;
    projected: boolean;
  } | null;
  points: PtoSeriesPoint[];
}
interface Series {
  today: string;
  hours_per_day: string;
  horizon_end: string;
  policy_year_end: string;
  rolled_over: boolean;
  days_left_in_policy_year: number;
  year_start_bucket: string | null;
  pto: SeriesBucket | null;
  sick: SeriesBucket | null;
}
interface Pto {
  policy: Policy;
  entries: {
    id: number;
    trip_id: number | null;
    start_date: string;
    end_date: string;
    days: string;
    label: string;
    kind: string;
    notes: string | null;
    bucket: string;
    hours: string;
    charges: {
      on_date: string;
      amount: string;
    }[];
  }[];
  hours_per_day: string;
  pto_sick_prompt_dismissed: boolean;
  buckets: {
    pto: BucketState | null;
    sick: BucketState | null;
  };
}
type BucketName = "pto" | "sick";
interface BucketForm {
  start_balance_hours: string;
  balance_as_of: string;
  accrual_hours: string;
  accrual_cadence: string;
  cap_hours: string;
  year_start: string;
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
    PtoChartComponent,
  ],
  template: `<main class="page travel-page">
    <ui-page-header
      eyebrow="Room to take a break"
      title="Time off"
      subtitle="Balance and trip forecasts use your selected PTO dates."
    />
    @if (error()) {
      <p class="local-error" role="alert">{{ error() }}</p>
      <ui-button variant="ghost" (click)="load()">Retry PTO</ui-button>
    }
    @if (message()) {
      <p role="status" class="save-status">{{ message() }}</p>
    }
    @if (data(); as pto) {
      <ui-card>
        <h2>
          {{
            pto.policy.configured ? "Balance today" : "Set a starting balance"
          }}
        </h2>
        <p class="balance-number">
          {{ pto.policy.balance_today ?? "—" }} <span>days</span>
        </p>
        @if (!pto.policy.configured) {
          <p class="muted">
            Add your balance and accrual to see future time off.
          </p>
        }
        @for (conflict of pto.policy.conflicts; track conflict.on_date) {
          <p class="local-error">
            {{ showDay(conflict.on_date) }} has {{ conflict.amount }} days
            allocated across {{ conflict.labels.join(", ") }}. Review
            overlapping leave.
          </p>
        }
        <details [open]="!pto.policy.configured">
          <summary>PTO policy and starting balance</summary>
          <form
            class="travel-form"
            #policyForm="ngForm"
            (ngSubmit)="savePolicy()"
          >
            <div class="form-row">
              <ui-field label="Known balance (days)" [required]="true"
                ><input
                  uiFieldControl
                  required
                  type="number"
                  step="0.01"
                  min="-366"
                  max="366"
                  name="balance"
                  [(ngModel)]="policy.balance_days" /></ui-field
              ><ui-field label="Balance date" [required]="true"
                ><input
                  uiFieldControl
                  required
                  type="date"
                  name="asof"
                  [(ngModel)]="policy.balance_as_of"
              /></ui-field>
            </div>
            <p class="muted">
              This balance includes leave taken on the balance date. Later
              selected dates deduct individually.
            </p>
            <div class="form-row">
              <ui-field label="Accrual amount" [required]="true"
                ><input
                  uiFieldControl
                  required
                  type="number"
                  step="0.01"
                  min="0"
                  name="amount"
                  [(ngModel)]="policy.accrual_amount" /></ui-field
              ><ui-field label="Unit"
                ><select
                  uiFieldControl
                  name="unit"
                  [(ngModel)]="policy.accrual_unit"
                >
                  <option value="day">Days</option>
                  <option value="hour">Hours</option>
                </select></ui-field
              >
            </div>
            <div class="form-row">
              <ui-field label="Accrual cadence"
                ><select
                  uiFieldControl
                  name="cadence"
                  [(ngModel)]="policy.accrual_cadence"
                >
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Every two weeks</option>
                  <option value="semimonthly">Twice a month</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select></ui-field
              ><ui-field label="Hours per day" [required]="true"
                ><input
                  uiFieldControl
                  type="number"
                  required
                  min="0.01"
                  max="24"
                  step="0.01"
                  name="hours"
                  [(ngModel)]="policy.hours_per_day"
              /></ui-field>
            </div>
            <ui-field label="Balance cap (optional)"
              ><input
                uiFieldControl
                type="number"
                min="0.01"
                max="366"
                step="0.01"
                name="cap"
                [(ngModel)]="policy.annual_cap_days" /></ui-field
            ><ui-button
              variant="primary"
              type="submit"
              [disabled]="saving() || !policyForm.valid"
            >
              Save PTO policy
            </ui-button>
          </form>
        </details>
      </ui-card>
      @if (series(); as s) {
        <ui-card>
          <h2>Forecast</h2>
          <p class="muted">
            Policy year ends {{ showDay(s.policy_year_end) }} ·
            {{ s.days_left_in_policy_year }} days left
            @if (s.rolled_over) {
              · Chart runs to {{ showDay(s.horizon_end) }} so the next year
              stays visible
            }
          </p>
          @if (s.pto; as bucket) {
            <h3>PTO</h3>
            <travel-pto-chart [points]="bucket.points" label="PTO balance" />
            <p>
              Today {{ bucket.balance_today_days }} days · By
              {{ showDay(s.horizon_end) }} {{ bucket.balance_horizon_days }}
              days
              @if (bucket.at_cap_today) {
                · At cap
              }
            </p>
            @if (bucket.first_negative; as dip) {
              <p class="local-error">
                Balance first goes negative on {{ showDay(dip.on) }} ({{
                  dip.days
                }}
                days).
              </p>
            }
          }
          @if (s.sick; as bucket) {
            <h3>Sick</h3>
            <travel-pto-chart [points]="bucket.points" label="Sick balance" />
            <p>
              Today {{ bucket.balance_today_days }} days · By
              {{ showDay(s.horizon_end) }} {{ bucket.balance_horizon_days }}
              days
              @if (bucket.at_cap_today) {
                · At cap
              }
            </p>
            @if (bucket.first_negative; as dip) {
              <p class="local-error">
                Balance first goes negative on {{ showDay(dip.on) }} ({{
                  dip.days
                }}
                days).
              </p>
            }
          }
        </ui-card>
      }
      <ui-card>
        <h2>Leave buckets</h2>
        <p class="muted">
          Balances in hours, converted at {{ pto.hours_per_day }} hours per
          day. Change the rate in Travel settings.
        </p>
        @for (name of bucketNames; track name) {
          @let state = pto.buckets[name];
          <details [open]="!state">
            <summary>
              {{ bucketLabel(name) }}
              @if (state) {
                — {{ state.balance_today_hours }} hours ({{
                  state.balance_today_days
                }}
                days) today
                @if (state.at_cap) {
                  · At cap
                }
              } @else {
                — not set up yet
              }
            </summary>
            <form
              class="travel-form"
              #bucketForm="ngForm"
              (ngSubmit)="saveBucket(name)"
            >
              <div class="form-row">
                <ui-field label="Starting balance (hours)" [required]="true"
                  ><input
                    uiFieldControl
                    required
                    type="text"
                    inputmode="decimal"
                    name="{{ name }}-start"
                    [(ngModel)]="bucketForms[name].start_balance_hours" /></ui-field
                ><ui-field label="Balance date" [required]="true"
                  ><input
                    uiFieldControl
                    required
                    type="date"
                    name="{{ name }}-asof"
                    [(ngModel)]="bucketForms[name].balance_as_of"
                /></ui-field>
              </div>
              <div class="form-row">
                <ui-field label="Accrual (hours)" [required]="true"
                  ><input
                    uiFieldControl
                    required
                    type="text"
                    inputmode="decimal"
                    name="{{ name }}-accrual"
                    [(ngModel)]="bucketForms[name].accrual_hours" /></ui-field
                ><ui-field label="Accrual cadence"
                  ><select
                    uiFieldControl
                    name="{{ name }}-cadence"
                    [(ngModel)]="bucketForms[name].accrual_cadence"
                  >
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Every two weeks</option>
                    <option value="semimonthly">Twice a month</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select></ui-field
                >
              </div>
              <div class="form-row">
                <ui-field label="Cap (hours, optional)"
                  ><input
                    uiFieldControl
                    type="text"
                    inputmode="decimal"
                    name="{{ name }}-cap"
                    [(ngModel)]="bucketForms[name].cap_hours" /></ui-field
                ><ui-field label="Policy year starts (MM-DD)" [required]="true"
                  ><input
                    uiFieldControl
                    required
                    type="text"
                    pattern="[0-9]{2}-[0-9]{2}"
                    placeholder="01-01"
                    name="{{ name }}-year"
                    [(ngModel)]="bucketForms[name].year_start"
                /></ui-field>
              </div>
              <ui-button
                variant="primary"
                type="submit"
                [disabled]="saving() || !bucketForm.valid"
              >
                Save {{ bucketLabel(name) }} bucket
              </ui-button>
            </form>
          </details>
        }
        @if (
          pto.buckets.pto &&
          !pto.buckets.sick &&
          !pto.pto_sick_prompt_dismissed
        ) {
          <p>
            Track sick time in its own bucket?
            <ui-button variant="ghost" size="sm" (click)="dismissSickPrompt()">
              Dismiss
            </ui-button>
          </p>
          <p class="muted">
            Use the Sick form above to set it up, or dismiss this prompt.
          </p>
        }
      </ui-card>
      <ui-card>
        <h2>Planned time away</h2>
        @for (entry of pto.entries; track entry.id) {
          <article class="trip-row">
            <div>
              <h3>
                @if (entry.trip_id) {
                  <a [routerLink]="['/travel/trips', entry.trip_id]">{{
                    entry.label
                  }}</a>
                } @else {
                  {{ entry.label }}
                }
              </h3>
              <p>
                {{ showRange(entry.start_date, entry.end_date) }} ·
                {{ entry.days }} days · {{ bucketLabel(entry.bucket) }} ·
                {{ entry.hours }} hours
              </p>
            </div>
            @if (!entry.trip_id) {
              <ui-button variant="ghost" size="sm" (click)="remove(entry.id)">
                Remove leave
              </ui-button>
            }
          </article>
        } @empty {
          <p class="muted">
            No planned leave. Trips add their selected PTO dates here.
          </p>
        }
      </ui-card>
      <ui-card>
        <h2>What if I take time off?</h2>
        <form class="travel-form" #previewForm="ngForm" (ngSubmit)="preview()">
          <div class="form-row">
            <ui-field label="Start date" [required]="true"
              ><input
                uiFieldControl
                required
                type="date"
                name="start"
                [(ngModel)]="leave.start_date" /></ui-field
            ><ui-field label="End date" [required]="true"
              ><input
                uiFieldControl
                required
                type="date"
                name="end"
                [min]="leave.start_date"
                [(ngModel)]="leave.end_date"
            /></ui-field>
          </div>
          <details>
            <summary>Optional day total</summary>
            <ui-field label="Days (blank uses weekdays)"
              ><input
                uiFieldControl
                type="number"
                name="days"
                min="0"
                step="0.5"
                [(ngModel)]="leave.days"
            /></ui-field>
          </details>
          <ui-button
            variant="ghost"
            type="submit"
            [disabled]="!previewForm.valid || saving()"
          >
            Preview balance
          </ui-button>
        </form>
        @if (forecast(); as projection) {
          <p class="save-status">
            Before: {{ projection["balance_before"] }} days · After:
            {{ projection["balance_after"] }} days
          </p>
          @if (projection["warning"]) {
            <p class="local-error">{{ projection["warning"] }}</p>
          }
        }
        <details>
          <summary>Save other leave</summary>
          <form
            class="travel-form"
            #leaveForm="ngForm"
            (ngSubmit)="saveLeave()"
          >
            <ui-field label="Leave label" [required]="true"
              ><input
                uiFieldControl
                required
                name="label"
                [(ngModel)]="leave.label"
                maxlength="200"
            /></ui-field>
            <ui-field label="Bucket"
              ><select uiFieldControl name="bucket" [(ngModel)]="leave.bucket">
                <option value="pto">PTO</option>
                <option value="sick">Sick</option>
              </select></ui-field
            >
            <p class="muted">
              Uses the dates above and counts weekdays unless a day total is
              entered.
            </p>
            <ui-field label="Notes (optional)">
              <textarea
                uiFieldControl
                name="notes"
                [(ngModel)]="leave.notes"
              ></textarea></ui-field
            ><ui-button
              variant="primary"
              type="submit"
              [disabled]="
                !leaveForm.valid ||
                !leave.start_date ||
                !leave.end_date ||
                saving()
              "
            >
              Save leave
            </ui-button>
          </form>
        </details>
      </ui-card>
    }
  </main>`,
})
export class PtoComponent {
  readonly showDay = showDay;
  readonly showRange = showRange;
  private readonly session = inject(SESSION_CONTEXT);
  private readonly ownerId = this.session.currentUser?.id;
  private get ownsSession(): boolean {
    return !!this.ownerId && this.ownerId === this.session.currentUser?.id;
  }
  private readonly http = inject(HttpClient);
  private readonly destroy = inject(DestroyRef);
  private readonly confirm = inject(ConfirmService);
  readonly data = signal<Pto | null>(null);
  readonly series = signal<Series | null>(null);
  readonly error = signal("");
  readonly saving = signal(false);
  readonly message = signal("");
  readonly forecast = signal<Record<string, unknown> | null>(null);
  readonly bucketNames: BucketName[] = ["pto", "sick"];
  bucketForms: Record<BucketName, BucketForm> = {
    pto: this.emptyBucketForm(),
    sick: this.emptyBucketForm(),
  };
  private bucketSaved: Record<BucketName, string> = {
    pto: JSON.stringify(this.bucketForms.pto),
    sick: JSON.stringify(this.bucketForms.sick),
  };
  bucketLabel(name: string): string {
    return name === "sick" ? "Sick" : "PTO";
  }
  private emptyBucketForm(): BucketForm {
    return {
      start_balance_hours: "",
      balance_as_of: new Date().toISOString().slice(0, 10),
      accrual_hours: "",
      accrual_cadence: "monthly",
      cap_hours: "",
      year_start: "01-01",
    };
  }
  get bucketsDirty(): boolean {
    return this.bucketNames.some(
      (name) =>
        JSON.stringify(this.bucketForms[name]) !== this.bucketSaved[name],
    );
  }
  policy = {
    balance_days: 0,
    balance_as_of: new Date().toISOString().slice(0, 10),
    accrual_amount: 0,
    accrual_unit: "day",
    accrual_cadence: "monthly",
    hours_per_day: 8,
    annual_cap_days: null as number | null,
  };
  leave = {
    label: "",
    start_date: "",
    end_date: "",
    days: null as number | null,
    notes: "",
    bucket: "pto",
  };
  private policySaved = JSON.stringify(this.policy);
  private readonly emptyLeave = JSON.stringify(this.leave);
  private loading?: Subscription;
  get policyDirty(): boolean {
    return JSON.stringify(this.policy) !== this.policySaved;
  }
  get dirty(): boolean {
    return (
      this.policyDirty ||
      this.bucketsDirty ||
      JSON.stringify(this.leave) !== this.emptyLeave
    );
  }
  canLeave(): boolean | Promise<boolean> {
    return (
      !this.ownsSession ||
      (!this.dirty && !this.saving()) ||
      this.confirm.ask(
        "Leave unsaved time off?",
        "Your policy or leave draft has not been saved. A pending save may still finish.",
        "Leave time off",
        "Keep editing",
      )
    );
  }
  @HostListener("window:beforeunload", ["$event"])
  unload(event: BeforeUnloadEvent): void {
    if (this.ownsSession && (this.dirty || this.saving())) {
      event.preventDefault();
      event.returnValue = "";
    }
  }
  constructor() {
    this.load();
  }
  load(): void {
    if (this.saving()) return;
    this.loading?.unsubscribe();
    this.error.set("");
    this.loading = this.http
      .get<Pto>("/travel/api/pto")
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (d) => this.adopt(d),
        error: (e) => this.error.set(travelError(e)),
      });
    this.loadSeries();
  }
  loadSeries(): void {
    this.http
      .get<Series>("/travel/api/pto/series")
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (d) => {
          if (this.ownsSession) this.series.set(d);
        },
        error: () => this.series.set(null),
      });
  }
  private adopt(
    d: Pto,
    submittedPolicy?: string,
    submittedBucket?: { name: BucketName; body: string },
  ): void {
    if (!this.ownsSession) return;
    const replacePolicy =
      !this.policyDirty || JSON.stringify(this.policy) === submittedPolicy;
    const p = d.policy;
    const saved = {
      balance_days: Number(p.balance_saved || 0),
      balance_as_of: p.balance_as_of || this.policy.balance_as_of,
      accrual_amount: Number(p.accrual_amount || 0),
      accrual_unit: p.accrual_unit,
      accrual_cadence: p.accrual_cadence,
      hours_per_day: Number(p.hours_per_day || 8),
      annual_cap_days:
        p.annual_cap_days === null ? null : Number(p.annual_cap_days),
    };
    this.policySaved = JSON.stringify(saved);
    if (replacePolicy) this.policy = saved;
    this.adoptBuckets(d, submittedBucket);
    this.data.set(d);
  }
  private adoptBuckets(
    d: Pto,
    submitted?: { name: BucketName; body: string },
  ): void {
    for (const name of this.bucketNames) {
      const state = d.buckets?.[name];
      const form: BucketForm = state
        ? {
            start_balance_hours: state.start_balance_hours,
            balance_as_of: state.balance_as_of,
            accrual_hours: state.accrual_hours,
            accrual_cadence: state.accrual_cadence,
            cap_hours: state.cap_hours ?? "",
            year_start: state.year_start,
          }
        : this.emptyBucketForm();
      // Mirror adopt(): keep in-progress edits unless this form was just
      // submitted unchanged, in which case take the server's normalized copy.
      const current = JSON.stringify(this.bucketForms[name]);
      const keepEdits =
        current !== this.bucketSaved[name] &&
        !(submitted?.name === name && submitted.body === current);
      this.bucketSaved[name] = JSON.stringify(form);
      if (!keepEdits) this.bucketForms[name] = form;
    }
  }
  savePolicy(): void {
    this.save("/pto/policy", { ...this.policy }, "put");
  }
  saveBucket(name: BucketName): void {
    if (this.saving() || !this.ownsSession) return;
    const form = this.bucketForms[name];
    const body = {
      start_balance_hours: form.start_balance_hours.trim(),
      balance_as_of: form.balance_as_of,
      accrual_hours: form.accrual_hours.trim(),
      accrual_cadence: form.accrual_cadence,
      cap_hours: form.cap_hours.trim() === "" ? null : form.cap_hours.trim(),
      year_start: form.year_start.trim(),
    };
    const submitted = JSON.stringify(form);
    this.loading?.unsubscribe();
    this.saving.set(true);
    this.error.set("");
    this.message.set("");
    this.http
      .put<Pto>(`/travel/api/pto/policies/${name}`, body)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (d) => {
          this.adopt(d, undefined, { name, body: submitted });
          this.saving.set(false);
          this.message.set(
            this.dirty
              ? `${this.bucketLabel(name)} bucket saved. Your other edits still need saving.`
              : `${this.bucketLabel(name)} bucket saved.`,
          );
          this.loadSeries();
        },
        error: (e) => {
          this.error.set(travelError(e));
          this.saving.set(false);
        },
      });
  }
  dismissSickPrompt(): void {
    if (this.saving() || !this.ownsSession) return;
    this.saving.set(true);
    this.error.set("");
    this.http
      .put<{ hours_per_day: string; sick_prompt_dismissed: boolean }>(
        "/travel/api/settings/pto",
        { sick_prompt_dismissed: true },
      )
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: () => {
          const current = this.data();
          if (current) {
            this.data.set({ ...current, pto_sick_prompt_dismissed: true });
          }
          this.saving.set(false);
        },
        error: (e) => {
          this.error.set(travelError(e));
          this.saving.set(false);
        },
      });
  }
  saveLeave(): void {
    this.save("/pto/entries", { ...this.leave });
  }
  private save(path: string, body: object, method = "post"): void {
    if (this.saving() || !this.ownsSession) return;
    this.loading?.unsubscribe();
    const submitted = JSON.stringify(body);
    this.saving.set(true);
    this.error.set("");
    this.message.set("");
    this.http
      .request<Pto>(method, "/travel/api" + path, { body })
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (d) => {
          this.adopt(d, method === "put" ? submitted : undefined);
          if (method === "post" && JSON.stringify(this.leave) === submitted) {
            this.leave = {
              label: "",
              start_date: "",
              end_date: "",
              days: null,
              notes: "",
              bucket: "pto",
            };
            this.forecast.set(null);
          }
          this.loadSeries();
          this.saving.set(false);
          this.message.set(
            this.dirty
              ? "PTO saved. Your other edits still need saving."
              : "PTO saved.",
          );
        },
        error: (e) => {
          this.error.set(travelError(e));
          this.saving.set(false);
        },
      });
  }
  preview(): void {
    this.error.set("");
    const params: Record<string, string> = {
      start: this.leave.start_date,
      end: this.leave.end_date,
    };
    if (this.leave.days !== null) params["days"] = String(this.leave.days);
    this.http
      .get<Record<string, unknown>>("/travel/api/pto/preview", { params })
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (d) => this.forecast.set(d),
        error: (e) => this.error.set(travelError(e)),
      });
  }
  async remove(id: number): Promise<void> {
    if (
      this.saving() ||
      !this.ownsSession ||
      !(await this.confirm.ask(
        "Remove this leave?",
        "Its dates will stop deducting from your PTO balance.",
        "Remove leave",
        "Keep leave",
      ))
    )
      return;
    if (this.destroy.destroyed || !this.ownsSession || this.saving()) return;
    this.loading?.unsubscribe();
    this.saving.set(true);
    this.error.set("");
    this.message.set("");
    this.http
      .delete("/travel/api/pto/entries/" + id)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.load();
        },
        error: (e) => {
          this.error.set(travelError(e));
          this.saving.set(false);
        },
      });
  }
}
