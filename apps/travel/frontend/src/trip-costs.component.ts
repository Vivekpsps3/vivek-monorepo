import { NgTemplateOutlet } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { RouterLink } from "@angular/router";
import { formatMoney } from "@vivek/browser";
import {
  FinanceTripSpendRegistry,
  SESSION_CONTEXT,
  UiBadgeComponent,
  UiButtonComponent,
  UiIconComponent,
  UiMenuComponent,
  UiMenuItemDirective,
} from "@vivek/ui";
import { TripCostLinkConfirm, TripCostLinkStore } from "./trip-cost-links";
import {
  BUCKET_SHORT,
  bucketForCategory,
  bucketRows,
  countLabel,
  countedCents,
  linkChoices,
  linkedPostingMissing,
  reconcileStages,
  settleCostLink,
  spendState,
  splitWidths,
  type CostLinkRef,
  type CostStage,
  type SpendState,
  type TripSpendPosting,
  type TripSpendRow,
} from "./trip-costs.mjs";
import type { CostBucket, Trip } from "./travel.models";

type Budget = Trip["budget"];
type CurrencyItem = Trip["budget"]["currencies"][number];
type ManualLine = Trip["budget"]["manual"][number];
type CostLine = Trip["budget"]["lines"][number];

interface LinkDraft {
  epoch: number;
  source: string;
  sourceId: number;
  transactionId: number;
}

@Component({
  selector: "travel-trip-costs",
  standalone: true,
  imports: [
    NgTemplateOutlet,
    RouterLink,
    UiBadgeComponent,
    UiButtonComponent,
    UiIconComponent,
    UiMenuComponent,
    UiMenuItemDirective,
  ],
  template: `
    <section class="surface trip-costs" aria-labelledby="trip-costs-heading">
      <h2 id="trip-costs-heading">Trip costs</h2>
      @for (item of budget().currencies; track item.currency) {
        <div class="cost-currency">
          <p class="eyebrow">{{ item.currency }} total</p>
          <p class="cost-total num">
            {{ formatMoney(item.total_cents, { currency: item.currency }) }}
          </p>
          @if (splitFor(item); as widths) {
            <div class="cost-split" aria-hidden="true">
              <span
                class="cost-split-paid"
                [style.width.%]="widths.paid"
              ></span>
              <span
                class="cost-split-unpaid"
                [style.width.%]="widths.unpaid"
              ></span>
            </div>
          }
          <ul class="cost-legend">
            <li>
              <span class="swatch swatch--paid" aria-hidden="true"></span>Paid
              <span class="num">{{
                formatMoney(item.paid_cents, { currency: item.currency })
              }}</span>
            </li>
            <li>
              <span class="swatch swatch--unpaid" aria-hidden="true"></span
              >Unpaid
              <span class="num">{{
                formatMoney(item.unpaid_cents, { currency: item.currency })
              }}</span>
            </li>
          </ul>
          <table class="cost-table">
            <caption class="visually-hidden">
              {{
                item.currency
              }}
              costs by category
            </caption>
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col" class="num">Amount</th>
                <th scope="col" class="num">Paid</th>
              </tr>
            </thead>
            <tbody>
              @for (row of rowsFor(item); track row.bucket) {
                <tr>
                  <th scope="row">{{ row.label }}</th>
                  <td class="num">
                    {{
                      formatMoney(row.total_cents, { currency: item.currency })
                    }}
                  </td>
                  <td class="num">
                    {{
                      formatMoney(row.paid_cents, { currency: item.currency })
                    }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
          @if (stageFor(item); as stage) {
            <dl class="cost-stages">
              <div>
                <dt>Planned</dt>
                <dd class="num">
                  {{ formatMoney(stage.planned, { currency: item.currency }) }}
                </dd>
              </div>
              <div>
                <dt>Booked</dt>
                <dd class="num">
                  {{ formatMoney(stage.booked, { currency: item.currency }) }}
                </dd>
              </div>
              <div>
                <dt>Posted</dt>
                <dd class="num">
                  @if (stage.locked) {
                    Hidden while Finance is locked
                  } @else if (stage.posted === null) {
                    No posted {{ item.currency }}
                  } @else {
                    {{ formatMoney(stage.posted, { currency: item.currency }) }}
                  }
                </dd>
              </div>
              @if (stage.countedOnce > 0) {
                <div>
                  <dt>Counted once</dt>
                  <dd class="num">
                    {{
                      formatMoney(stage.countedOnce, { currency: item.currency })
                    }}
                  </dd>
                </div>
              }
            </dl>
            @if (stage.countedOnce > 0) {
              <p class="muted cost-stage-note">
                The linked booked cost and posted transaction are one payment.
              </p>
            }
          }
          @if (bookedLines(item.currency).length) {
            <ul class="cost-booked">
              @for (line of bookedLines(item.currency); track line.source + ':' + line.source_id) {
                <li class="cost-booked-row">
                  <span class="cost-booked-label">{{ line.label }}</span>
                  <span class="num">{{
                    formatMoney(line.amount_cents, { currency: line.currency })
                  }}</span>
                  <ng-container
                    [ngTemplateOutlet]="costLink"
                    [ngTemplateOutletContext]="{ $implicit: line }"
                  />
                </li>
              }
            </ul>
          }
        </div>
      }
      @if (budget().currencies.length >= 2) {
        <p class="muted">
          Currencies are kept separate. Totals aren't converted.
        </p>
      }
      @if (isEmpty()) {
        <p class="muted">
          No costs yet. Add what you've booked or plan to spend.
        </p>
        <ui-button variant="secondary" size="sm" (clicked)="addCost.emit()"
          >Add a cost</ui-button
        >
      }
      <div class="cost-finance">
        @switch (spend().kind) {
          @case ("locked") {
            <p class="muted">
              <ui-icon name="lock" size="sm" />
              <a routerLink="/finance">Unlock Finance to see card spend</a>
            </p>
          }
          @case ("none") {
            <p class="muted">
              Spent in Finance: no card spend is tagged to this trip.
            </p>
          }
          @case ("some") {
            @for (row of spendRows(); track row.currency) {
              <p>
                <strong>Spent in Finance:</strong>
                <span class="num">{{
                  formatMoney(row.cents, { currency: row.currency })
                }}</span>
                · {{ countLabel(row.count) }}
              </p>
            }
            <p class="muted cost-note">
              Card spend isn't added to the trip total.
            </p>
          }
        }
      </div>
      @if (budget().manual.length) {
        <h3>Cost lines</h3>
        <ul class="cost-lines">
          @for (line of budget().manual; track line.id) {
            <li>
              <article class="trip-row">
                <div class="cost-line-main">
                  {{ line.label }}
                  <span class="num">{{
                    formatMoney(line.amount_cents, {
                      currency: line.currency,
                    })
                  }}</span>
                  · {{ bucketLabel(line) }}
                  @if (line.paid) {
                    <ui-badge variant="success">Paid</ui-badge>
                  }
                </div>
                @if (line.paid) {
                  <ng-container
                    [ngTemplateOutlet]="costLink"
                    [ngTemplateOutletContext]="{ $implicit: manualCost(line) }"
                  />
                }
                <div class="row-actions-inline row-actions--inline">
                  <ui-button
                    variant="secondary"
                    size="sm"
                    (clicked)="editCost.emit(line)"
                    >Edit cost</ui-button
                  >
                  <ui-button
                    variant="ghost"
                    size="sm"
                    [disabled]="busy()"
                    (clicked)="removeCost.emit(line)"
                    >Remove cost</ui-button
                  >
                </div>
                <ui-menu
                  class="row-actions--menu"
                  [label]="'Actions for ' + line.label"
                  [iconOnly]="true"
                >
                  <button type="button" uiMenuItem (select)="editCost.emit(line)">
                    Edit cost
                  </button>
                  <button
                    type="button"
                    uiMenuItem
                    [danger]="true"
                    [disabled]="busy()"
                    (select)="removeCost.emit(line)"
                  >
                    Remove cost
                  </button>
                </ui-menu>
              </article>
            </li>
          }
        </ul>
      }
      <ng-template #costLink let-line>
        <div class="cost-link">
          @if (liveLink(line); as link) {
            @if (postingMissing(line, link)) {
              <p role="alert" class="cost-link-error">
                That posted transaction is no longer available.
              </p>
            } @else {
              <p class="cost-link-state">{{ linkNote(line, link) }}</p>
            }
            <ui-button
              [id]="clearId(line)"
              variant="ghost"
              (clicked)="clearLink(line)"
              >Clear link</ui-button
            >
          }
          @if (canOpen(line) || showChoices(line)) {
            <ui-button
              [id]="triggerId(line)"
              variant="secondary"
              [ariaExpanded]="showChoices(line)"
              [ariaControls]="showChoices(line) ? pickerId(line) : undefined"
              (clicked)="openPicker(line)"
              >Link posted transaction</ui-button
            >
          }
          @if (showChoices(line)) {
            <div
              class="cost-link-choices"
              role="group"
              [id]="pickerId(line)"
              [attr.aria-label]="'Posted transactions for ' + line.label"
            >
              @for (posting of choices(line); track posting.id) {
                <ui-button
                  variant="secondary"
                  [disabled]="isLinking(line)"
                  [ariaLabel]="choiceName(line, posting)"
                  (clicked)="choose(line, posting.id)"
                  >{{ choiceName(line, posting) }}</ui-button
                >
              }
              <ui-button variant="ghost" (clicked)="cancel(line)">Cancel</ui-button>
            </div>
            @if (isLinking(line)) {
              <p role="status">Saving link</p>
            }
          }
          @if (lineError(line); as message) {
            <p role="alert" class="cost-link-error">{{ message }}</p>
            @if (draftFor(line)) {
              <ui-button
                [id]="retryId(line)"
                variant="secondary"
                (clicked)="retry(line)"
                >Try again</ui-button
              >
            }
          }
        </div>
      </ng-template>
    </section>
  `,
  styleUrl: "./trip-costs.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TripCostsComponent {
  readonly budget = input.required<Budget>();
  readonly tripId = input.required<number>();
  readonly busy = input(false);

  readonly addCost = output<void>();
  readonly editCost = output<ManualLine>();
  readonly removeCost = output<ManualLine>();

  readonly formatMoney = formatMoney;
  readonly countLabel = countLabel;
  private readonly tripSpend = inject(FinanceTripSpendRegistry);
  private readonly linkStore = inject(TripCostLinkStore);
  private readonly linkConfirm = inject(TripCostLinkConfirm);
  private readonly session = inject(SESSION_CONTEXT, { optional: true });
  private epoch = 0;
  private seenTrip: number | null = null;
  private readonly draft = signal<LinkDraft | null>(null);
  private readonly picker = signal<{ source: string; sourceId: number } | null>(null);
  private readonly linking = signal(false);
  private readonly linkError = signal<{ source: string; sourceId: number; message: string } | null>(null);

  constructor() {
    effect(() => {
      const tripId = this.tripId();
      const locked = this.tripSpend.lookup() == null;
      if ((this.seenTrip != null && this.seenTrip !== tripId) || locked) this.invalidateDrafts();
      this.seenTrip = tripId;
    });
    this.session?.cleared$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.invalidateDrafts();
    });
  }

  readonly isEmpty = computed(
    () => !this.budget().currencies.length && !this.budget().manual.length,
  );

  readonly spend = computed<SpendState>(() =>
    spendState(this.tripSpend.lookup(), this.tripId()),
  );

  @HostListener("document:keydown.escape", ["$event"])
  onEscape(event: Event): void {
    const open = this.picker();
    if (!open) return;
    const line = this.lineByKey(open.source, open.sourceId);
    if (!line) return;
    event.preventDefault();
    event.stopPropagation();
    this.cancel(line);
  }

  splitFor(item: CurrencyItem): { paid: number; unpaid: number } | null {
    return splitWidths(item.paid_cents, item.total_cents);
  }

  rowsFor(item: CurrencyItem): CostBucket[] {
    return bucketRows(item);
  }

  bucketLabel(line: ManualLine): string {
    return BUCKET_SHORT[bucketForCategory(line.category)];
  }

  spendRows(): TripSpendRow[] {
    const state = this.spend();
    return state.kind === "some" ? state.rows : [];
  }

  stageFor(item: CurrencyItem): CostStage {
    return reconcileStages(
      this.budget().lines,
      this.spend(),
      this.linkStore.forTrip(this.tripId()),
      item.currency,
      this.tripId(),
    );
  }

  bookedLines(currency: string): CostLine[] {
    return this.budget().lines.filter(
      (line) => line.paid && line.currency === currency && line.source !== "manual",
    );
  }

  manualCost(line: ManualLine): CostLine {
    return {
      source: "manual",
      source_id: line.id,
      category: line.category,
      label: line.label,
      amount: line.amount,
      currency: line.currency,
      paid: line.paid,
      amount_cents: line.amount_cents,
      bucket: bucketForCategory(line.category),
    };
  }

  liveLink(line: CostLine): CostLinkRef | null {
    return (
      this.linkStore
        .forTrip(this.tripId())
        .find((link) => link.source === line.source && link.sourceId === line.source_id) ?? null
    );
  }

  postingMissing(line: CostLine, link: CostLinkRef): boolean {
    return linkedPostingMissing(line, this.spend(), link);
  }

  linkNote(line: CostLine, link: CostLinkRef): string {
    const posting = this.postingsFor(line).find((row) => row.id === link.transactionId);
    const counted = posting ? countedCents(line.amount_cents, posting.cents) : 0;
    return counted > 0 ? "Linked · counted once" : "Linked";
  }

  choices(line: CostLine): TripSpendPosting[] {
    return linkChoices(this.postingsFor(line), this.linkStore.forTrip(this.tripId()), line);
  }

  choiceName(line: CostLine, posting: TripSpendPosting): string {
    return `${posting.label} ${formatMoney(posting.cents, { currency: line.currency })}`;
  }

  canOpen(line: CostLine): boolean {
    if (this.spend().kind !== "some" || !line.paid) return false;
    const link = this.liveLink(line);
    if (link && !this.postingMissing(line, link)) return false;
    return this.choices(line).length > 0;
  }

  showChoices(line: CostLine): boolean {
    const open = this.picker();
    return !!open && open.source === line.source && open.sourceId === line.source_id;
  }

  isLinking(line: CostLine): boolean {
    const pending = this.draft();
    return this.linking() && !!pending && pending.source === line.source && pending.sourceId === line.source_id;
  }

  lineError(line: CostLine): string | null {
    const error = this.linkError();
    if (!error || error.source !== line.source || error.sourceId !== line.source_id) return null;
    return error.message;
  }

  draftFor(line: CostLine): LinkDraft | null {
    const pending = this.draft();
    if (!pending || pending.source !== line.source || pending.sourceId !== line.source_id) return null;
    return pending;
  }

  triggerId(line: CostLine): string {
    return `cost-link-${line.source}-${line.source_id}`;
  }

  pickerId(line: CostLine): string {
    return `cost-picker-${line.source}-${line.source_id}`;
  }

  clearId(line: CostLine): string {
    return `cost-clear-${line.source}-${line.source_id}`;
  }

  retryId(line: CostLine): string {
    return `cost-retry-${line.source}-${line.source_id}`;
  }

  openPicker(line: CostLine): void {
    if (this.showChoices(line)) return;
    this.epoch += 1;
    this.draft.set(null);
    this.linking.set(false);
    this.linkError.set(null);
    this.picker.set({ source: line.source, sourceId: line.source_id });
  }

  cancel(line: CostLine): void {
    const focusId = this.triggerId(line);
    this.epoch += 1;
    this.draft.set(null);
    this.picker.set(null);
    this.linking.set(false);
    this.linkError.set(null);
    this.restoreFocus(focusId);
  }

  choose(line: CostLine, transactionId: number): void {
    if (this.isLinking(line)) return;
    const tripId = this.tripId();
    const epoch = ++this.epoch;
    const source = line.source;
    const sourceId = line.source_id;
    this.draft.set({ epoch, source, sourceId, transactionId });
    this.picker.set({ source, sourceId });
    this.linking.set(true);
    this.linkError.set(null);
    const request = { epoch, tripId, source, sourceId, transactionId };
    void this.linkConfirm.confirm(tripId, transactionId).then(
      (result) => this.finish(request, result),
      () => this.finish(request, { status: "failed" }),
    );
  }

  retry(line: CostLine): void {
    const pending = this.draftFor(line);
    if (!pending || this.isLinking(line)) return;
    this.choose(line, pending.transactionId);
  }

  clearLink(line: CostLine): void {
    const focusId = this.triggerId(line);
    this.linkStore.forget(this.tripId(), line.source, line.source_id);
    this.linkError.set(null);
    this.restoreFocus(focusId);
  }

  private postingsFor(line: CostLine): TripSpendPosting[] {
    const state = this.spend();
    if (state.kind !== "some") return [];
    return state.rows.find((row) => row.currency === line.currency)?.postings ?? [];
  }

  private lineByKey(source: string, sourceId: number): CostLine | null {
    const booked = this.budget().lines.find((line) => line.source === source && line.source_id === sourceId);
    if (booked) return booked;
    const manual = this.budget().manual.find((line) => source === "manual" && line.id === sourceId);
    return manual ? this.manualCost(manual) : null;
  }

  private finish(
    request: { epoch: number; tripId: number; source: string; sourceId: number; transactionId: number },
    result: { status: "posted" | "missing" | "invalid" | "failed"; posting?: { id: number; cents: number; label: string } },
  ): void {
    const pending = this.draft();
    const current = pending
      ? {
          epoch: pending.epoch,
          tripId: this.tripId(),
          source: pending.source,
          sourceId: pending.sourceId,
          transactionId: pending.transactionId,
          sessionActive: this.sessionActive(),
          spendLocked: this.tripSpend.lookup() == null,
        }
      : null;
    const decision = settleCostLink(
      {
        ...request,
        status: result.status,
        posting: result.status === "posted" ? result.posting ?? null : null,
      },
      current,
    );
    if (decision.action === "drop" && !decision.clearDraft) return;
    if (decision.action === "apply" && result.status === "posted" && result.posting) {
      this.linkStore.remember({
        tripId: request.tripId,
        source: request.source,
        sourceId: request.sourceId,
        transactionId: result.posting.id,
      });
      this.draft.set(null);
      this.picker.set(null);
      this.linking.set(false);
      this.linkError.set(null);
      this.restoreFocus(`cost-clear-${request.source}-${request.sourceId}`);
      return;
    }
    if (decision.action === "keep") {
      this.linking.set(false);
      this.linkError.set({
        source: request.source,
        sourceId: request.sourceId,
        message: decision.error ?? "Couldn't save this link. Try again.",
      });
      this.restoreFocus(`cost-retry-${request.source}-${request.sourceId}`);
      return;
    }
    if (decision.clearDraft) {
      this.draft.set(null);
      this.linking.set(false);
      this.picker.set(null);
      this.linkError.set(
        decision.error
          ? { source: request.source, sourceId: request.sourceId, message: decision.error }
          : null,
      );
    }
  }

  private sessionActive(): boolean {
    if (!this.session) return true;
    return this.session.currentUser != null;
  }

  private invalidateDrafts(): void {
    this.epoch += 1;
    this.draft.set(null);
    this.picker.set(null);
    this.linking.set(false);
    this.linkError.set(null);
  }

  private restoreFocus(id: string): void {
    setTimeout(() => {
      const host = document.getElementById(id);
      const target = host instanceof HTMLButtonElement ? host : host?.querySelector("button");
      if (target instanceof HTMLElement) target.focus();
    });
  }
}
