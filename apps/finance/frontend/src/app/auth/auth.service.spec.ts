import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { createSigningKey } from '@vivek/auth';
import { AuthService } from './auth.service';
import { UsernameChangeError } from './username-change';
import { FinanceService } from '../services/finance.service';
import { VaultService } from '../crypto/vault.service';
import { environment } from '../../environments/environment';

async function nextRequest(http: HttpTestingController, url: string) {
  const started = Date.now();
  while (Date.now() - started < 5000) {
    const matches = http.match(url);
    if (matches.length) return matches[0];
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`timed out waiting for ${url}`);
}

describe('AuthService passwordless login', () => {
  let service: AuthService;
  let http: HttpTestingController;
  let vault: jasmine.SpyObj<VaultService>;
  let finance: { clearSessionState: jasmine.Spy };
  const api = environment.apiUrl;

  beforeEach(() => {
    vault = jasmine.createSpyObj<VaultService>('VaultService', [
      'loadPublicStatus',
      'loadAuthWrap',
      'unlock',
      'refreshStatus',
      'upgradeKdfIfNeeded',
      'adoptBootstrapVault',
      'ensureLocalDevUnlocked',
    ]);
    vault.unlock.and.resolveTo();
    vault.refreshStatus.and.resolveTo({ exists: true });
    vault.upgradeKdfIfNeeded.and.resolveTo();
    vault.ensureLocalDevUnlocked.and.resolveTo();
    finance = { clearSessionState: jasmine.createSpy('clearSessionState') };
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        AuthService,
        { provide: VaultService, useValue: vault },
        { provide: FinanceService, useValue: finance },
      ],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    environment.localDevAuth = false;
    document.cookie = 'finance_csrf=; Max-Age=0';
    http.verify();
  });

  function signedIn(): void {
    document.cookie = 'finance_csrf=test';
  }

  it('signs in from the auth wrap alone and loads the vault only after verify', async () => {
    const loginPromise = service.loginWithVault('vivek', 'correct horse battery staple');

    http.expectOne(`${api}/auth/passwordless/lookup`).flush({
      auth: {
        kdf_salt_b64: 'MTIzNDU2Nzg5MDEyMzQ1Ng==',
        kdf_iterations: 310000,
        wrapped_private_key_b64: 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY=',
        recovery_wrapped_private_key_b64: '',
      },
    });

    await Promise.resolve();
    expect(vault.loadPublicStatus).not.toHaveBeenCalled();
    expect(vault.loadAuthWrap).toHaveBeenCalled();
    expect(vault.refreshStatus).not.toHaveBeenCalled();

    const challengeReq = http.expectOne(`${api}/auth/passwordless/challenge`);
    expect(challengeReq.request.body).toEqual({ username: 'vivek' });
    challengeReq.flush({
      challenge_id: 'c1',
      challenge: 'raw',
      message: 'vault-auth-v1\nhttp://localhost\n2099-01-01T00:00:00',
    });
    await expectAsync(loginPromise).toBeRejected();
  });

  it('does not call /auth/me when the browser has no session cookie', async () => {
    document.cookie = 'finance_csrf=; Max-Age=0';
    await expectAsync(service.loadSession().toPromise()).toBeResolvedTo(null);
    http.expectNone(`${api}/auth/me`);
  });

  it('keeps the unlocked vault when a reload still has a valid session cookie', async () => {
    signedIn();
    const session = service.loadSession().toPromise();
    http.expectOne(`${api}/auth/me`).flush({
      user: {
        id: 4,
        email: 'vivek@pending.local',
        username: 'vivek',
        display_name: 'Vivek',
        role: 'user',
        is_active: true,
        must_change_password: false,
        created_at: '2026-10-14T00:00:00',
        updated_at: '2026-10-14T00:00:00',
      },
    });
    await expectAsync(session).toBeResolvedTo(jasmine.objectContaining({ username: 'vivek' }));
    expect(finance.clearSessionState).not.toHaveBeenCalled();
  });

  it('clears the saved vault only when the session cookie is rejected', async () => {
    signedIn();
    const session = service.loadSession().toPromise();
    http.expectOne(`${api}/auth/me`).flush(
      { detail: 'Session expired' },
      { status: 401, statusText: 'Unauthorized' }
    );
    await expectAsync(session).toBeResolvedTo(null);
    expect(finance.clearSessionState).toHaveBeenCalled();
  });

  it('keeps the local-dev session when the vault unlock fails', async () => {
    signedIn();
    environment.localDevAuth = true;
    vault.ensureLocalDevUnlocked.and.rejectWith(new Error('Local dev vault is unavailable'));
    const session = service.loadSession().toPromise();
    http.expectOne(`${api}/auth/me`).flush({
      local_dev: true,
      user: {
        id: 1,
        email: 'local-dev@localhost',
        username: 'local-dev',
        display_name: 'Local Dev',
        role: 'admin',
        is_active: true,
        must_change_password: false,
        created_at: '2026-10-14T00:00:00',
        updated_at: '2026-10-14T00:00:00',
      },
    });
    await expectAsync(session).toBeResolvedTo(jasmine.objectContaining({ username: 'local-dev' }));
    expect(finance.clearSessionState).not.toHaveBeenCalled();
  });

  it('signs the issued username-change message and does not send the passphrase', async () => {
    const passphrase = 'correct horse battery staple';
    const material = await createSigningKey(passphrase, 1_000);
    signedIn();
    const session = service.loadSession().toPromise();
    http.expectOne(`${api}/auth/me`).flush({
      user: {
        id: 4,
        email: 'vivek@pending.local',
        username: 'vivek',
        display_name: 'Vivek',
        role: 'user',
        is_active: true,
        must_change_password: false,
        created_at: '2026-10-14T00:00:00',
        updated_at: '2026-10-14T00:00:00',
      },
    });
    await session;

    const message = 'vault-auth-v1\nhttp://127.0.0.1:4173\nchallenge-id-value\nusername_change\n2099-01-01T00:00:00';
    const pending = service.changeUsername('New.Name', passphrase);
    http.expectOne(`${api}/auth/passwordless/lookup`).flush({ auth: material.wrapped });
    await Promise.resolve();
    const challengeReq = http.expectOne(`${api}/auth/passwordless/challenge`);
    expect(challengeReq.request.body).toEqual({ username: 'vivek', purpose: 'username_change' });
    challengeReq.flush({
      challenge_id: 'challenge-id-value',
      challenge: 'raw-challenge-value-32-characters',
      message,
    });
    const patch = await nextRequest(http, `${api}/account/username`);
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual(jasmine.objectContaining({
      username: 'new.name',
      challenge_id: 'challenge-id-value',
      challenge: 'raw-challenge-value-32-characters',
      message,
    }));
    expect(JSON.stringify(patch.request.body)).not.toContain(passphrase);
    expect((patch.request.body as { signature_b64: string }).signature_b64.length).toBeGreaterThan(16);
    patch.flush({
      id: 4,
      email: 'new.name@pending.local',
      username: 'new.name',
      display_name: 'Vivek',
      role: 'user',
      is_active: true,
      must_change_password: false,
      created_at: '2026-10-14T00:00:00',
      updated_at: '2026-10-14T00:00:01',
    });
    await expectAsync(pending).toBeResolvedTo(jasmine.objectContaining({
      username: 'new.name',
      email: 'new.name@pending.local',
    }));
    expect(service.currentUser?.username).toBe('new.name');
  });

  it('rejects an invalid username before calling the server', async () => {
    signedIn();
    const session = service.loadSession().toPromise();
    http.expectOne(`${api}/auth/me`).flush({
      user: {
        id: 4,
        email: 'vivek@pending.local',
        username: 'vivek',
        display_name: 'Vivek',
        role: 'user',
        is_active: true,
        must_change_password: false,
        created_at: '2026-10-14T00:00:00',
        updated_at: '2026-10-14T00:00:00',
      },
    });
    await session;
    await expectAsync(service.changeUsername('no', 'passphrase')).toBeRejectedWith(jasmine.any(UsernameChangeError));
    http.expectNone(`${api}/auth/passwordless/lookup`);
  });

  it('still lowercases an email-shaped login name and does not apply the new-username rule', async () => {
    const pending = service.loginWithVault('Legacy.User@example.com', 'correct horse battery staple');
    const lookup = http.expectOne(`${api}/auth/passwordless/lookup`);
    expect(lookup.request.body).toEqual({ username: 'legacy.user@example.com' });
    lookup.flush({
      auth: {
        kdf_salt_b64: 'MTIzNDU2Nzg5MDEyMzQ1Ng==',
        kdf_iterations: 310000,
        wrapped_private_key_b64: 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY=',
        recovery_wrapped_private_key_b64: '',
      },
    });
    await Promise.resolve();
    const challenge = http.expectOne(`${api}/auth/passwordless/challenge`);
    expect(challenge.request.body).toEqual({ username: 'legacy.user@example.com' });
    challenge.flush({
      challenge_id: 'c1',
      challenge: 'raw',
      message: 'vault-auth-v1\nhttp://localhost\nlogin',
    });
    await expectAsync(pending).toBeRejected();
  });

  async function signInAs(username: string): Promise<void> {
    signedIn();
    const session = service.loadSession().toPromise();
    http.expectOne(`${api}/auth/me`).flush({
      user: {
        id: 4,
        email: 'legacy.seed@pending.local',
        username,
        display_name: 'Vivek',
        role: 'user',
        is_active: true,
        must_change_password: false,
        created_at: '2026-10-14T00:00:00',
        updated_at: '2026-10-14T00:00:00',
      },
    });
    await session;
  }

  it('submits a current username that contains @', async () => {
    const passphrase = 'correct horse battery staple';
    const material = await createSigningKey(passphrase, 1_000);
    const current = 'Legacy.User@example.com';
    await signInAs(current);
    const warn = spyOn(console, 'warn');
    const pending = service.changeUsername('Next.Name', passphrase);
    const lookup = http.expectOne(`${api}/auth/passwordless/lookup`);
    expect(lookup.request.body).toEqual({ username: current });
    lookup.flush({ auth: material.wrapped });
    await Promise.resolve();
    const challengeReq = http.expectOne(`${api}/auth/passwordless/challenge`);
    expect(challengeReq.request.body).toEqual({ username: current, purpose: 'username_change' });
    const message = 'vault-auth-v1\nhttp://127.0.0.1:4173\nchallenge-id-value\nusername_change\n2099-01-01T00:00:00';
    challengeReq.flush({
      challenge_id: 'challenge-id-value',
      challenge: 'raw-challenge-value-32-characters',
      message,
    });
    const patch = await nextRequest(http, `${api}/account/username`);
    expect(patch.request.body).toEqual(jasmine.objectContaining({ username: 'next.name', message }));
    expect(JSON.stringify(patch.request.body)).not.toContain(passphrase);
    patch.flush({
      id: 4,
      email: 'legacy.seed@pending.local',
      username: 'next.name',
      display_name: 'Vivek',
      role: 'user',
      is_active: true,
      must_change_password: false,
      created_at: '2026-10-14T00:00:00',
      updated_at: '2026-10-14T00:00:01',
    });
    await expectAsync(pending).toBeResolvedTo(jasmine.objectContaining({ username: 'next.name' }));
    expect(warn).not.toHaveBeenCalled();
    expect(JSON.stringify(warn.calls.allArgs())).not.toContain(passphrase);
  });

  it('warns and stops when the signed-in username is missing', async () => {
    await signInAs('');
    const warn = spyOn(console, 'warn');
    await expectAsync(service.changeUsername('next.name', 'correct horse battery staple')).toBeRejectedWith(
      jasmine.objectContaining({ status: 0, message: 'The signed-in username is missing.' }),
    );
    expect(warn).toHaveBeenCalledWith('username change: missing username', { status: 0 });
    http.expectNone(`${api}/auth/passwordless/lookup`);
  });

  it('warns when lookup, the challenge, or unwrapping fails', async () => {
    const passphrase = 'correct horse battery staple';
    await signInAs('legacy.user@example.com');
    const warn = spyOn(console, 'warn');

    const missingKey = service.changeUsername('next.name', passphrase);
    http.expectOne(`${api}/auth/passwordless/lookup`).flush({ auth: {} });
    await expectAsync(missingKey).toBeRejectedWith(
      jasmine.objectContaining({ message: 'The signing key could not be loaded.' }),
    );
    expect(warn).toHaveBeenCalledWith('username change: lookup', { status: 0 });

    const unreadable = service.changeUsername('next.name', passphrase);
    http.expectOne(`${api}/auth/passwordless/lookup`).flush({
      auth: {
        kdf_salt_b64: 'MTIzNDU2Nzg5MDEyMzQ1Ng==',
        kdf_iterations: 1000,
        wrapped_private_key_b64: 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY=',
        recovery_wrapped_private_key_b64: '',
      },
    });
    await Promise.resolve();
    http.expectOne(`${api}/auth/passwordless/challenge`).flush({ challenge_id: 'only-an-id' });
    await expectAsync(unreadable).toBeRejectedWith(
      jasmine.objectContaining({ message: 'The username change challenge could not be read.' }),
    );
    expect(warn).toHaveBeenCalledWith('username change: challenge', { status: 0 });

    const unwrap = service.changeUsername('next.name', passphrase);
    http.expectOne(`${api}/auth/passwordless/lookup`).flush({
      auth: {
        kdf_salt_b64: 'MTIzNDU2Nzg5MDEyMzQ1Ng==',
        kdf_iterations: 1000,
        wrapped_private_key_b64: 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY=',
        recovery_wrapped_private_key_b64: '',
      },
    });
    await Promise.resolve();
    http.expectOne(`${api}/auth/passwordless/challenge`).flush({
      challenge_id: 'challenge-id-value',
      challenge: 'raw-challenge-value-32-characters',
      message: 'vault-auth-v1\norigin\nusername_change',
    });
    await expectAsync(unwrap).toBeRejectedWith(
      jasmine.objectContaining({ status: 401, message: 'That passphrase is wrong.' }),
    );
    expect(warn).toHaveBeenCalledWith('username change: signing', { status: 401 });
    const logged = JSON.stringify(warn.calls.allArgs());
    expect(logged).not.toContain(passphrase);
    expect(logged).not.toContain('wrapped_private_key_b64');
  });

  it('refreshes the session once after a 403 and does not loop', async () => {
    const passphrase = 'correct horse battery staple';
    const material = await createSigningKey(passphrase, 1_000);
    await signInAs('legacy.user@example.com');
    const pending = service.changeUsername('next.name', passphrase);

    const answerChallenge = async (id: string) => {
      const lookup = await nextRequest(http, `${api}/auth/passwordless/lookup`);
      lookup.flush({ auth: material.wrapped });
      await Promise.resolve();
      const challenge = http.expectOne(`${api}/auth/passwordless/challenge`);
      challenge.flush({
        challenge_id: id,
        challenge: 'raw-challenge-value-32-characters',
        message: `vault-auth-v1\nhttp://127.0.0.1\n${id}\nusername_change\n2099-01-01T00:00:00`,
      });
    };

    await answerChallenge('challenge-id-value-one');
    const firstPatch = await nextRequest(http, `${api}/account/username`);
    expect((firstPatch.request.body as { challenge_id: string }).challenge_id).toBe('challenge-id-value-one');
    firstPatch.flush({ detail: 'Invalid CSRF token' }, { status: 403, statusText: 'Forbidden' });

    const refresh = await nextRequest(http, `${api}/auth/me`);
    expect(refresh.request.method).toBe('GET');
    refresh.flush({
      user: {
        id: 4,
        email: 'legacy.seed@pending.local',
        username: 'legacy.user@example.com',
        display_name: 'Vivek',
        role: 'user',
        is_active: true,
        must_change_password: false,
        created_at: '2026-10-14T00:00:00',
        updated_at: '2026-10-14T00:00:00',
      },
    });

    await answerChallenge('challenge-id-value-two');
    const secondPatch = await nextRequest(http, `${api}/account/username`);
    expect((secondPatch.request.body as { challenge_id: string }).challenge_id).toBe('challenge-id-value-two');
    secondPatch.flush({ detail: 'Invalid CSRF token' }, { status: 403, statusText: 'Forbidden' });

    await expectAsync(pending).toBeRejectedWith(
      jasmine.objectContaining({ status: 403, message: 'Session expired, sign in again.' }),
    );
    http.expectNone(`${api}/auth/passwordless/lookup`);
    http.expectNone(`${api}/auth/me`);
  });
});
