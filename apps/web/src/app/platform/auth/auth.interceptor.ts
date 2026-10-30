import { HttpBackend, HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { authNavigation, SESSION_CONTEXT } from '@vivek/ui';
import { rememberSessionEnded } from './session-ended';

/** Sign-in forms and the session check itself. A probe here would loop or hide a wrong passphrase. */
function skipsSessionProbe(url: string): boolean {
  return (
    url.includes('/auth/login') ||
    url.includes('/auth/passwordless') ||
    url.includes('/auth/bootstrap') ||
    url.includes('/auth/signup') ||
    url.includes('/auth/invitations') ||
    url.includes('/auth/me') ||
    url.includes('/auth/logout') ||
    url.includes('/health')
  );
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(SESSION_CONTEXT);
  const backend = inject(HttpBackend);
  const revision = auth.revision;
  const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase());
  const headers = mutating && auth.csrfToken ? req.headers.set('X-CSRF-Token', auth.csrfToken) : req.headers;
  const authReq = req.clone({ withCredentials: true, headers });
  return next(authReq).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status !== 401 || revision !== auth.revision) return throwError(() => err);
      // /auth/me is 401 when nobody is signed in. Logout already redirects. Neither gets the ended-session toast.
      if (req.url.includes('/auth/me') || req.url.includes('/auth/logout')) {
        auth.clearLocalSession();
        authNavigation.goToLogin();
        return throwError(() => err);
      }
      if (skipsSessionProbe(req.url)) return throwError(() => err);
      // One probe, bypassing this interceptor. A dead session signs in with the ended copy.
      // A live session rethrows the original 401 so a wrong passphrase keeps its own copy.
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
    })
  );
};
