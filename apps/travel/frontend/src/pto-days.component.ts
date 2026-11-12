import { ChangeDetectionStrategy, Component, input, output } from "@angular/core";
import { formatDay } from "@vivek/browser";
import {
  ALLOCATION_CHOICES,
  allocationDraft,
  allocationText,
} from "./pto-model.mjs";

/** One Full/Half/None day control. Both trip forms use this. */
@Component({
  selector: "travel-pto-days",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pto-dates">
      @for (day of dates(); track day) {
        <div class="pto-day">
          <span class="pto-day-date" [id]="'pto-date-' + day">{{
            dayLabel(day)
          }}</span>
          <div
            class="pto-choices"
            role="radiogroup"
            [attr.aria-labelledby]="'pto-date-' + day"
          >
            @for (choice of choices; track choice.id) {
              <label class="pto-choice">
                <input
                  type="radio"
                  [name]="'pto-' + day"
                  [value]="choice.amount"
                  [checked]="amountFor(day) === choice.amount"
                  (change)="choose(day, choice.amount)"
                />
                <span>{{ choice.label }}</span>
              </label>
            }
            @if (exactFor(day); as exact) {
              <label class="pto-choice">
                <input
                  type="radio"
                  [name]="'pto-' + day"
                  [value]="exact"
                  checked
                  (change)="choose(day, exact)"
                />
                <span>{{ exact }}</span>
              </label>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class PtoDaysComponent {
  readonly dates = input.required<readonly string[]>();
  readonly amounts = input.required<Readonly<Record<string, string>>>();
  readonly picked = output<{ on_date: string; amount: string }>();
  readonly choices = ALLOCATION_CHOICES;

  dayLabel(day: string): string {
    return formatDay(day);
  }

  amountFor(day: string): string {
    return allocationText(this.amounts()[day] ?? "0");
  }

  exactFor(day: string): string {
    const row = allocationDraft([day], this.amounts()).rows[0];
    return row && row.choice === "exact" ? row.label : "";
  }

  choose(day: string, amount: string): void {
    this.picked.emit({ on_date: day, amount: allocationText(amount) });
  }
}
