import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  ViewChild,
  inject,
  signal,
} from "@angular/core";
import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  SESSION_CONTEXT,
  ConfirmService,
  ToastService,
  UiButtonComponent,
  UiCardComponent,
  UiFieldComponent,
  UiFieldControlDirective,
  UiSkeletonComponent,
  UiStateComponent,
  silentErrorToast,
} from "@vivek/ui";
import { localTodayIso } from "@vivek/browser";
import { Subscription, firstValueFrom } from "rxjs";
import { showRange } from "./display";
import { PtoChartComponent } from "./pto-chart.component";
import { CHART_ERROR } from "./pto-chart.mjs";
import {
  ACCRUAL_MODES,
  CADENCES,
  CAP_BLURB,
  DISMISS_FAILED,
  EMPTY_MESSAGE,
  EMPTY_TITLE,
  ENTRY_FAILED,
  FIRST_RUN_BODY,
  FIRST_RUN_TITLE,
  LOAD_ERROR,
  MONTHS,
  PAGE_TITLE,
  POLICY_FAILED,
  POLICY_SAVED,
  SICK_HINT,
  SICK_UNSET,
  bucketLabel,
  capLine,
  chipText,
  commitHour,
  dateErrors,
  entryErrors,
  fieldErrorMap,
  fieldHint,
  firstInvalid,
  formatBalance,
  policyBody,
  policyErrors,
  previewKey,
} from "./pto-model.mjs";
import {
  BucketState,
  PtoBoard,
  PtoEntryRow,
  PtoPreview,
} from "./travel.models";

interface SeriesBucket {
  bucket: string;
  cap_hours: string | null;
  at_cap_today: boolean;
  balance_today_hours: string;
  balance_today_days: string;
  balance_horizon_hours: string;
  balance_horizon_days: string;
  horizon_end?: string;
  first_negative: {
    on: string;
    hours: string;
    days: string;
    projected: boolean;
  } | null;
  points: {
    on: string;
    hours: string;
    days: string;
    projected: boolean;
    kinds: string[];
  }[];
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
type BucketName = "pto" | "sick";
interface PolicyDraft {
  start_balance_hours: string;
  balance_as_of: string;
  accrual_hours: string;
  accrual_cadence: string;
  cap_hours: string;
  year_month: string;
  year_day: string;
  carry_forward: boolean;
  accrual_mode: string;
  accrual_anchor: string;
  accrual_version: number;
}
type Busy = "" | "policy" | "entry" | "remove";

@Component({
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    UiButtonComponent,
    UiCardComponent,
    UiFieldComponent,
    UiFieldControlDirective,
    UiSkeletonComponent,
    UiStateComponent,
    PtoChartComponent,
  ],
  template: `<main class="page travel-page pto-page">
    @if (phase() === "error") {
      <h1>{{ loadError }}</h1>
      <ui-button variant="primary" (clicked)="load()">Retry</ui-button>
    } @else {
      <h1 class="visually-hidden">{{ pageTitle }}</h1>
      @if (message()) {
        <p role="status" class="save-status">{{ message() }}</p>
      }
      @if (phase() === "loading") {
        <div class="pto-skel" aria-busy="true">
          <ui-state state="loading" thing="PTO" />
          <div class="pto-tiles">
            <ui-skeleton variant="block" height="7.5rem" />
            <ui-skeleton variant="block" height="7.5rem" />
          </div>
          <div class="pto-chart-skel" aria-hidden="true"></div>
        </div>
      } @else if (data(); as board) {
        @if (showFirstRun(board)) {
          <ui-card>
            <h2>{{ firstRunTitle }}</h2>
            <p>{{ firstRunBody }}</p>
            <div class="button-row">
              <ui-button variant="primary" (clicked)="openForm('sick', $event)">Set up Sick</ui-button>
              <ui-button variant="ghost" (clicked)="dismissPrompt()">Not now</ui-button>
            </div>
          </ui-card>
        }
        @if (ptoMissing(board)) {
          <ui-state state="empty" thing="PTO" [emptyTitle]="emptyTitle" [emptyMessage]="emptyMessage" />
        }
        <div class="pto-top">
          <div class="pto-tiles">
            @for (name of configuredBuckets(board); track name) {
              <article class="tile">
                <p class="tile-kicker">
                  <span aria-hidden="true">{{ name === "sick" ? "■" : "●" }}</span>
                  {{ label(name) }}
                </p>
                <h2>Balance today</h2>
                <p class="tile-balance">{{ balanceText(board, name) }}</p>
                @if (board.buckets[name]?.at_cap) {
                  <p>{{ capText(board.buckets[name]) }}</p>
                }
                <ui-button
                  variant="ghost"
                  [ariaLabel]="'Edit ' + label(name)"
                  (clicked)="openForm(name, $event)"
                  >Edit</ui-button
                >
              </article>
            }
          </div>
          <section class="pto-chart-slot" [attr.aria-busy]="chartPhase() === 'loading' ? 'true' : null">
            @if (chartPhase() === "loading") {
              <div class="pto-chart-skel" aria-hidden="true"></div>
            } @else if (chartPhase() === "error") {
              <p class="local-error" role="alert">{{ chartError }}</p>
              <ui-button variant="secondary" (clicked)="loadSeries()">Retry</ui-button>
            } @else if (series(); as forecast) {
              @if (forecast.pto || forecast.sick) {
                <travel-pto-chart [series]="forecast" />
              }
            }
          </section>
        </div>
        <div class="pto-lower">
          <section>
            <ui-card>
              <h2>Add time off</h2>
              <form class="travel-form" novalidate (ngSubmit)="saveEntry()">
                <div
                  class="segments"
                  role="radiogroup"
                  aria-label="Counts against"
                >
                  @for (choice of entryChoices; track choice.value) {
                    <label class="segment">
                      <input
                        type="radio"
                        name="entry-bucket"
                        [value]="choice.value"
                        [(ngModel)]="entryBucket"
                        (change)="touchEntryBucket()"
                      />
                      <span>{{ choice.label }}</span>
                    </label>
                  }
                </div>
                @if (entryBucket === "sick" && !board.buckets.sick?.configured) {
                  <p class="muted" id="sick-hint">{{ sickHint }}</p>
                }
                <ui-field label="Name" [required]="true" [error]="entryFieldErrors()['label']">
                  <input
                    #entryName
                    uiFieldControl
                    name="entry-label"
                    maxlength="200"
                    [(ngModel)]="leave.label"
                    (blur)="touchEntry()"
                  />
                </ui-field>
                <div class="form-row">
                  <ui-field label="First day" [required]="true" [error]="entryFieldErrors()['start_date']">
                    <input
                      #entryStart
                      uiFieldControl
                      type="date"
                      name="entry-start"
                      [(ngModel)]="leave.start_date"
                      (blur)="touchEntry()"
                    />
                  </ui-field>
                  <ui-field label="Last day" [required]="true" [error]="entryFieldErrors()['end_date']">
                    <input
                      #entryEnd
                      uiFieldControl
                      type="date"
                      name="entry-end"
                      [(ngModel)]="leave.end_date"
                      (blur)="touchEntry()"
                    />
                  </ui-field>
                </div>
                <details>
                  <summary>Optional day total</summary>
                  <ui-field label="Days (blank uses weekdays)" [optional]="true">
                    <input
                      uiFieldControl
                      inputmode="decimal"
                      name="entry-days"
                      [(ngModel)]="leave.days"
                    />
                  </ui-field>
                </details>
                <ui-field label="Notes" [optional]="true">
                  <textarea uiFieldControl name="entry-notes" [(ngModel)]="leave.notes"></textarea>
                </ui-field>
                <ui-button variant="primary" type="submit" [disabled]="busy() === 'entry'">
                  {{ busy() === "entry" ? "Saving…" : "Add" }}
                </ui-button>
              </form>
            </ui-card>
            <ui-card>
              <h2>What if I take time off? · {{ label(entryBucket) }}</h2>
              <ui-button variant="ghost" (clicked)="preview()" [disabled]="busy() === 'entry'">
                Preview balance
              </ui-button>
              @if (visiblePreview(); as projection) {
                <p class="save-status" role="status">
                  @if (projection.balance_when_you_leave) {
                    Before: {{ projection.balance_when_you_leave }} days · After:
                    {{ projection.leftover_after }} days
                  }
                  @if (projection.note) {
                    {{ projection.note }}
                  }
                </p>
              }
            </ui-card>
            <ui-card>
              <h2>Planned time away</h2>
              @for (entry of board.entries; track entry.id) {
                <article class="trip-row">
                  <div>
                    <p class="chip" [class.chip-sick]="entry.bucket === 'sick' && !entry.trip_id">
                      <span aria-hidden="true">{{ entry.bucket === "sick" && !entry.trip_id ? "■" : "●" }}</span>
                      {{ chip(entry) }}
                    </p>
                    <h3>
                      @if (entry.trip_id) {
                        <a [routerLink]="['/travel/trips', entry.trip_id]">{{ entry.label }}</a>
                      } @else {
                        {{ entry.label }}
                      }
                    </h3>
                    <p>{{ showRange(entry.start_date, entry.end_date) }} · {{ entry.days }} days</p>
                  </div>
                  @if (!entry.trip_id) {
                    <ui-button variant="ghost" size="sm" (clicked)="remove(entry.id)">Remove leave</ui-button>
                  }
                </article>
              } @empty {
                <p class="muted">No planned leave. Trips add their selected PTO dates here.</p>
              }
            </ui-card>
          </section>
          <section>
            @for (name of bothBuckets; track name) {
              <ui-card>
                <h2>{{ label(name) }}</h2>
                @if (board.buckets[name]?.configured) {
                  <p>{{ balanceText(board, name) }}</p>
                  <div class="button-row">
                    <ui-button
                      variant="ghost"
                      [ariaLabel]="'Edit ' + label(name) + ' policy'"
                      (clicked)="openForm(name, $event)"
                      >Edit</ui-button
                    >
                    @if (name === "sick") {
                      <ui-button variant="ghost" (clicked)="removeSick()">Remove Sick policy</ui-button>
                    }
                  </div>
                } @else if (name === "sick") {
                  <button type="button" class="text-link" (click)="openForm('sick', $event)">
                    {{ sickUnset }}
                  </button>
                }
                @if (editing() === name) {
                  <form class="travel-form" novalidate (ngSubmit)="savePolicy(name)">
                    <ui-field
                      label="Starting balance"
                      [required]="true"
                      [error]="fieldErrors()['start_balance_hours']"
                      [hint]="hintFor(name, 'start_balance_hours')"
                    >
                      <span class="suffix">
                        <input
                          #startBalance
                          uiFieldControl
                          inputmode="decimal"
                          name="start"
                          [ngModel]="drafts[name].start_balance_hours"
                          (ngModelChange)="editHour(name, 'start_balance_hours', $event)"
                          (blur)="blurHour(name, 'start_balance_hours')"
                        />
                        <span aria-hidden="true">h</span>
                      </span>
                    </ui-field>
                    <ui-field label="Balance as of" [required]="true" [error]="fieldErrors()['balance_as_of']">
                      <input
                        uiFieldControl
                        type="date"
                        name="asof"
                        [(ngModel)]="drafts[name].balance_as_of"
                        (blur)="blurField(name, 'balance_as_of')"
                      />
                    </ui-field>
                    @if (correctionPreview()) {
                      <p class="save-status" role="status">{{ correctionPreview() }}</p>
                    }
                    <ui-field
                      label="You earn"
                      [required]="true"
                      [error]="fieldErrors()['accrual_hours']"
                      [hint]="hintFor(name, 'accrual_hours')"
                    >
                      <span class="suffix">
                        <input
                          uiFieldControl
                          inputmode="decimal"
                          name="accrual"
                          [ngModel]="drafts[name].accrual_hours"
                          (ngModelChange)="editHour(name, 'accrual_hours', $event)"
                          (blur)="blurHour(name, 'accrual_hours')"
                        />
                        <span aria-hidden="true">h</span>
                      </span>
                    </ui-field>
                    <div
                      class="segments"
                      role="radiogroup"
                      aria-label="How often"
                      [attr.aria-invalid]="fieldErrors()['accrual_cadence'] ? 'true' : null"
                      [attr.aria-describedby]="fieldErrors()['accrual_cadence'] ? 'cadence-error' : null"
                    >
                      @for (choice of cadences; track choice.value) {
                        <label class="segment">
                          <input
                            type="radio"
                            name="cadence"
                            [value]="choice.value"
                            [(ngModel)]="drafts[name].accrual_cadence"
                            (change)="blurField(name, 'accrual_cadence')"
                          />
                          <span>{{ choice.label }}</span>
                        </label>
                      }
                    </div>
                    @if (fieldErrors()["accrual_cadence"]; as cadenceError) {
                      <p id="cadence-error" class="field-error">{{ cadenceError }}</p>
                    }
                    <div
                      class="segments"
                      role="radiogroup"
                      aria-label="Accrual schedule"
                      [attr.aria-invalid]="fieldErrors()['accrual_mode'] ? 'true' : null"
                      [attr.aria-describedby]="fieldErrors()['accrual_mode'] ? 'mode-error' : null"
                    >
                      @for (choice of accrualModes; track choice.value) {
                        <label class="segment">
                          <input
                            type="radio"
                            name="accrual-mode"
                            [value]="choice.value"
                            [(ngModel)]="drafts[name].accrual_mode"
                            (change)="blurField(name, 'accrual_mode')"
                          />
                          <span>{{ choice.label }}</span>
                        </label>
                      }
                    </div>
                    @if (fieldErrors()["accrual_mode"]; as modeError) {
                      <p id="mode-error" class="field-error">{{ modeError }}</p>
                    }
                    @if (drafts[name].accrual_mode === "scheduled") {
                      <ui-field
                        label="First posting date"
                        [required]="true"
                        [error]="fieldErrors()['accrual_anchor']"
                      >
                        <input
                          uiFieldControl
                          type="date"
                          name="anchor"
                          [(ngModel)]="drafts[name].accrual_anchor"
                          (blur)="blurField(name, 'accrual_anchor')"
                        />
                      </ui-field>
                    }
                    <ui-field
                      label="Cap"
                      [error]="fieldErrors()['cap_hours']"
                      [hint]="hintFor(name, 'cap_hours') || capBlurb"
                    >
                      <span class="suffix">
                        <input
                          uiFieldControl
                          inputmode="decimal"
                          name="cap"
                          [ngModel]="drafts[name].cap_hours"
                          (ngModelChange)="editHour(name, 'cap_hours', $event)"
                          (blur)="blurHour(name, 'cap_hours')"
                        />
                        <span aria-hidden="true">h</span>
                      </span>
                    </ui-field>
                    <ui-field label="Policy year starts" [error]="fieldErrors()['year_start']">
                      <span class="year-pair">
                        <select
                          uiFieldControl
                          name="year-month"
                          [(ngModel)]="drafts[name].year_month"
                          (blur)="blurField(name, 'year_start')"
                        >
                          @for (month of months; track month[0]) {
                            <option [value]="month[0]">{{ month[1] }}</option>
                          }
                        </select>
                        <select
                          name="year-day"
                          aria-label="Day"
                          [(ngModel)]="drafts[name].year_day"
                          (blur)="blurField(name, 'year_start')"
                        >
                          @for (day of days; track day) {
                            <option [value]="day">{{ day }}</option>
                          }
                        </select>
                      </span>
                    </ui-field>
                    <label class="check-row">
                      <input
                        type="checkbox"
                        name="carry-forward"
                        [(ngModel)]="drafts[name].carry_forward"
                        (change)="blurField(name, 'carry_forward')"
                      />
                      Carry unused hours into the next policy year
                    </label>
                    @if (fieldErrors()["carry_forward"]; as carryError) {
                      <p class="field-error">{{ carryError }}</p>
                    }
                    <div class="button-row">
                      <ui-button variant="primary" type="submit" [disabled]="busy() === 'policy'">
                        {{ busy() === "policy" ? "Saving…" : "Save" }}
                      </ui-button>
                      <ui-button variant="ghost" type="button" (clicked)="cancel(name)">Cancel</ui-button>
                    </div>
                  </form>
                }
              </ui-card>
            }
          </section>
        </div>
      }
    }
  </main>`,
  styles: [
    `
      .pto-page { max-width: 1080px; --series-2: #7c3aed; }
      :host-context([data-theme="dark"]) .pto-page { --series-2: #a78bfa; }
      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
      .check-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        min-height: 44px;
        margin: 0.25rem 0 0.75rem;
      }
      .pto-tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
      .tile, .pto-lower ui-card { min-width: 0; }
      .tile-kicker, .chip { display: inline-flex; align-items: center; gap: 0.35rem; }
      .tile-balance { font-size: 1.25rem; }
      .chip {
        border: 1px solid var(--accent);
        border-radius: 999px;
        padding: 0.1rem 0.55rem;
        margin: 0;
      }
      .chip-sick { border-color: var(--series-2, #7c3aed); }
      .segments { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 0.5rem 0 0.75rem; }
      .segment {
        flex: 1 1 calc(33.33% - 0.5rem);
        min-width: 0;
        min-height: 44px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.35rem;
        box-sizing: border-box;
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        padding: 0.25rem 0.4rem;
        text-align: center;
      }
      .segment input { margin: 0; }
      .segment:focus-within { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
      .suffix, .year-pair { display: flex; align-items: center; gap: 0.4rem; }
      .suffix input, .year-pair select { min-height: 44px; min-width: 0; flex: 1; }
      .text-link {
        min-height: 44px;
        background: none;
        border: 0;
        padding: 0;
        color: var(--accent);
        font: inherit;
        text-align: left;
        cursor: pointer;
      }
      .text-link:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
      .field-error { color: var(--danger); }
      .pto-chart-slot { min-width: 0; }
      .pto-chart-slot:empty { min-height: 0; }
      .pto-chart-skel { height: 220px; border-radius: var(--radius-md); background: var(--surface-sunken, var(--surface)); }
      @media (min-width: 1280px) {
        .pto-top { display: grid; grid-template-columns: 320px minmax(0, 1fr); gap: 1rem; align-items: start; }
        .pto-tiles { grid-template-columns: 1fr; }
        .pto-lower { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 1rem; align-items: start; }
        .segment { flex: 1 1 0; }
        .pto-chart-skel { height: 300px; }
      }
    `,
  ],
})
export class PtoComponent {
  readonly showRange = showRange;
  readonly chartError = CHART_ERROR;
  readonly pageTitle = PAGE_TITLE;
  readonly loadError = LOAD_ERROR;
  readonly emptyTitle = EMPTY_TITLE;
  readonly emptyMessage = EMPTY_MESSAGE;
  readonly firstRunTitle = FIRST_RUN_TITLE;
  readonly firstRunBody = FIRST_RUN_BODY;
  readonly sickHint = SICK_HINT;
  readonly sickUnset = SICK_UNSET;
  readonly capBlurb = CAP_BLURB;
  readonly cadences = CADENCES;
  readonly accrualModes = ACCRUAL_MODES;
  readonly months = MONTHS;
  readonly bothBuckets: BucketName[] = ["pto", "sick"];
  readonly entryChoices = [
    { value: "pto", label: "PTO" },
    { value: "sick", label: "Sick" },
  ];
  readonly days = Array.from({ length: 31 }, (_, index) => String(index + 1).padStart(2, "0"));
  private readonly session = inject(SESSION_CONTEXT);
  private readonly ownerId = this.session.currentUser?.id;
  private readonly http = inject(HttpClient);
  private readonly destroy = inject(DestroyRef);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  readonly phase = signal<"loading" | "error" | "ready">("loading");
  readonly data = signal<PtoBoard | null>(null);
  readonly series = signal<Series | null>(null);
  readonly chartPhase = signal<"loading" | "error" | "ready">("loading");
  readonly message = signal("");
  readonly busy = signal<Busy>("");
  readonly editing = signal<BucketName | null>(null);
  readonly fieldErrors = signal<Record<string, string>>({});
  readonly entryFieldErrors = signal<Record<string, string>>({});
  readonly notes = signal<Record<string, string>>({});
  readonly forecast = signal<PtoPreview | null>(null);
  readonly correctionPreview = signal("");
  private readonly forecastFor = signal("");
  private correctionEpoch = 0;
  entryBucket: BucketName = "pto";
  leave = { label: "", start_date: "", end_date: "", days: "", notes: "" };
  drafts: Record<BucketName, PolicyDraft> = { pto: blankDraft(""), sick: blankDraft("") };
  private savedDrafts: Record<BucketName, PolicyDraft> = { pto: blankDraft(""), sick: blankDraft("") };
  private stored: Record<BucketName, Record<string, string> | null> = { pto: null, sick: null };
  private readonly edited: Record<BucketName, Set<string>> = { pto: new Set(), sick: new Set() };
  private readonly emptyLeave = JSON.stringify({ ...this.leave, bucket: "pto" });
  private returnFocus: HTMLElement | null = null;
  private openedByPointer = false;
  private loading?: Subscription;
  private seriesSub?: Subscription;
  private seriesEpoch = 0;
  private policyAttempt: { bucket: BucketName; body: object; draft: string } | null = null;
  private entryAttempt: object | null = null;
  @ViewChild("startBalance") private startBalance?: ElementRef<HTMLInputElement>;
  @ViewChild("entryName") private entryName?: ElementRef<HTMLInputElement>;
  @ViewChild("entryStart") private entryStart?: ElementRef<HTMLInputElement>;
  @ViewChild("entryEnd") private entryEnd?: ElementRef<HTMLInputElement>;

  private get ownsSession(): boolean {
    return !!this.ownerId && this.ownerId === this.session.currentUser?.id;
  }

  get dirty(): boolean {
    return this.policyDirty() || this.leaveDirty();
  }

  canLeave(): boolean | Promise<boolean> {
    return (
      !this.ownsSession ||
      (!this.dirty && !this.busy()) ||
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
    if (this.ownsSession && (this.dirty || this.busy())) {
      event.preventDefault();
      event.returnValue = "";
    }
  }

  constructor() {
    const today = localTodayIso();
    this.drafts = { pto: blankDraft(today), sick: blankDraft(today) };
    this.savedDrafts = { pto: blankDraft(today), sick: blankDraft(today) };
    this.destroy.onDestroy(() => this.seriesSub?.unsubscribe());
    this.load();
  }

  label(name: BucketName): string {
    return bucketLabel(name);
  }

  chip(entry: PtoEntryRow): string {
    return chipText(entry);
  }

  showFirstRun(board: PtoBoard): boolean {
    return !board.buckets?.sick?.configured && !board.pto_sick_prompt_dismissed;
  }

  ptoMissing(board: PtoBoard): boolean {
    return !board.buckets?.pto?.configured;
  }

  configuredBuckets(board: PtoBoard): BucketName[] {
    return this.bothBuckets.filter((name) => !!board.buckets?.[name]?.configured);
  }

  balanceText(board: PtoBoard, name: BucketName): string {
    const row = board.buckets?.[name];
    return formatBalance(row?.balance_today_hours || "0", board.hours_per_day || "8");
  }

  capText(row: BucketState | null | undefined): string {
    return capLine(row?.cap_hours || "");
  }

  hintFor(name: BucketName, field: string): string {
    if (this.fieldErrors()[field]) return "";
    const draft = this.drafts[name];
    const hours = this.data()?.hours_per_day || "8";
    return fieldHint(field, draft[field as keyof PolicyDraft], hours, draft.accrual_cadence, this.notes()[field] || "");
  }

  visiblePreview(): PtoPreview | null {
    const stored = this.forecast();
    const stamped = this.forecastFor();
    return stamped && stamped === previewKey(this.previewInput()) ? stored : null;
  }

  load(): void {
    if (this.busy()) return;
    this.loading?.unsubscribe();
    this.phase.set(this.data() ? "ready" : "loading");
    this.loading = this.http
      .get<PtoBoard>("/travel/api/pto", { context: silentErrorToast() })
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (board) => this.adopt(board),
        error: (error: HttpErrorResponse) => {
          if (error.status === 401) return;
          this.phase.set("error");
        },
      });
    this.loadSeries();
  }

  loadSeries(): void {
    if (!this.ownsSession) return;
    this.seriesSub?.unsubscribe();
    const epoch = ++this.seriesEpoch;
    this.chartPhase.set("loading");
    this.seriesSub = this.http
      .get<Series>("/travel/api/pto/series", { context: silentErrorToast() })
      .subscribe({
        next: (body) => {
          if (!this.ownsSession || epoch !== this.seriesEpoch) return;
          this.series.set(body);
          this.chartPhase.set("ready");
        },
        error: (error: HttpErrorResponse) => {
          if (epoch !== this.seriesEpoch || error.status === 401) return;
          this.chartPhase.set("error");
        },
      });
  }

  openForm(name: BucketName, event: Event): void {
    this.editing.set(name);
    this.openedByPointer = true;
    this.returnFocus = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.fieldErrors.set({});
    this.notes.set({});
    setTimeout(() => this.startBalance?.nativeElement.focus());
  }

  editHour(name: BucketName, field: "start_balance_hours" | "accrual_hours" | "cap_hours", value: string): void {
    this.drafts[name][field] = value;
    this.edited[name].add(field);
    this.notes.update((notes) => ({ ...notes, [field]: "" }));
    this.fieldErrors.update((errors) => {
      const next = { ...errors };
      delete next[field];
      return next;
    });
  }

  blurHour(name: BucketName, field: "start_balance_hours" | "accrual_hours" | "cap_hours"): void {
    this.settleHour(name, field);
    this.blurField(name, field);
  }

  blurField(name: BucketName, field: string): void {
    const errors = policyErrors(this.drafts[name], this.stored[name], localTodayIso());
    this.fieldErrors.update((current) => {
      const next = { ...current };
      if (errors[field]) next[field] = errors[field];
      else delete next[field];
      return next;
    });
    if (
      field === "start_balance_hours" ||
      field === "balance_as_of" ||
      field === "accrual_mode" ||
      field === "accrual_anchor"
    ) {
      this.loadCorrectionImpact(name);
    }
  }

  savePolicy(name: BucketName): void {
    this.settleHour(name, "start_balance_hours");
    this.settleHour(name, "accrual_hours");
    this.settleHour(name, "cap_hours");
    const errors = policyErrors(this.drafts[name], this.stored[name], localTodayIso());
    this.fieldErrors.set(errors);
    const invalid = firstInvalid(errors);
    if (invalid) {
      this.focusPolicy(invalid);
      return;
    }
    const body = policyBody(this.drafts[name], this.stored[name], this.edited[name]);
    this.policyAttempt = { bucket: name, body, draft: JSON.stringify(this.drafts[name]) };
    if (this.scheduleChanged(name) && this.configured(name)) {
      const shown = this.correctionPreview();
      if (!shown) return;
      void this.confirm.confirmAction({
        title: "Change accrual schedule",
        message: `${shown} The starting balance and recorded leave stay.`,
        confirmLabel: "Save schedule",
        cancelLabel: "Keep current accrual",
        busyLabel: "Saving…",
        errorMessage: "Couldn't save the accrual schedule. Nothing was changed.",
        run: () => this.sendPolicy(),
      });
      return;
    }
    void this.sendPolicy().catch(() => undefined);
  }

  cancel(name: BucketName): void {
    this.drafts[name] = { ...this.savedDrafts[name] };
    this.edited[name].clear();
    this.fieldErrors.set({});
    this.notes.set({});
    this.clearCorrection();
    const keepEmptyPto = name === "pto" && !this.configured("pto") && !this.openedByPointer;
    if (keepEmptyPto) {
      setTimeout(() => this.startBalance?.nativeElement.focus());
      return;
    }
    this.editing.set(this.configured("pto") ? null : "pto");
    this.openedByPointer = false;
    this.returnFocus?.focus();
  }

  saveEntry(): void {
    const errors = { ...entryErrors(this.leave), ...dateErrors(this.leave) };
    this.entryFieldErrors.set(errors);
    if (errors["label"]) {
      this.entryName?.nativeElement.focus();
      return;
    }
    if (errors["start_date"]) {
      this.entryStart?.nativeElement.focus();
      return;
    }
    if (errors["end_date"]) {
      this.entryEnd?.nativeElement.focus();
      return;
    }
    const body = {
      label: this.leave.label.trim(),
      start_date: this.leave.start_date,
      end_date: this.leave.end_date,
      days: this.leave.days === "" ? null : this.leave.days,
      notes: this.leave.notes,
      bucket: this.entryBucket,
    };
    this.entryAttempt = body;
    this.sendEntry();
  }

  touchEntry(): void {
    const errors = entryErrors(this.leave);
    this.entryFieldErrors.set(errors);
  }

  touchEntryBucket(): void {
    this.entryFieldErrors.update((errors) => {
      const next = { ...errors };
      delete next["bucket"];
      return next;
    });
  }

  preview(): void {
    const dates = dateErrors(this.leave);
    if (dates["start_date"] || dates["end_date"]) {
      this.entryFieldErrors.set(dates);
      (dates["start_date"] ? this.entryStart : this.entryEnd)?.nativeElement.focus();
      return;
    }
    const key = previewKey(this.previewInput());
    const params: Record<string, string> = {
      start: this.leave.start_date,
      end: this.leave.end_date,
      bucket: this.entryBucket,
    };
    if (this.leave.days !== "") params["days"] = this.leave.days;
    this.http
      .get<PtoPreview>("/travel/api/pto/preview", { params, context: silentErrorToast() })
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (body) => {
          if (previewKey(this.previewInput()) !== key) return;
          this.forecastFor.set(key);
          this.forecast.set(body);
        },
        error: (error: HttpErrorResponse) => {
          if (error.status === 401) return;
          this.toast.error("Couldn't preview that time off.", { label: "Retry", run: () => this.preview() });
        },
      });
  }

  async removeSick(): Promise<void> {
    if (this.busy() || !this.ownsSession) return;
    const revision = this.sickRevision();
    if (revision === null) return;
    let failed = false;
    const removed = await this.confirm.confirmAction({
      title: "Remove Sick policy",
      message:
        "This removes the Sick policy, clears its saved setup, and shows the sick-time prompt again. Past sick leave, future allocations, and every PTO row stay.",
      confirmLabel: "Remove Sick policy",
      cancelLabel: "Keep Sick policy",
      busyLabel: "Removing…",
      errorMessage: "Couldn't remove the Sick policy. Nothing was changed. Try again.",
      run: () =>
        this.sendSickRemoval(revision).catch((error: unknown) => {
          failed = true;
          throw error;
        }),
    });
    if (!removed || this.destroy.destroyed || !this.ownsSession) {
      if (failed && !this.destroy.destroyed && this.ownsSession) this.load();
      return;
    }
    this.toast.success("Sick policy removed.");
  }

  async remove(id: number): Promise<void> {
    if (
      this.busy() ||
      !this.ownsSession ||
      !(await this.confirm.ask(
        "Remove this leave?",
        "Its dates will stop deducting from your PTO balance.",
        "Remove leave",
        "Keep leave",
      ))
    )
      return;
    if (this.destroy.destroyed || !this.ownsSession || this.busy()) return;
    this.busy.set("remove");
    this.http
      .delete("/travel/api/pto/entries/" + id, { context: silentErrorToast() })
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: () => {
          this.busy.set("");
          this.load();
        },
        error: (error: HttpErrorResponse) => {
          this.busy.set("");
          if (error.status !== 401) this.toast.error(ENTRY_FAILED);
        },
      });
  }

  dismissPrompt(): void {
    this.http
      .put("/travel/api/settings/pto", { sick_prompt_dismissed: true }, { context: silentErrorToast() })
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: () => {
          const board = this.data();
          if (board) this.data.set({ ...board, pto_sick_prompt_dismissed: true });
        },
        error: (error: HttpErrorResponse) => {
          if (error.status === 401) return;
          this.toast.error(DISMISS_FAILED, { label: "Retry", run: () => this.dismissPrompt() });
        },
      });
  }

  private sendPolicy(): Promise<void> {
    const attempt = this.policyAttempt;
    if (!attempt || this.busy() || !this.ownsSession) return Promise.reject(new Error("busy"));
    this.loading?.unsubscribe();
    this.busy.set("policy");
    this.message.set("");
    return new Promise((resolve, reject) => {
      this.http
        .put<PtoBoard>("/travel/api/pto/policies/" + attempt.bucket, attempt.body, {
          context: silentErrorToast(),
        })
        .subscribe({
          next: (board) => {
            this.adopt(board, attempt.bucket, attempt.draft);
            this.busy.set("");
            this.toast.success(POLICY_SAVED[attempt.bucket]);
            this.message.set(this.dirty ? "Your other edits still need saving." : "");
            this.editing.set(this.configured("pto") ? null : "pto");
            this.fieldErrors.set({});
            this.loadSeries();
            setTimeout(() => this.restoreFocus(attempt.bucket));
            resolve();
          },
          error: (error: HttpErrorResponse) => {
            this.failPolicy(error);
            reject(error);
          },
        });
    });
  }

  private sendEntry(): void {
    if (!this.entryAttempt || this.busy() || !this.ownsSession) return;
    const submitted = this.leaveState();
    this.loading?.unsubscribe();
    this.busy.set("entry");
    this.message.set("");
    this.http
      .post<PtoBoard>("/travel/api/pto/entries", this.entryAttempt, { context: silentErrorToast() })
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (board) => {
          const clear = this.leaveState() === submitted;
          this.adopt(board);
          if (clear) this.clearLeave();
          this.busy.set("");
          this.message.set(this.dirty ? "Your other edits still need saving." : "");
          this.loadSeries();
        },
        error: (error: HttpErrorResponse) => {
          this.busy.set("");
          if (error.status === 401) return;
          const fields = fieldErrorMap(error.error);
          if (error.status === 422 && fields) {
            this.entryFieldErrors.set(fields);
            return;
          }
          this.toast.error(ENTRY_FAILED, { label: "Retry", run: () => this.sendEntry() });
        },
      });
  }

  private failPolicy(error: HttpErrorResponse): void {
    this.busy.set("");
    if (error.status === 401) return;
    const fields = fieldErrorMap(error.error);
    if (error.status === 422 && fields) {
      this.fieldErrors.set(fields);
      const invalid = firstInvalid(fields);
      if (invalid) this.focusPolicy(invalid);
      return;
    }
    const bucket = this.policyAttempt?.bucket || "pto";
    this.toast.error(POLICY_FAILED[bucket], {
      label: "Retry",
      run: () => {
        void this.sendPolicy().catch(() => undefined);
      },
    });
  }

  private adopt(board: PtoBoard, bucket?: BucketName, submittedDraft?: string): void {
    if (!this.ownsSession) return;
    this.clearCorrection();
    const today = localTodayIso();
    for (const name of this.bothBuckets) {
      const next = fromBucket(board.buckets?.[name] ?? null, today);
      const dirty = JSON.stringify(this.drafts[name]) !== JSON.stringify(this.savedDrafts[name]);
      const accepted = bucket === name && JSON.stringify(this.drafts[name]) === submittedDraft;
      this.savedDrafts[name] = next;
      this.stored[name] = storedOf(board.buckets?.[name] ?? null);
      if (!dirty || accepted) {
        this.drafts[name] = { ...next };
        if (accepted) this.edited[name].clear();
      }
    }
    this.data.set(board);
    this.phase.set("ready");
    if (!this.editing()) this.editing.set(board.buckets?.pto?.configured ? null : "pto");
    this.dropStalePreview();
  }

  private clearLeave(): void {
    this.leave = { label: "", start_date: "", end_date: "", days: "", notes: "" };
    this.entryBucket = "pto";
    this.entryFieldErrors.set({});
    this.forecast.set(null);
    this.forecastFor.set("");
    this.entryAttempt = null;
  }

  private configured(name: BucketName): boolean {
    return !!this.data()?.buckets?.[name]?.configured;
  }

  private sickRevision(): number | null {
    const row = this.data()?.buckets?.sick as (BucketState & { revision?: number }) | null | undefined;
    if (!row?.configured || typeof row.revision !== "number" || !Number.isInteger(row.revision) || row.revision < 0) {
      return null;
    }
    return row.revision;
  }

  private sendSickRemoval(revision: number): Promise<unknown> {
    return firstValueFrom(
      this.http.post<PtoBoard>(
        "/travel/api/pto/policies/sick/removal",
        { revision },
        { context: silentErrorToast() },
      ),
    ).then((board) => {
      if (this.destroy.destroyed || !this.ownsSession) return;
      this.drafts.sick = { ...this.savedDrafts.sick };
      this.edited.sick.clear();
      this.adopt(board);
      if (this.editing() === "sick") {
        this.editing.set(this.configured("pto") ? null : "pto");
        this.openedByPointer = false;
      }
      this.loadSeries();
    });
  }

  private loadCorrectionImpact(name: BucketName): void {
    const draft = this.drafts[name];
    const saved = this.savedDrafts[name];
    const datedChanged =
      draft.start_balance_hours !== saved.start_balance_hours || draft.balance_as_of !== saved.balance_as_of;
    if ((!datedChanged && !this.scheduleChanged(name)) || !this.configured(name)) {
      this.clearCorrection();
      return;
    }
    const errors = policyErrors(draft, this.stored[name], localTodayIso());
    if (
      errors["start_balance_hours"] ||
      errors["balance_as_of"] ||
      errors["accrual_mode"] ||
      errors["accrual_anchor"]
    ) {
      this.clearCorrection();
      return;
    }
    const epoch = ++this.correctionEpoch;
    this.correctionPreview.set("");
    const body = policyBody(draft, this.stored[name], this.edited[name]);
    this.http
      .post<{ balance_today_hours: string; entries_rewritten: boolean }>(
        "/travel/api/pto/policies/" + name + "/impact",
        body,
        { context: silentErrorToast() },
      )
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (impact) => {
          if (epoch !== this.correctionEpoch || impact.entries_rewritten) return;
          const hours = this.data()?.hours_per_day || "8";
          this.correctionPreview.set(
            `Balance today would be ${formatBalance(impact.balance_today_hours, hours)}. Past leave stays recorded.`,
          );
        },
        error: (error: HttpErrorResponse) => {
          if (epoch !== this.correctionEpoch || error.status === 401) return;
          this.correctionPreview.set("");
        },
      });
  }

  private clearCorrection(): void {
    this.correctionEpoch += 1;
    this.correctionPreview.set("");
  }

  private scheduleChanged(name: BucketName): boolean {
    const draft = this.drafts[name];
    const saved = this.savedDrafts[name];
    if ((draft.accrual_mode || "daily") !== (saved.accrual_mode || "daily")) return true;
    return draft.accrual_mode === "scheduled" && (draft.accrual_anchor || "") !== (saved.accrual_anchor || "");
  }

  private policyDirty(): boolean {
    return this.bothBuckets.some(
      (name) => JSON.stringify(this.drafts[name]) !== JSON.stringify(this.savedDrafts[name]),
    );
  }

  private leaveDirty(): boolean {
    return this.leaveState() !== this.emptyLeave;
  }

  private leaveState(): string {
    return JSON.stringify({ ...this.leave, bucket: this.entryBucket });
  }

  private settleHour(name: BucketName, field: "start_balance_hours" | "accrual_hours" | "cap_hours"): void {
    const next = commitHour(this.drafts[name][field], this.stored[name]?.[field] ?? null, this.edited[name].has(field));
    this.drafts[name][field] = next.text;
    this.notes.update((notes) => ({ ...notes, [field]: next.note }));
  }

  private previewInput() {
    const board = this.data();
    const bucket = this.entryBucket;
    const row = board?.buckets?.[bucket];
    return {
      start_date: this.leave.start_date,
      end_date: this.leave.end_date,
      days: this.leave.days,
      bucket,
      hours_per_day: board?.hours_per_day || "",
      policy: row
        ? {
            configured: !!row.configured,
            start_balance_hours: row.start_balance_hours || "",
            balance_as_of: row.balance_as_of || "",
            accrual_hours: row.accrual_hours || "",
            accrual_cadence: row.accrual_cadence || "",
            cap_hours: row.cap_hours || "",
            year_start: row.year_start || "",
            carry_forward: row.carry_forward !== false,
          }
        : null,
      entries: (board?.entries || []).map((entry) => ({
        id: entry.id,
        bucket: entry.bucket || "pto",
        start_date: entry.start_date,
        end_date: entry.end_date,
        days: entry.days,
      })),
    };
  }

  private dropStalePreview(): void {
    if (this.forecastFor() !== previewKey(this.previewInput())) {
      this.forecast.set(null);
      this.forecastFor.set("");
    }
  }

  private focusPolicy(field: string): void {
    const root = document.querySelector(".pto-page");
    const map: Record<string, string> = {
      start_balance_hours: "start",
      balance_as_of: "asof",
      accrual_hours: "accrual",
      accrual_cadence: "cadence",
      accrual_mode: "accrual-mode",
      accrual_anchor: "anchor",
      cap_hours: "cap",
      year_start: "year-month",
      carry_forward: "carry-forward",
    };
    const name = map[field];
    const node = root?.querySelector<HTMLElement>(`[name="${name}"]`);
    node?.focus();
  }

  private restoreFocus(name: BucketName): void {
    if (this.returnFocus?.isConnected) {
      this.returnFocus.focus();
      return;
    }
    document.querySelector<HTMLElement>(`[aria-label="Edit ${bucketLabel(name)}"]`)?.focus();
  }
}

function blankDraft(today: string): PolicyDraft {
  return {
    start_balance_hours: "",
    balance_as_of: today,
    accrual_hours: "",
    accrual_cadence: "monthly",
    cap_hours: "",
    year_month: "01",
    year_day: "01",
    carry_forward: true,
    accrual_mode: "daily",
    accrual_anchor: "",
    accrual_version: 0,
  };
}

function fromBucket(row: BucketState | null, today: string): PolicyDraft {
  if (!row?.configured) return blankDraft(today);
  const [year_month, year_day] = (row.year_start || "01-01").split("-");
  return {
    start_balance_hours: row.start_balance_hours || "",
    balance_as_of: row.balance_as_of || today,
    accrual_hours: row.accrual_hours || "",
    accrual_cadence: row.accrual_cadence || "monthly",
    cap_hours: row.cap_hours || "",
    year_month: year_month || "01",
    year_day: year_day || "01",
    carry_forward: row.carry_forward !== false,
    accrual_mode: row.accrual_mode === "scheduled" ? "scheduled" : "daily",
    accrual_anchor: row.accrual_anchor || "",
    accrual_version: Number.isInteger(row.accrual_version) && (row.accrual_version ?? 0) >= 0
      ? row.accrual_version ?? 0
      : 0,
  };
}

function storedOf(row: BucketState | null): Record<string, string> | null {
  if (!row?.configured) return null;
  return {
    start_balance_hours: row.start_balance_hours || "",
    balance_as_of: row.balance_as_of || "",
    accrual_hours: row.accrual_hours || "",
    accrual_cadence: row.accrual_cadence || "",
    cap_hours: row.cap_hours || "",
    year_start: row.year_start || "",
    accrual_mode: row.accrual_mode === "scheduled" ? "scheduled" : "daily",
    accrual_anchor: row.accrual_anchor || "",
  };
}

