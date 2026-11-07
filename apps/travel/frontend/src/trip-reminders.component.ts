import { NgTemplateOutlet } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  computed,
  effect,
  input,
  output,
  signal,
  viewChild,
} from "@angular/core";
import { formatDay, formatRelativeDay } from "@vivek/browser";
import { UiBadgeComponent, UiButtonComponent } from "@vivek/ui";
import {
  dueParts,
  groupReminders,
  isOverdue,
  validateTitle,
} from "./reminders.mjs";
import type { Trip } from "./travel.models";

type Reminder = Trip["reminders"][number];

export interface ReminderToggle {
  reminder: Reminder;
  revert: () => void;
}

export interface ReminderAdd {
  title: string;
  revert: () => void;
}

/**
 * "Now" as a naive local wall-time string, built from the browser's local
 * clock (the local / America/Los_Angeles calendar day the user is in —
 * owner decision on #113) and sliced to minutes. Never a server date:
 * groupReminders compares local strings on both sides.
 */
function localNowMinute(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

@Component({
  selector: "travel-trip-reminders",
  standalone: true,
  imports: [NgTemplateOutlet, UiBadgeComponent, UiButtonComponent],
  template: `
    <section class="surface trip-reminders" aria-labelledby="reminders-heading">
      <h2 id="reminders-heading">Reminders</h2>

      <ng-template #reminderRow let-r>
        <li>
          <article class="trip-row reminder-row" [class.is-done]="r.done">
            <div class="reminder-main">
              <input
                type="checkbox"
                class="reminder-check"
                [id]="'reminder-' + r.id"
                [checked]="r.done"
                [attr.aria-describedby]="'reminder-due-' + r.id"
                (change)="toggleRow(r, $event)"
              />
              <div class="reminder-text">
                <label [for]="'reminder-' + r.id">{{ r.title }}</label>
                <p class="reminder-due" [id]="'reminder-due-' + r.id">
                  @if (duePartsFor(r)) {
                    @if (overdue(r)) {
                      <ui-badge variant="danger">Overdue</ui-badge>
                    }
                    {{ dueText(r) }}
                  }
                </p>
              </div>
            </div>
            <ui-button
              variant="ghost"
              size="sm"
              [disabled]="busy()"
              (clicked)="removeReminder.emit(r)"
              >Remove</ui-button
            >
          </article>
        </li>
      </ng-template>

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
        <ui-button
          type="submit"
          variant="secondary"
          size="sm"
          [busy]="busy()"
          >Add to list</ui-button
        >
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

      @if (view().soon.length) {
        <h3>Due soon</h3>
        <ul class="reminder-list">
          @for (r of view().soon; track r.id) {
            <ng-container
              *ngTemplateOutlet="reminderRow; context: { $implicit: r }"
            />
          }
        </ul>
      }
      @if (view().later.length) {
        @if (view().soon.length) {
          <h3>Later</h3>
        }
        <ul class="reminder-list">
          @for (r of view().later; track r.id) {
            <ng-container
              *ngTemplateOutlet="reminderRow; context: { $implicit: r }"
            />
          }
        </ul>
      }
      @if (view().done.length) {
        <h3>Done</h3>
        <ul class="reminder-list">
          @for (r of view().done; track r.id) {
            <ng-container
              *ngTemplateOutlet="reminderRow; context: { $implicit: r }"
            />
          }
        </ul>
      }
    </section>
  `,
  styleUrl: "./trip-reminders.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TripRemindersComponent implements OnInit, OnDestroy {
  readonly reminders = input.required<readonly Reminder[]>();
  readonly busy = input(false);

  readonly toggle = output<ReminderToggle>();
  readonly add = output<ReminderAdd>();
  readonly removeReminder = output<Reminder>();

  readonly pending = signal<Map<number, boolean>>(new Map());
  readonly draft = signal("");
  readonly draftError = signal("");
  readonly now = signal(localNowMinute());

  private readonly inputEl =
    viewChild<ElementRef<HTMLInputElement>>("reminderInput");
  private timer?: ReturnType<typeof setInterval>;
  private readonly timeFormat = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  readonly view = computed(() => {
    const pending = this.pending();
    const applied = this.reminders().map((reminder) =>
      pending.has(reminder.id)
        ? { ...reminder, done: pending.get(reminder.id) as boolean }
        : reminder,
    );
    return groupReminders(applied, this.now());
  });

  constructor() {
    // The parent's load() replaces the reminders array after every save;
    // that new reference is the signal that optimistic state is settled.
    effect(() => {
      this.reminders();
      this.pending.set(new Map());
    });
  }

  ngOnInit(): void {
    this.now.set(localNowMinute());
    this.timer = setInterval(() => this.now.set(localNowMinute()), 60_000);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  toggleRow(reminder: Reminder, event: Event): void {
    if (this.busy()) {
      // mutate drops calls while saving, so the toggle reverts at once.
      const input = event.target;
      if (input instanceof HTMLInputElement) input.checked = reminder.done;
      return;
    }
    const next = new Map(this.pending());
    next.set(reminder.id, !reminder.done);
    this.pending.set(next);
    this.toggle.emit({
      reminder,
      revert: () => {
        const restored = new Map(this.pending());
        restored.delete(reminder.id);
        this.pending.set(restored);
      },
    });
  }

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
        this.draft.set(title);
        this.draftError.set("Couldn't add that reminder. Try again.");
      },
    });
    // Optimistic: clear immediately and keep focus in the input.
    this.draft.set("");
    this.focusInput();
  }

  duePartsFor(reminder: Reminder): { date: string; time: string | null } | null {
    return dueParts(reminder.due_at);
  }

  overdue(reminder: Reminder): boolean {
    return isOverdue(reminder, this.now());
  }

  dueText(reminder: Reminder): string {
    const parts = dueParts(reminder.due_at);
    if (!parts) return "";
    const relative = formatRelativeDay(parts.date);
    let text =
      relative === "Today" || relative === "Tomorrow"
        ? relative
        : relative === "1 day ago"
          ? "Yesterday"
          : formatDay(parts.date);
    if (parts.time) {
      const [year, month, day] = parts.date.split("-").map(Number);
      const [hour, minute] = parts.time.split(":").map(Number);
      text +=
        " · " + this.timeFormat.format(new Date(year, month - 1, day, hour, minute));
    }
    if (reminder.kind) text += " · " + reminder.kind;
    return text;
  }

  private focusInput(): void {
    this.inputEl()?.nativeElement.focus();
  }
}
