import { HttpBackend, HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { authNavigation, SESSION_CONTEXT } from '@vivek/ui';
import { rememberSessionEnded } from './session-ended';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(SESSION_CONTEXT);
  const backend = inject(HttpBackend);
  const revision = auth.revision;
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
      // Username change is the excluded call that runs while signed in. Sign-in
      // 401s stay on the form: /auth/me is also 401 when nobody is signed in.
      // HttpBackend skips interceptors, so this single GET is not retried or toasted.
      if (err.status === 401 && req.url.includes('/account/username') && revision === auth.revision) {
        return new HttpClient(backend).get('/api/auth/me', { withCredentials: true }).pipe(
          catchError((probeErr: unknown) => {
            const status = probeErr instanceof HttpErrorResponse ? probeErr.status : 0;
            if (status === 401 && revision === auth.revision) {
              rememberSessionEnded();
              auth.clearLocalSession();
              authNavigation.goToLogin();
            }
            return throwError(() => err);
          }),
          switchMap(() => throwError(() => err)),
        );
      }
      if (err.status === 401 && !isAuthAttempt && revision === auth.revision) {
        auth.clearLocalSession();
        authNavigation.goToLogin();
      }
      return throwError(() => err);
    })
  );
};
