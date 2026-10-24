import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastService, UiButtonComponent, UiInputComponent } from '@vivek/ui';
import { AuthService } from '../auth/auth.service';
import { UsernameChangeError } from '../auth/username-change';

@Component({
  selector: 'app-username-change',
  standalone: true,
  imports: [FormsModule, UiButtonComponent, UiInputComponent],
  templateUrl: './username-change.component.html',
  styleUrl: './username-change.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsernameChangeComponent {
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly cdr = inject(ChangeDetectorRef);

  nextName = '';
  /** Form field only. Cleared when Save runs, before the request returns. */
  passphrase = '';
  saving = false;
  error = '';
  errorStatus = 0;

  async save(): Promise<void> {
    if (this.saving) return;
    const passphrase = this.passphrase;
    this.passphrase = '';
    this.error = '';
    this.errorStatus = 0;
    if (!passphrase) {
      this.error = 'Enter your current passphrase.';
      this.cdr.markForCheck();
      return;
    }
    this.saving = true;
    this.cdr.markForCheck();
    try {
      await this.auth.changeUsername(this.nextName, passphrase);
      this.nextName = '';
      this.toast.success('Username updated.');
    } catch (err) {
      this.errorStatus = err instanceof UsernameChangeError ? err.status : 0;
      this.error = err instanceof Error ? err.message : 'The username could not be changed.';
    } finally {
      this.passphrase = '';
      this.saving = false;
      this.cdr.markForCheck();
    }
  }
}
