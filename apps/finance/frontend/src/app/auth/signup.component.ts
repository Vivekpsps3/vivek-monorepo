import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { authPath, continueAfterAuth } from './after-auth';
import { AuthService } from './auth.service';
import { UiButtonComponent, UiCardComponent, UiInputComponent } from '@vivek/ui';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [FormsModule, UiButtonComponent, UiCardComponent, UiInputComponent],
  templateUrl: './signup.component.html',
  styleUrl: './login.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignupComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  username = '';
  password = '';
  loading = false;
  error = '';

  pageHref(page: 'login' | 'signup'): string {
    return authPath(page);
  }

  submit(): void {
    if (this.loading) return;
    const validationError = this.validationError();
    if (validationError) {
      this.error = validationError;
      this.cdr.markForCheck();
      return;
    }

    this.loading = true;
    this.error = '';
    this.cdr.markForCheck();
    this.auth.signupPasswordless(this.username, this.password).then(
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

  private validationError(): string | null {
    const username = this.username.trim();
    if (!username) return 'Enter a username.';
    if (!/^[a-zA-Z0-9_.-]{3,64}$/.test(username)) {
      return 'Username must be 3–64 letters, numbers, dots, underscores, or hyphens.';
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
