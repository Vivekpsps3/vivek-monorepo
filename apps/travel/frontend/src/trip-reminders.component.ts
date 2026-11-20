import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
} from "@angular/core";
import { UiButtonComponent } from "@vivek/ui";
import { validateTitle } from "./reminders.mjs";
import type { Trip } from "./travel.models";

type Reminder = Trip["reminders"][number];

export interface ReminderAdd {
  title: string;
  revert: () => void;
}

@Component({
  selector: "travel-trip-reminders",
  standalone: true,
  imports: [UiButtonComponent],
  template: `
    <section class="surface trip-reminders" aria-labelledby="reminders-heading">
      <h2 id="reminders-heading">Reminders</h2>
      <form class="reminder-add" novalidate (submit)="submit($event)">
        <label for="new-reminder">New reminder</label>
        <input
          id="new-reminder"
          #reminderInput
          name="new-reminder"
          maxlength="400"
          placeholder="Book the airport shuttle"
          autocomplete="off"
          [value]="draft()"
          (input)="onDraft($event)"
          [attr.aria-invalid]="draftError() ? 'true' : null"
          [attr.aria-describedby]="draftError() ? 'new-reminder-error' : null"
        />
        <ui-button type="submit" variant="secondary" size="sm" [busy]="busy()">
          Add to list
        </ui-button>
        @if (draftError()) {
          <p id="new-reminder-error" class="field-error" role="alert">
            {{ draftError() }}
          </p>
        }
      </form>
      @if (!reminders().length) {
        <p class="muted">
          No reminders yet. Add the things you don't want to forget.
        </p>
      }
    </section>
  `,
  styleUrl: "./trip-reminders.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TripRemindersComponent {
  readonly reminders = input.required<readonly Reminder[]>();
  readonly busy = input(false);
  readonly add = output<ReminderAdd>();

  readonly draft = signal("");
  readonly draftError = signal("");
  private readonly inputEl = viewChild<ElementRef<HTMLInputElement>>("reminderInput");

  onDraft(event: Event): void {
    const input = event.target;
    if (input instanceof HTMLInputElement) this.draft.set(input.value);
    if (this.draftError()) this.draftError.set("");
  }

  submit(event: Event): void {
    event.preventDefault();
    if (this.busy()) return;
    const error = validateTitle(this.draft());
    if (error) {
      this.draftError.set(error);
      this.focusInput();
      return;
    }
    const title = this.draft().trim();
    this.draftError.set("");
    this.add.emit({
      title,
      revert: () => {
        if (!this.draft()) {
          this.draft.set(title);
          this.draftError.set("Couldn't add that reminder. Try again.");
        }
      },
    });
    this.draft.set("");
    this.focusInput();
  }

  private focusInput(): void {
    this.inputEl()?.nativeElement.focus();
  }
}
