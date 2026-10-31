import { HttpBackend, HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, catchError, finalize, shareReplay, switchMap, throwError } from 'rxjs';
import { authNavigation, SESSION_CONTEXT } from '@vivek/ui';
import { rememberSessionEnded } from './session-ended';

const PATHS = {
  me: new Set(['/api/auth/me', '/auth/me']),
  out: new Set(['/api/auth/logout', '/auth/logout']),
  health: new Set(['/health', '/api/health', '/travel/api/health', '/media/api/health']),
};

function matchesPath(url: string, paths: Set<string>): boolean {
  try {
    const parsed = new URL(url, location.origin);
    if (parsed.origin !== location.origin) return false;
    return paths.has(parsed.pathname.replace(/\/+$/, '') || '/');
  } catch {
    return false;
  }
}

const isAuthMe = (url: string): boolean => matchesPath(url, PATHS.me);
const isLogout = (url: string): boolean => matchesPath(url, PATHS.out);
const isHealth = (url: string): boolean => matchesPath(url, PATHS.health);

/** Sign-in forms and the session check itself. A probe here would loop or hide a wrong passphrase. */
function skipsSessionProbe(url: string): boolean {
  return (
    url.includes('/auth/login') ||
    url.includes('/auth/passwordless') ||
    url.includes('/auth/bootstrap') ||
    url.includes('/auth/signup') ||
    url.includes('/auth/invitations') ||
    isAuthMe(url) ||
    isLogout(url) ||
    isHealth(url)
  );
}

let sessionProbe: { revision: number; body: Observable<unknown> } | null = null;

function sessionCheck(backend: HttpBackend, revision: number): Observable<unknown> {
  // `sessionProbe?.revision === undefined` is true when there is no probe yet.
  if (sessionProbe !== null && sessionProbe.revision === revision) return sessionProbe.body;
  const body = new HttpClient(backend).get('/api/auth/me', { withCredentials: true }).pipe(
    finalize(() => {
      if (sessionProbe?.body === body) sessionProbe = null;
    }),
    shareReplay({ bufferSize: 1, refCount: false }),
  );
  sessionProbe = { revision, body };
  return body;
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
      if (isAuthMe(req.url) || isLogout(req.url)) {
        auth.clearLocalSession();
        authNavigation.goToLogin();
        return throwError(() => err);
      }
      if (skipsSessionProbe(req.url)) return throwError(() => err);
      // One probe per session revision, bypassing this interceptor. A dead session signs in with the ended copy.
      // A live session rethrows the original 401 so a wrong passphrase keeps its own copy.
      return sessionCheck(backend, revision).pipe(
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
