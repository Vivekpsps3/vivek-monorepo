import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
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
  private toast = inject(ToastService);

  username = '';
  displayName = '';
  password = '';
  setupMode = false;
  showSignup = false;
  loading = false;
  error = '';

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
    if (!this.canSubmit) {
      this.error = 'Enter the required account details.';
      this.cdr.markForCheck();
      return;
    }
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
  }

  get needsDisplayName(): boolean {
    return this.setupMode;
  }

  get canSubmit(): boolean {
    if (this.loading || !this.username.trim() || !this.password) {
      return false;
    }
    if (this.needsDisplayName && !this.displayName.trim()) return false;
    if (this.needsDisplayName && this.password.length < 12) return false;
    return true;
  }

  get passwordHint(): string {
    if (this.needsDisplayName) {
      return 'Use at least 12 characters. Your passphrase signs in and unlocks your vault.';
    }
    return 'Use your enrolled username.';
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
    return this.setupMode ? 'Setup failed' : 'Vault authentication failed';
  }
}
