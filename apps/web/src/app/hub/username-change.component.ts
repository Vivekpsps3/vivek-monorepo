import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, ViewChild, inject } from '@angular/core';
import { usernameForStorage } from '@vivek/auth';
import { USERNAME_HINT } from '../platform/auth/account-error';
import { FormsModule } from '@angular/forms';
import { ToastService, UiButtonComponent, UiInputComponent } from '@vivek/ui';
import { SessionService as AuthService } from '../platform/session.service';
import { UsernameChangeError, usernameChangeMessage } from '../platform/auth/username-change';

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
  private readonly destroyRef = inject(DestroyRef);

  nextName = '';
  /** Form field only. Cleared when Save runs, before the request returns. */
  passphrase = '';
  saving = false;
  error = '';
  errorStatus = 0;
  invalidField = '';
  readonly usernameHint = USERNAME_HINT;
  @ViewChild('usernameField') private usernameField?: UiInputComponent;
  @ViewChild('passphraseField') private passphraseField?: UiInputComponent;

  clearFieldError(field: string): void {
    if (this.invalidField === field) { this.invalidField = ''; this.error = ''; this.errorStatus = 0; }
  }

  private showError(message: string, field: string): void {
    if (this.destroyRef.destroyed) return;
    this.error = message;
    this.invalidField = field;
    this.cdr.detectChanges();
    if (field === 'username') this.usernameField?.focus();
    if (field === 'passphrase') this.passphraseField?.focus();
  }

  async save(): Promise<void> {
    if (this.saving) return;
    const passphrase = this.passphrase;
    this.passphrase = '';
    this.error = '';
    this.errorStatus = 0;
    this.invalidField = '';
    if (!usernameForStorage(this.nextName)) {
      this.showError(`Username must be ${USERNAME_HINT}`, 'username');
      return;
    }
    if (!passphrase) {
      this.showError('Enter your current passphrase.', 'passphrase');
      return;
    }
    this.saving = true;
    this.cdr.markForCheck();
    try {
      await this.auth.changeUsername(this.nextName, passphrase);
      this.nextName = '';
      if (!this.destroyRef.destroyed) this.toast.success('Username updated.');
    } catch (err) {
      this.errorStatus = err instanceof UsernameChangeError ? err.status : 0;
      this.saving = false;
      this.showError(err instanceof UsernameChangeError ? err.message : usernameChangeMessage(this.errorStatus),
        this.errorStatus === 400 || this.errorStatus === 409 ? 'username' : this.errorStatus === 401 ? 'passphrase' : '');
    } finally {
      this.passphrase = '';
      this.saving = false;
      if (!this.destroyRef.destroyed) this.cdr.markForCheck();
    }
  }
}
