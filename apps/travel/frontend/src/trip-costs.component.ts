import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from "@angular/core";
import { RouterLink } from "@angular/router";
import { formatMoney } from "@vivek/browser";
import {
  FinanceTripSpendRegistry,
  UiBadgeComponent,
  UiButtonComponent,
  UiIconComponent,
} from "@vivek/ui";
import {
  BUCKET_SHORT,
  bucketForCategory,
  bucketRows,
  countLabel,
  spendState,
  splitWidths,
  type SpendState,
  type TripSpendRow,
} from "./trip-costs.mjs";
import type { CostBucket, Trip } from "./travel.models";

type Budget = Trip["budget"];
type CurrencyItem = Trip["budget"]["currencies"][number];
type ManualLine = Trip["budget"]["manual"][number];

@Component({
  selector: "travel-trip-costs",
  standalone: true,
  imports: [RouterLink, UiBadgeComponent, UiButtonComponent, UiIconComponent],
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
                <div class="row-actions-inline">
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
              </article>
            </li>
          }
        </ul>
      }
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

  readonly isEmpty = computed(
    () => !this.budget().currencies.length && !this.budget().manual.length,
  );

  readonly spend = computed<SpendState>(() =>
    spendState(this.tripSpend.lookup(), this.tripId()),
  );

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
}
