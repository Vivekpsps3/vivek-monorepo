import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, inject, OnInit, ViewChild } from '@angular/core';
import { usernameForStorage } from '@vivek/auth';
import { accountErrorField, accountErrorMessage, PASSPHRASE_HINT, USERNAME_HINT } from './account-error';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { authPath, continueAfterAuth } from '@vivek/ui';
import { AuthService } from './auth.service';
import { takeSessionEndedCopy } from './session-ended';
import { ToastService, UiButtonComponent, UiCardComponent, UiInputComponent } from '@vivek/ui';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, UiButtonComponent, UiCardComponent, UiInputComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private toast = inject(ToastService);

  username = '';
  displayName = '';
  password = '';
  setupMode = false;
  showSignup = false;
  loading = false;
  error = '';
  invalidField = '';
  readonly usernameHint = USERNAME_HINT;
  @ViewChild('usernameField') private usernameField?: UiInputComponent;
  @ViewChild('nameField') private nameField?: UiInputComponent;
  @ViewChild('passwordField') private passwordField?: UiInputComponent;

  clearFieldError(field: string): void {
    if (this.invalidField === field) { this.error = ''; this.invalidField = ''; }
  }

  private showError(message: string, field = ''): void {
    if (this.destroyRef.destroyed) return;
    this.error = message;
    this.invalidField = field;
    this.cdr.detectChanges();
    if (field === 'username') this.usernameField?.focus();
    if (field === 'name') this.nameField?.focus();
    if (field === 'password') this.passwordField?.focus();
  }

  pageHref(page: 'login' | 'signup'): string {
    return authPath(page);
  }

  ngOnInit(): void {
    const ended = takeSessionEndedCopy();
    if (ended) this.toast.info(ended);
    this.auth.bootstrapStatus().subscribe({
      next: status => {
        this.setupMode = status.needs_setup;
        this.cdr.markForCheck();
      },
      error: () => {
        this.setupMode = false;
        this.cdr.markForCheck();
      },
    });
    this.auth.signupPolicy().then(
      policy => {
        this.showSignup = policy.mode !== 'closed';
        this.cdr.markForCheck();
      },
      () => {
        this.showSignup = false;
        this.cdr.markForCheck();
      }
    );
  }

  submit(): void {
    if (this.loading) return;
    if (!this.username.trim()) {
      this.showError('Enter your username, not your email.', 'username');
      return;
    }
    if (this.setupMode && !usernameForStorage(this.username.trim())) {
      this.showError(`Username must be ${USERNAME_HINT}`, 'username');
      return;
    }
    if (this.setupMode && (!this.displayName.trim() || this.displayName.trim().length > 160)) {
      this.showError('Enter a display name of 1–160 characters.', 'name');
      return;
    }
    if (!this.password || (this.setupMode && this.password.length < 12)) {
      this.showError(this.setupMode ? PASSPHRASE_HINT : 'Enter your vault passphrase.', 'password');
      return;
    }
    this.invalidField = '';
    this.loading = true;
    this.error = '';
    this.cdr.markForCheck();
    const pending = this.setupMode
      ? this.auth.bootstrapPasswordless(this.username, this.displayName, this.password)
      : this.auth.loginWithVault(this.username, this.password);
    pending.then(
      () => {
        this.loading = false;
        this.cdr.markForCheck();
        return continueAfterAuth(this.router);
      },
      err => {
        this.loading = false;
        this.showError(accountErrorMessage(err, 'login'), accountErrorField(err));
        this.cdr.markForCheck();
      }
    );
  }

  get needsDisplayName(): boolean {
    return this.setupMode;
  }

  get passwordHint(): string {
    if (this.needsDisplayName) {
      return PASSPHRASE_HINT;
    }
    return 'Use your enrolled username.';
  }

}
