import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { authNavigation } from './after-auth';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase());
  const headers = mutating && auth.csrfToken ? req.headers.set('X-CSRF-Token', auth.csrfToken) : req.headers;
  const authReq = req.clone({ withCredentials: true, headers });
  return next(authReq).pipe(
    catchError((err: HttpErrorResponse) => {
      const isAuthAttempt =
        req.url.includes('/auth/login') ||
        req.url.includes('/auth/passwordless') ||
        req.url.includes('/auth/bootstrap') ||
        req.url.includes('/auth/signup') ||
        req.url.includes('/auth/invitations') ||
        req.url.includes('/account/username') ||
        req.url.includes('/health');
      if (err.status === 401 && !isAuthAttempt) {
        auth.clearLocalSession();
        authNavigation.goToLogin();
      }
      return throwError(() => err);
    })
  );
};
