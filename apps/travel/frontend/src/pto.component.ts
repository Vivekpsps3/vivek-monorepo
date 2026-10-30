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
import { SESSION_CONTEXT, ConfirmService } from "@vivek/ui";
import { Subscription } from "rxjs";
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
    charges: {
      on_date: string;
      amount: string;
    }[];
  }[];
}
@Component({
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `<main class="page travel-page">
    <header class="page-heading">
      <div>
        <p class="eyebrow">Room to take a break</p>
        <h1>Time off</h1>
        <p class="muted">
          Balance and trip forecasts use your selected PTO dates.
        </p>
      </div>
    </header>
    @if (error()) {
      <p class="local-error" role="alert">{{ error() }}</p>
      <button class="btn" (click)="load()">Retry PTO</button>
    }
    @if (message()) {
      <p role="status" class="save-status">{{ message() }}</p>
    }
    @if (data(); as pto) {
      <section class="surface">
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
            {{ conflict.on_date }} has {{ conflict.amount }} days allocated
            across {{ conflict.labels.join(", ") }}. Review overlapping leave.
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
              <label
                >Known balance (days) <span aria-hidden="true">*</span
                ><input
                  required
                  type="number"
                  step="0.01"
                  min="-366"
                  max="366"
                  name="balance"
                  [(ngModel)]="policy.balance_days" /></label
              ><label
                >Balance date <span aria-hidden="true">*</span
                ><input
                  required
                  type="date"
                  name="asof"
                  [(ngModel)]="policy.balance_as_of"
              /></label>
            </div>
            <p class="muted">
              This balance includes leave taken on the balance date. Later
              selected dates deduct individually.
            </p>
            <div class="form-row">
              <label
                >Accrual amount <span aria-hidden="true">*</span
                ><input
                  required
                  type="number"
                  step="0.01"
                  min="0"
                  name="amount"
                  [(ngModel)]="policy.accrual_amount" /></label
              ><label
                >Unit<select name="unit" [(ngModel)]="policy.accrual_unit">
                  <option value="day">Days</option>
                  <option value="hour">Hours</option>
                </select></label
              >
            </div>
            <div class="form-row">
              <label
                >Accrual cadence<select
                  name="cadence"
                  [(ngModel)]="policy.accrual_cadence"
                >
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Every two weeks</option>
                  <option value="semimonthly">Twice a month</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select></label
              ><label
                >Hours per day<input
                  type="number"
                  required
                  min="0.01"
                  max="24"
                  step="0.01"
                  name="hours"
                  [(ngModel)]="policy.hours_per_day"
              /></label>
            </div>
            <label
              >Balance cap (optional)<input
                type="number"
                min="0.01"
                max="366"
                step="0.01"
                name="cap"
                [(ngModel)]="policy.annual_cap_days" /></label
            ><button
              class="btn btn-primary"
              [disabled]="saving() || !policyForm.valid"
            >
              Save PTO policy
            </button>
          </form>
        </details>
      </section>
      <section class="surface">
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
                {{ entry.start_date }} – {{ entry.end_date }} ·
                {{ entry.days }} days
              </p>
            </div>
            @if (!entry.trip_id) {
              <button class="btn btn-sm" (click)="remove(entry.id)">
                Remove leave
              </button>
            }
          </article>
        } @empty {
          <p class="muted">
            No planned leave. Trips add their selected PTO dates here.
          </p>
        }
      </section>
      <section class="surface">
        <h2>What if I take time off?</h2>
        <form class="travel-form" #previewForm="ngForm" (ngSubmit)="preview()">
          <div class="form-row">
            <label
              >Start date<input
                required
                type="date"
                name="start"
                [(ngModel)]="leave.start_date" /></label
            ><label
              >End date<input
                required
                type="date"
                name="end"
                [min]="leave.start_date"
                [(ngModel)]="leave.end_date"
            /></label>
          </div>
          <details>
            <summary>Optional day total</summary>
            <label
              >Days (blank uses weekdays)<input
                type="number"
                name="days"
                min="0"
                step="0.5"
                [(ngModel)]="leave.days"
            /></label>
          </details>
          <button class="btn" [disabled]="!previewForm.valid || saving()">
            Preview balance
          </button>
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
            <label
              >Leave label <span aria-hidden="true">*</span
              ><input
                required
                name="label"
                [(ngModel)]="leave.label"
                maxlength="200"
            /></label>
            <p class="muted">
              Uses the dates above and counts weekdays unless a day total is
              entered.
            </p>
            <label
              >Notes (optional)<textarea
                name="notes"
                [(ngModel)]="leave.notes"
              ></textarea></label
            ><button
              class="btn btn-primary"
              [disabled]="
                !leaveForm.valid ||
                !leave.start_date ||
                !leave.end_date ||
                saving()
              "
            >
              Save leave
            </button>
          </form>
        </details>
      </section>
    }
  </main>`,
})
export class PtoComponent {
  private readonly session = inject(SESSION_CONTEXT);
  private readonly ownerId = this.session.currentUser?.id;
  private get ownsSession(): boolean {
    return !!this.ownerId && this.ownerId === this.session.currentUser?.id;
  }
  private readonly http = inject(HttpClient);
  private readonly destroy = inject(DestroyRef);
  private readonly confirm = inject(ConfirmService);
  readonly data = signal<Pto | null>(null);
  readonly error = signal("");
  readonly saving = signal(false);
  readonly message = signal("");
  readonly forecast = signal<Record<string, unknown> | null>(null);
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
  };
  private policySaved = JSON.stringify(this.policy);
  private readonly emptyLeave = JSON.stringify(this.leave);
  private loading?: Subscription;
  get policyDirty(): boolean {
    return JSON.stringify(this.policy) !== this.policySaved;
  }
  get dirty(): boolean {
    return this.policyDirty || JSON.stringify(this.leave) !== this.emptyLeave;
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
  }
  private adopt(d: Pto, submittedPolicy?: string): void {
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
    this.data.set(d);
  }
  savePolicy(): void {
    this.save("/pto/policy", { ...this.policy }, "put");
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
            };
            this.forecast.set(null);
          }
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
