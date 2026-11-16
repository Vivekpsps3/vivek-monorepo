import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, OnInit, ViewChild, inject } from '@angular/core';
import { usernameForStorage } from '@vivek/auth';
import { accountErrorField, accountErrorMessage, PASSPHRASE_HINT, USERNAME_HINT } from './account-error';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { authPath, continueAfterAuth } from '@vivek/ui';
import { SignupPolicy } from './auth.models';
import { AuthService } from './auth.service';
import { mediaSignup, signupProgress } from './signup-progress';
import { UiButtonComponent, UiCardComponent, UiInputComponent } from '@vivek/ui';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [FormsModule, UiButtonComponent, UiCardComponent, UiInputComponent],
  templateUrl: './signup.component.html',
  styleUrl: './login.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignupComponent implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);
  private progressTimers: number[] = [];

  username = '';
  displayName = '';
  password = '';
  inviteCode = '';
  inviteName = '';
  loading = false;
  error = '';
  progressNote = '';
  invalidField = '';
  inviteReady = false;
  readonly usernameHint = USERNAME_HINT;
  readonly passphraseHint = PASSPHRASE_HINT;
  @ViewChild('nameField') private nameField?: UiInputComponent;
  @ViewChild('usernameField') private usernameField?: UiInputComponent;
  @ViewChild('inviteField') private inviteField?: UiInputComponent;
  @ViewChild('passwordField') private passwordField?: UiInputComponent;

  clearFieldError(field: string): void {
    if (this.invalidField === field) { this.error = ''; this.invalidField = ''; }
  }

  private showError(message: string, field: string): void {
    if (this.destroyRef.destroyed) return;
    this.error = message;
    this.invalidField = field;
    this.cdr.detectChanges();
    if (field === 'name') this.nameField?.focus();
    if (field === 'username') this.usernameField?.focus();
    if (field === 'invite') this.inviteField?.focus();
    if (field === 'password') this.passwordField?.focus();
  }

  get idleNote(): string {
    if (this.inviteToken) return this.inviteReady ? 'Choose a passphrase to finish your account.' : this.error ? 'Enrollment unavailable.' : 'Checking your enrollment link.';
    return !this.policy ? 'Checking whether signup is open.' : this.policy.mode === 'closed' ? 'Account creation is closed.' : 'Choose your account details, then sign up.';
  }

  policy: SignupPolicy | null = null;
  readonly inviteToken = new URLSearchParams(window.location.search).get('invite') || '';
  readonly mediaNext = mediaSignup(new URLSearchParams(window.location.search).get('next'));

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => this.clearProgress());
    if (!this.inviteToken) {
      this.auth.signupPolicy().then(
        policy => {
          this.policy = policy;
          this.cdr.markForCheck();
        },
        () => {
          this.policy = { mode: 'closed', signup_open: false, invite_code_required: false };
          this.cdr.markForCheck();
        }
      );
      return;
    }
    this.loadInvitation();
  }

  loadInvitation(): void {
    if (this.loading || this.destroyRef.destroyed) return;
    this.loading = true;
    this.error = '';
    this.auth.previewInvitation(this.inviteToken).then(
      preview => {
        if (!usernameForStorage(preview.username)) {
          this.error = 'This enrollment link is invalid or expired. Ask an admin for a new one.';
          this.loading = false;
          this.cdr.markForCheck();
          return;
        }
        this.inviteReady = true;
        this.username = preview.username;
        this.inviteName = preview.display_name;
        this.loading = false;
        this.cdr.markForCheck();
      },
      (error: unknown) => {
        const status = (error as { status?: number } | null)?.status;
        this.error = status === 404 || status === 410
          ? 'This enrollment link is invalid or expired. Ask an admin for a new one.'
          : accountErrorMessage(error, 'signup');
        this.loading = false;
        this.cdr.markForCheck();
      },
    );
  }

  pageHref(page: 'login' | 'signup'): string {
    return authPath(page);
  }

  submit(): void {
    if (this.loading) return;
    if (this.inviteToken ? !this.inviteReady : !this.policy || this.policy.mode === 'closed') return;
    if (!this.inviteToken) {
      if (this.policy?.invite_code_required && !this.inviteCode.trim()) {
        this.showError('Enter the invite code from your administrator.', 'invite');
        return;
      }
      const name = this.displayName.trim().replace(/\s+/g, ' ');
      if (!name) {
        this.showError('Enter a name.', 'name');
        return;
      }
      if (name.length > 160) {
        this.showError('Name must be 160 characters or fewer.', 'name');
        return;
      }
      if (!usernameForStorage(this.username.trim())) {
        this.showError(`Username must be ${USERNAME_HINT}`, 'username');
        return;
      }
    }
    if (this.password.length < 12) {
      this.showError('Vault passphrase must be at least 12 characters.', 'password');
      return;
    }
    this.invalidField = '';

    this.loading = true;
    this.error = '';
    this.armProgress();
    this.cdr.markForCheck();
    const pending = this.inviteToken
      ? this.auth.enrollInvitation(this.inviteToken, this.password)
      : this.auth.signupPasswordless(this.username, this.password, this.displayName, this.inviteCode);
    pending.then(
      () => {
        this.loading = false;
        this.clearProgress();
        this.cdr.markForCheck();
        return continueAfterAuth(this.router);
      },
      err => {
        this.loading = false;
        this.clearProgress();
        this.showError(accountErrorMessage(err, 'signup'), this.inviteToken ? '' : accountErrorField(err));
        this.cdr.markForCheck();
      }
    );
  }

  submitLabel(): string {
    if (!this.loading) return this.inviteToken ? 'Finish account' : 'Sign up';
    return signupProgress(0).button;
  }

  private armProgress(): void {
    this.clearProgress();
    const started = Date.now();
    this.progressNote = signupProgress(0).note;
    for (const at of [5_000, 30_000]) {
      this.progressTimers.push(window.setTimeout(() => {
        this.progressNote = signupProgress(Date.now() - started).note;
        this.cdr.markForCheck();
      }, at));
    }
  }

  private clearProgress(): void {
    for (const timer of this.progressTimers) window.clearTimeout(timer);
    this.progressTimers = [];
    this.progressNote = '';
  }

}
