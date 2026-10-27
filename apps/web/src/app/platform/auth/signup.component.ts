import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
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
    this.loading = true;
    this.auth.previewInvitation(this.inviteToken).then(
      preview => {
        this.username = preview.username;
        this.inviteName = preview.display_name;
        this.loading = false;
        this.cdr.markForCheck();
      },
      () => {
        this.error = 'This enrollment link is invalid or expired. Ask an admin for a new one.';
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
    if (this.inviteToken && !this.username.trim()) return;
    if (!this.inviteToken && this.policy?.mode === 'closed') return;
    const validationError = this.validationError();
    if (validationError) {
      this.error = validationError;
      this.cdr.markForCheck();
      return;
    }

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
        this.error = this.errorMessage(err);
        this.loading = false;
        this.clearProgress();
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

  private validationError(): string | null {
    if (this.inviteToken && this.error && !this.username) return this.error;
    if (!this.inviteToken) {
      const name = this.displayName.trim().replace(/\s+/g, ' ');
      if (!name) return 'Enter a name.';
      if (name.length > 160) return 'Name must be 160 characters or fewer.';
    }
    const username = this.username.trim();
    if (!username) return this.inviteToken ? 'This enrollment link is invalid or expired. Ask an admin for a new one.' : 'Enter a username.';
    if (!/^[a-zA-Z0-9_.-]{3,64}$/.test(username)) {
      return 'Username must be 3–64 letters, numbers, dots, underscores, or hyphens.';
    }
    if (this.policy?.invite_code_required && !this.inviteCode.trim()) {
      return 'Enter the invite code from your administrator.';
    }
    if (this.password.length < 12) {
      return 'Vault passphrase must be at least 12 characters.';
    }
    return null;
  }

  private errorMessage(err: any): string {
    const detail = err?.error?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && detail.length) {
      return detail
        .map((item: any) => {
          const field = Array.isArray(item?.loc) ? item.loc[item.loc.length - 1] : null;
          const message = item?.msg || 'Invalid value';
          return field ? `${field}: ${message}` : message;
        })
        .join('; ');
    }
    if (err instanceof Error && err.message) return err.message;
    return 'Sign up failed';
  }
}
