import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { FinanceService } from '../services/finance.service';
import { VaultService } from '../crypto/vault.service';
import { environment } from '../../environments/environment';

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

    http.expectOne(`${api}/auth/passwordless/challenge`).flush({
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
});
