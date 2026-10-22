import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { authPath, continueAfterAuth } from './after-auth';
import { AuthService } from './auth.service';
import { UiButtonComponent, UiCardComponent, UiInputComponent } from '@vivek/ui';

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

  email = '';
  username = '';
  displayName = '';
  password = '';
  /** New vault passphrase during one-time password→passwordless migration. */
  vaultPassphrase = '';
  setupMode = false;
  legacyMode = false;
  loading = false;
  error = '';

  pageHref(page: 'login' | 'signup'): string {
    return authPath(page);
  }

  ngOnInit(): void {
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
  }

  submit(): void {
    if (!this.canSubmit) return;
    this.loading = true;
    this.error = '';
    this.cdr.markForCheck();
    if (this.setupMode) {
      this.auth.bootstrapPasswordless(this.username, this.displayName, this.password).then(
        () => {
          this.loading = false;
          this.cdr.markForCheck();
          return continueAfterAuth(this.router);
        },
        err => {
          this.error = this.errorMessage(err);
          this.loading = false;
          this.cdr.markForCheck();
        }
      );
      return;
    }
    if (!this.legacyMode) {
      this.auth.loginWithVault(this.username, this.password).then(
        () => {
          this.loading = false;
          this.cdr.markForCheck();
          return continueAfterAuth(this.router);
        },
        err => {
          this.error = this.errorMessage(err);
          this.loading = false;
          this.cdr.markForCheck();
        }
      );
      return;
    }
    this.auth.login(this.email, this.password).subscribe({
      next: () => {
        this.auth
          .enrollPasswordless(this.username, this.vaultPassphrase)
          .then(() => {
            this.loading = false;
            this.cdr.markForCheck();
            return continueAfterAuth(this.router);
          })
          .catch(err => {
            this.error = this.errorMessage(err);
            this.loading = false;
            this.cdr.markForCheck();
          });
      },
      error: err => {
        this.error = this.errorMessage(err);
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  toggleLegacyMode(): void {
    this.legacyMode = !this.legacyMode;
    this.error = '';
  }

  get needsDisplayName(): boolean {
    return this.setupMode;
  }

  get canSubmit(): boolean {
    if (this.loading || !(this.legacyMode ? this.email.trim() : this.username.trim()) || !this.password) {
      return false;
    }
    if (this.needsDisplayName && !this.displayName.trim()) return false;
    if (this.legacyMode) {
      if (!this.username.trim() || this.vaultPassphrase.length < 12) return false;
    }
    if (this.needsDisplayName && this.password.length < 12) return false;
    return true;
  }

  get passwordHint(): string {
    if (this.needsDisplayName) {
      return 'Use at least 12 characters. Your passphrase signs in and unlocks your vault.';
    }
    if (this.legacyMode) {
      return 'Enter your old credentials, then choose a username and a new passphrase (12+ characters).';
    }
    return 'Use your username or the email linked to your account.';
  }

  private errorMessage(err: any): string {
    if (err instanceof Error && err.message) return err.message;
    const detail = err?.error?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && detail.length) {
      return detail
        .map(item => {
          const field = Array.isArray(item?.loc) ? item.loc[item.loc.length - 1] : null;
          const message = item?.msg || 'Invalid value';
          return field ? `${field}: ${message}` : message;
        })
        .join('; ');
    }
    return this.setupMode ? 'Setup failed' : this.legacyMode ? 'Login failed' : 'Vault authentication failed';
  }
}
