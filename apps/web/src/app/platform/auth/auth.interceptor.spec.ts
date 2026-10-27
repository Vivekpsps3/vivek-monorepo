import { HttpErrorResponse, HttpRequest } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, throwError } from 'rxjs';
import { authNavigation } from '@vivek/ui';
import { authInterceptor } from './auth.interceptor';
import { SESSION_CONTEXT } from '@vivek/ui';

describe('authInterceptor', () => {
  function runInterceptor(url: string) {
    return TestBed.runInInjectionContext(() =>
      authInterceptor(
        new HttpRequest('POST', url, {}),
        () => throwError(() => new HttpErrorResponse({ status: 401, statusText: 'Unauthorized', url }))
      )
    );
  }

  it('does not navigate away from passwordless auth failures so the login form can show an error', async () => {
    const auth = jasmine.createSpyObj('AuthService', ['clearLocalSession'], { csrfToken: null });
    const goToLogin = spyOn(authNavigation, 'goToLogin');
    TestBed.configureTestingModule({
      providers: [{ provide: SESSION_CONTEXT, useValue: auth }],
    });

    await expectAsync(firstValueFrom(runInterceptor('/api/auth/passwordless/verify'))).toBeRejected();
    expect(auth.clearLocalSession).not.toHaveBeenCalled();
    expect(goToLogin).not.toHaveBeenCalled();
  });

  it('still clears the session for authenticated API 401 responses', async () => {
    const auth = jasmine.createSpyObj('AuthService', ['clearLocalSession'], { csrfToken: null });
    const goToLogin = spyOn(authNavigation, 'goToLogin');
    TestBed.configureTestingModule({
      providers: [{ provide: SESSION_CONTEXT, useValue: auth }],
    });

    await expectAsync(firstValueFrom(runInterceptor('/api/vault/status'))).toBeRejected();
    expect(auth.clearLocalSession).toHaveBeenCalled();
    expect(goToLogin).toHaveBeenCalled();
  });

  it('sends the CSRF header on username change and keeps the session after a 401', async () => {
    const auth = jasmine.createSpyObj('AuthService', ['clearLocalSession'], { csrfToken: 'csrf-token' });
    const goToLogin = spyOn(authNavigation, 'goToLogin');
    TestBed.configureTestingModule({
      providers: [{ provide: SESSION_CONTEXT, useValue: auth }],
    });

    let seenHeader = '';
    await expectAsync(firstValueFrom(TestBed.runInInjectionContext(() =>
      authInterceptor(
        new HttpRequest('PATCH', '/api/account/username', { username: 'next.name' }),
        req => {
          seenHeader = req.headers.get('X-CSRF-Token') ?? '';
          return throwError(() => new HttpErrorResponse({ status: 401, statusText: 'Unauthorized', url: req.url }));
        }
      )
    ))).toBeRejected();

    expect(seenHeader).toBe('csrf-token');
    expect(auth.clearLocalSession).not.toHaveBeenCalled();
    expect(goToLogin).not.toHaveBeenCalled();
  });
});
