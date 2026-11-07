import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, OnInit, ViewChild, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ConfirmService, ToastService, UiButtonComponent, UiCardComponent, silentErrorToast } from '@vivek/ui';

export interface BirthdayView {
  birthday: string | null;
  show_age: boolean;
}

/** Verbatim server copy (apps/server/identity/birthday.py). Client checks
 * mirror the route so the same words appear without a round trip; a server
 * 422 still wins and is shown as-is. */
export const MSG_FULL_DATE = 'Enter a full date.';
export const MSG_YEAR = 'Enter a year after 1900.';
export const MSG_FUTURE = "Birthday can't be in the future.";

const FULL_ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EARLIEST_MS = Date.UTC(1900, 0, 1);
const DAY_MS = 86_400_000;

/** The route allows one extra day of timezone slack; mirror it. */
export function validateBirthday(value: string, today: Date): string | null {
  if (!FULL_ISO_DATE.test(value)) return MSG_FULL_DATE;
  const [year, month, day] = value.split('-').map(Number);
  const ms = Date.UTC(year, month - 1, day);
  const parsed = new Date(ms);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    return MSG_FULL_DATE;
  }
  if (ms < EARLIEST_MS) return MSG_YEAR;
  const todayMs = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  if (ms > todayMs + DAY_MS) return MSG_FUTURE;
  return null;
}

@Component({
  selector: 'app-profile-settings',
  standalone: true,
  imports: [UiButtonComponent, UiCardComponent],
  templateUrl: './profile-settings.component.html',
  styleUrl: './profile-settings.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileSettingsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly cdr = inject(ChangeDetectorRef);

  birthdayInput = '';
  showAge = false;
  savedBirthday: string | null = null;
  loading = true;
  saving = false;
  error = '';
  invalid = false;

  @ViewChild('birthdayField') private birthdayField?: ElementRef<HTMLInputElement>;
  @ViewChild('birthdayAlert') private birthdayAlert?: ElementRef<HTMLElement>;

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const view = await firstValueFrom(
        this.http.get<BirthdayView>('/api/account/birthday', { withCredentials: true, context: silentErrorToast() }),
      );
      this.savedBirthday = view.birthday;
      this.birthdayInput = view.birthday ?? '';
      this.showAge = view.show_age;
    } catch {
      this.error = "Birthday couldn't be loaded.";
      this.invalid = false;
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  async save(): Promise<void> {
    if (this.saving) return;
    const problem = validateBirthday(this.birthdayInput, new Date());
    if (problem) {
      this.showError(problem, true);
      return;
    }
    await this.patch(this.birthdayInput, 'Birthday saved.');
  }

  async remove(): Promise<void> {
    if (this.saving || !this.savedBirthday) return;
    const confirmed = await this.confirm.ask(
      'Remove birthday?',
      'Your birthday will be removed, and your age will no longer show on Life in Pixels.',
      'Remove',
    );
    if (!confirmed) return;
    await this.patch(null, 'Birthday removed.');
  }

  private async patch(birthday: string | null, successToast: string): Promise<void> {
    this.saving = true;
    this.error = '';
    this.invalid = false;
    this.cdr.markForCheck();
    try {
      const view = await firstValueFrom(
        this.http.patch<BirthdayView>(
          '/api/account/birthday',
          { birthday, show_age: this.showAge },
          { withCredentials: true, context: silentErrorToast() },
        ),
      );
      this.savedBirthday = view.birthday;
      this.birthdayInput = view.birthday ?? '';
      this.showAge = view.show_age;
      // The toast names the action only; it never echoes the date.
      this.toast.success(successToast);
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 422 && typeof err.error?.detail === 'string') {
        this.showError(err.error.detail, true);
      } else {
        this.showError("Birthday couldn't be saved.", false);
      }
    } finally {
      this.saving = false;
      this.cdr.markForCheck();
    }
  }

  private showError(message: string, fieldFault: boolean): void {
    this.error = message;
    this.invalid = fieldFault;
    this.cdr.detectChanges();
    if (fieldFault) this.birthdayField?.nativeElement.focus();
    else this.birthdayAlert?.nativeElement.focus();
  }
}
