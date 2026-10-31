import { HttpBackend, HttpErrorResponse, HttpRequest, HttpResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, Subject, throwError } from 'rxjs';
import { authNavigation } from '@vivek/ui';
import { authInterceptor } from './auth.interceptor';
import { SESSION_ENDED_COPY, SESSION_ENDED_COPY_KEY } from './session-ended';
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

  function configure(auth: object, handle = jasmine.createSpy('handle')): jasmine.Spy {
    TestBed.configureTestingModule({
      providers: [
        { provide: SESSION_CONTEXT, useValue: auth },
        { provide: HttpBackend, useValue: { handle } },
      ],
    });
    return handle;
  }

  afterEach(() => {
    sessionStorage.removeItem(SESSION_ENDED_COPY_KEY);
  });

  it('does not navigate away from passwordless auth failures so the login form can show an error', async () => {
    const auth = jasmine.createSpyObj('AuthService', ['clearLocalSession'], { csrfToken: null });
    const goToLogin = spyOn(authNavigation, 'goToLogin');
    const handle = configure(auth);

    await expectAsync(firstValueFrom(runInterceptor('/api/auth/passwordless/verify'))).toBeRejected();
    expect(auth.clearLocalSession).not.toHaveBeenCalled();
    expect(goToLogin).not.toHaveBeenCalled();
    expect(handle).not.toHaveBeenCalled();
  });

  it('sends an authenticated 401 to sign-in with the ended-session copy when the probe is signed out', async () => {
    const auth = jasmine.createSpyObj('AuthService', ['clearLocalSession'], { csrfToken: null });
    const goToLogin = spyOn(authNavigation, 'goToLogin');
    const handle = configure(auth, jasmine.createSpy('handle').and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 401, statusText: 'Unauthorized', url: '/api/auth/me' }))
    ));

    await expectAsync(firstValueFrom(runInterceptor('/api/vault/status'))).toBeRejected();
    expect(handle).toHaveBeenCalledTimes(1);
    const probe = handle.calls.mostRecent().args[0] as HttpRequest<unknown>;
    expect(probe.method).toBe('GET');
    expect(probe.url).toBe('/api/auth/me');
    expect(auth.clearLocalSession).toHaveBeenCalled();
    expect(goToLogin).toHaveBeenCalled();
    expect(sessionStorage.getItem(SESSION_ENDED_COPY_KEY)).toBe(SESSION_ENDED_COPY);
  });

  it('keeps a wrong-passphrase 401 when the session probe is still signed in', async () => {
    const auth = jasmine.createSpyObj('AuthService', ['clearLocalSession'], { csrfToken: null });
    const goToLogin = spyOn(authNavigation, 'goToLogin');
    const handle = configure(auth, jasmine.createSpy('handle').and.returnValue(
      of(new HttpResponse({ status: 200, body: { user: { id: 1 } } }))
    ));

    await expectAsync(firstValueFrom(runInterceptor('/api/account/name'))).toBeRejected();
    expect(handle).toHaveBeenCalledTimes(1);
    expect(auth.clearLocalSession).not.toHaveBeenCalled();
    expect(goToLogin).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(SESSION_ENDED_COPY_KEY)).toBeNull();
  });

  it('does not probe /auth/me itself and still clears that dead session check', async () => {
    const auth = jasmine.createSpyObj('AuthService', ['clearLocalSession'], { csrfToken: null });
    const goToLogin = spyOn(authNavigation, 'goToLogin');
    const handle = configure(auth);

    await expectAsync(firstValueFrom(runInterceptor('/api/auth/me'))).toBeRejected();
    expect(handle).not.toHaveBeenCalled();
    expect(auth.clearLocalSession).toHaveBeenCalled();
    expect(goToLogin).toHaveBeenCalled();
    expect(sessionStorage.getItem(SESSION_ENDED_COPY_KEY)).toBeNull();
  });

  it('sends the CSRF header on username change and keeps the session when /auth/me is signed in', async () => {
    const auth = jasmine.createSpyObj('AuthService', ['clearLocalSession'], { csrfToken: 'csrf-token' });
    const goToLogin = spyOn(authNavigation, 'goToLogin');
    const handle = configure(auth, jasmine.createSpy('handle').and.returnValue(
      of(new HttpResponse({ status: 200, body: { user: { id: 1 } } }))
    ));

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
    expect(handle).toHaveBeenCalledTimes(1);
    const probe = handle.calls.mostRecent().args[0] as HttpRequest<unknown>;
    expect(probe.method).toBe('GET');
    expect(probe.url).toBe('/api/auth/me');
    expect(probe.withCredentials).toBeTrue();
    expect(sessionStorage.getItem(SESSION_ENDED_COPY_KEY)).toBeNull();
  });

  it('clears the session and remembers the sign-in toast when /auth/me is also 401', async () => {
    const auth = jasmine.createSpyObj('AuthService', ['clearLocalSession'], { csrfToken: 'csrf-token' });
    const goToLogin = spyOn(authNavigation, 'goToLogin');
    const handle = configure(auth, jasmine.createSpy('handle').and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 401, statusText: 'Unauthorized', url: '/api/auth/me' }))
    ));

    await expectAsync(firstValueFrom(TestBed.runInInjectionContext(() =>
      authInterceptor(
        new HttpRequest('PATCH', '/api/account/username', { username: 'next.name' }),
        () => throwError(() => new HttpErrorResponse({ status: 401, statusText: 'Unauthorized', url: '/api/account/username' }))
      )
    ))).toBeRejected();

    expect(handle).toHaveBeenCalledTimes(1);
    expect(auth.clearLocalSession).toHaveBeenCalled();
    expect(goToLogin).toHaveBeenCalled();
    expect(sessionStorage.getItem(SESSION_ENDED_COPY_KEY)).toBe(SESSION_ENDED_COPY);
  });

  it('keeps the username error when the session probe fails for another reason', async () => {
    const auth = jasmine.createSpyObj('AuthService', ['clearLocalSession'], { csrfToken: 'csrf-token' });
    const goToLogin = spyOn(authNavigation, 'goToLogin');
    configure(auth, jasmine.createSpy('handle').and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 503, statusText: 'Unavailable', url: '/api/auth/me' }))
    ));

    await expectAsync(firstValueFrom(TestBed.runInInjectionContext(() =>
      authInterceptor(
        new HttpRequest('PATCH', '/api/account/username', {}),
        () => throwError(() => new HttpErrorResponse({ status: 401, statusText: 'Unauthorized', url: '/api/account/username' }))
      )
    ))).toBeRejected();

    expect(auth.clearLocalSession).not.toHaveBeenCalled();
    expect(goToLogin).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(SESSION_ENDED_COPY_KEY)).toBeNull();
  });

  it('does not treat /api/auth/members as /auth/me and shares one session check', async () => {
    let revision = 1;
    const auth = {
      csrfToken: null,
      get revision() { return revision; },
      clearLocalSession: jasmine.createSpy('clearLocalSession').and.callFake(() => { revision += 1; }),
    };
    const gate = new Subject<HttpResponse<unknown>>();
    const goToLogin = spyOn(authNavigation, 'goToLogin');
    const handle = configure(auth, jasmine.createSpy('handle').and.returnValue(gate));

    const runs = [0, 1, 2].map(() => firstValueFrom(runInterceptor('/api/auth/members')));
    expect(handle).toHaveBeenCalledTimes(1);
    const probe = handle.calls.mostRecent().args[0] as HttpRequest<unknown>;
    expect(probe.method).toBe('GET');
    expect(probe.url).toBe('/api/auth/me');

    gate.next(new HttpResponse({ status: 200, body: { user: { id: 1 } } }));
    gate.complete();
    await Promise.all(runs.map(run => run.then(() => Promise.reject(new Error('expected 401')), () => undefined)));

    expect(handle).toHaveBeenCalledTimes(1);
    expect(auth.clearLocalSession).not.toHaveBeenCalled();
    expect(goToLogin).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(SESSION_ENDED_COPY_KEY)).toBeNull();
  });

  it('does not treat a foreign origin or a substring path as /auth/me, /health, or /auth/logout', async () => {
    const auth = jasmine.createSpyObj('AuthService', ['clearLocalSession'], { csrfToken: null });
    const goToLogin = spyOn(authNavigation, 'goToLogin');
    const handle = configure(auth, jasmine.createSpy('handle').and.returnValue(of(new HttpResponse({ status: 200, body: { user: { id: 1 } } }))));
    const urls = ['https://evil.example/api/auth/me', 'https://evil.example/api/auth/logout', 'https://evil.example/api/health', '/api/auth/meow', '/api/auth/logout-extra', '/api/health-check'];
    for (const url of urls) await expectAsync(firstValueFrom(runInterceptor(url))).toBeRejected();
    expect(handle).toHaveBeenCalledTimes(urls.length);
    expect(auth.clearLocalSession).not.toHaveBeenCalled();
    expect(goToLogin).not.toHaveBeenCalled();
  });
});
