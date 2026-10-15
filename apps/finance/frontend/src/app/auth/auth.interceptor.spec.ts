import { HttpErrorResponse, HttpRequest } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, throwError } from 'rxjs';
import { authNavigation } from './after-auth';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

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
      providers: [{ provide: AuthService, useValue: auth }],
    });

    await expectAsync(firstValueFrom(runInterceptor('/api/auth/passwordless/verify'))).toBeRejected();
    expect(auth.clearLocalSession).not.toHaveBeenCalled();
    expect(goToLogin).not.toHaveBeenCalled();
  });

  it('still clears the session for authenticated API 401 responses', async () => {
    const auth = jasmine.createSpyObj('AuthService', ['clearLocalSession'], { csrfToken: null });
    const goToLogin = spyOn(authNavigation, 'goToLogin');
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: auth }],
    });

    await expectAsync(firstValueFrom(runInterceptor('/api/vault/status'))).toBeRejected();
    expect(auth.clearLocalSession).toHaveBeenCalled();
    expect(goToLogin).toHaveBeenCalled();
  });
});
