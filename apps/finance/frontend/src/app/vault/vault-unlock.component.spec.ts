import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, Router, withDisabledInitialNavigation } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { SESSION_CONTEXT, type SessionPort } from '@vivek/ui';
import { routes } from '../app.routes';
import { apiUrl } from '../core/api-url';
import { hasDek, readLockEpoch } from '../crypto/dek-holder';
import { createVaultMaterial } from '../crypto/vault-crypto';
import { VaultService } from '../crypto/vault.service';
import { VaultUnlockComponent } from './vault-unlock.component';

describe('VaultUnlockComponent', () => {
  it('starts a KDF upgrade after unlock without waiting for it', async () => {
    const auth = jasmine.createSpyObj('AuthService', ['loadSession']);
    auth.currentUser = { username: 'vivek', email: 'vivek@pending.local' };
    const vault = jasmine.createSpyObj('VaultService', ['refreshStatus', 'unlock', 'upgradeKdfIfNeeded']);
    vault.isUnlocked = false;
    vault.refreshStatus.and.resolveTo({ exists: true });
    vault.unlock.and.callFake(async () => { vault.isUnlocked = true; return true; });
    vault.upgradeKdfIfNeeded.and.returnValue(new Promise(() => undefined));

    TestBed.configureTestingModule({
      imports: [VaultUnlockComponent],
      providers: [
        { provide: SESSION_CONTEXT, useValue: auth },
        { provide: VaultService, useValue: vault },
        provideRouter([]),
      ],
    });
    const router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl').and.resolveTo(true);
    const fixture: ComponentFixture<VaultUnlockComponent> = TestBed.createComponent(VaultUnlockComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.componentInstance.passphrase = 'correct horse battery staple';
    await fixture.componentInstance.unlock();

    expect(fixture.nativeElement.querySelector('.nav-tab, .mobile-tab')).toBeNull();
    expect(vault.unlock).toHaveBeenCalledWith('correct horse battery staple');
    expect(vault.upgradeKdfIfNeeded).toHaveBeenCalledWith('correct horse battery staple');
    // No next: the F5 default is /finance/ at top level; Karma runs framed,
    // so the embed default applies here (same self/top rule as afterAuthUrl).
    expect(router.navigateByUrl).toHaveBeenCalledWith('/finance/embed');
    expect(fixture.componentInstance.busy).toBeFalse();
  });

  it('wrong passphrase shows the wrong-passphrase sentence and keeps the passphrase', async () => {
    const auth = jasmine.createSpyObj('AuthService', ['loadSession']);
    auth.currentUser = { username: 'vivek', email: 'vivek@pending.local' };
    const vault = jasmine.createSpyObj('VaultService', ['refreshStatus', 'unlock', 'upgradeKdfIfNeeded']);
    vault.isUnlocked = false;
    vault.refreshStatus.and.resolveTo({ exists: true });
    const operationError = new Error('The operation failed for an operation-specific reason');
    operationError.name = 'OperationError';
    vault.unlock.and.rejectWith(operationError);

    TestBed.configureTestingModule({
      imports: [VaultUnlockComponent],
      providers: [
        { provide: SESSION_CONTEXT, useValue: auth },
        { provide: VaultService, useValue: vault },
        provideRouter([]),
      ],
    });
    const fixture: ComponentFixture<VaultUnlockComponent> = TestBed.createComponent(VaultUnlockComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.componentInstance.passphrase = 'correct horse battery staple';
    await fixture.componentInstance.unlock();
    fixture.detectChanges();

    expect(fixture.componentInstance.passphrase).toBe('correct horse battery staple');
    expect(fixture.componentInstance.error).toBe("That passphrase didn't unlock your vault. Check it and try again.");
    expect(fixture.nativeElement.textContent).not.toContain('OperationError');
    expect(vault.upgradeKdfIfNeeded).not.toHaveBeenCalled();
  });

  it('stays on the unlock form when the vault discards the unlock', async () => {
    const auth = jasmine.createSpyObj('AuthService', ['loadSession']);
    auth.currentUser = { username: 'vivek' };
    const vault = jasmine.createSpyObj('VaultService', ['refreshStatus', 'unlock', 'upgradeKdfIfNeeded']);
    vault.isUnlocked = false;
    vault.refreshStatus.and.resolveTo({ exists: true });
    vault.unlock.and.resolveTo(false);
    TestBed.configureTestingModule({ imports: [VaultUnlockComponent], providers: [
      { provide: SESSION_CONTEXT, useValue: auth }, { provide: VaultService, useValue: vault }, provideRouter([]),
    ] });
    const router = TestBed.inject(Router);
    const navigate = spyOn(router, 'navigateByUrl').and.resolveTo(true);
    const fixture = TestBed.createComponent(VaultUnlockComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.passphrase = 'correct horse battery staple';
    await fixture.componentInstance.unlock();
    expect(vault.upgradeKdfIfNeeded).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(fixture.componentInstance.error).toBe('Vault was locked, try again');
    expect(fixture.nativeElement.querySelector('form')).not.toBeNull();
  });

  describe('F5 return path and states', () => {
    let auth: jasmine.SpyObj<SessionPort>;
    let vault: jasmine.SpyObj<VaultService>;
    let unlocked = false;
    let router: Router;
    let navigate: jasmine.Spy;
    const originalUrl = window.location.pathname + window.location.search;

    function create(configure = true): ComponentFixture<VaultUnlockComponent> {
      if (configure) {
        TestBed.configureTestingModule({
          imports: [VaultUnlockComponent],
          providers: [
            { provide: SESSION_CONTEXT, useValue: auth },
            { provide: VaultService, useValue: vault },
            provideRouter([]),
          ],
        });
        router = TestBed.inject(Router);
        navigate = spyOn(router, 'navigateByUrl').and.resolveTo(true);
      }
      const fixture = TestBed.createComponent(VaultUnlockComponent);
      fixture.detectChanges();
      return fixture;
    }

    beforeEach(() => {
      auth = jasmine.createSpyObj<SessionPort>('AuthService', ['loadSession']);
      Object.defineProperty(auth, 'currentUser', {
        value: { username: 'vivek', email: 'vivek@pending.local' } as SessionPort['currentUser'],
        configurable: true,
      });
      vault = jasmine.createSpyObj<VaultService>('VaultService', ['refreshStatus', 'unlock', 'upgradeKdfIfNeeded']);
      unlocked = false;
      Object.defineProperty(vault, 'isUnlocked', {
        get: () => unlocked,
        set: (value: boolean) => { unlocked = value; },
        configurable: true,
      });
      vault.refreshStatus.and.resolveTo({ exists: true });
      vault.unlock.and.callFake(async () => { unlocked = true; return true; });
      vault.upgradeKdfIfNeeded.and.resolveTo();
    });

    afterEach(() => {
      window.history.pushState({}, '', originalUrl);
    });

    it('goes to a valid next after unlock', async () => {
      window.history.pushState({}, '', '?next=' + encodeURIComponent('/finance/spending?t=calendar'));
      const fixture = create();
      await fixture.whenStable();
      fixture.componentInstance.passphrase = 'correct horse battery staple';
      await fixture.componentInstance.unlock();
      expect(navigate).toHaveBeenCalledWith('/finance/spending?t=calendar');
    });

    it('does not redirect again when a submitted unlock finishes after restored keys already opened Home', async () => {
      let finishStatus!: (status: { exists: boolean }) => void;
      let finishUnlock!: (opened: boolean) => void;
      vault.refreshStatus.and.returnValue(new Promise(resolve => { finishStatus = resolve; }));
      vault.unlock.and.returnValue(new Promise(resolve => { finishUnlock = resolve; }));
      const fixture = create();
      fixture.componentInstance.passphrase = 'correct horse battery staple';
      const submitted = fixture.componentInstance.unlock();

      // A second tab restores saved keys while its visible form is submitted.
      // Initialization reaches Home first; the user can then open Activity.
      unlocked = true;
      finishStatus({ exists: true });
      await fixture.whenStable();
      expect(navigate).toHaveBeenCalledTimes(1);
      fixture.destroy();
      navigate.calls.reset();

      finishUnlock(true);
      await submitted;
      expect(navigate).not.toHaveBeenCalled();
    });

    it('ignores a status response after leaving the unlock screen', async () => {
      let finishStatus!: (status: { exists: boolean }) => void;
      vault.refreshStatus.and.returnValue(new Promise(resolve => { finishStatus = resolve; }));
      const fixture = create();
      fixture.destroy();

      // Even a missing-vault response must not replace the user's new route.
      finishStatus({ exists: false });
      await fixture.whenStable();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('ignores an off-site next', async () => {
      window.history.pushState({}, '', '?next=' + encodeURIComponent('https://evil.example/phish'));
      const fixture = create();
      await fixture.whenStable();
      fixture.componentInstance.passphrase = 'correct horse battery staple';
      await fixture.componentInstance.unlock();
      // Framed (Karma) embed default; top level this is '/finance/'.
      expect(navigate).toHaveBeenCalledWith('/finance/embed');
    });

    it('empty submit shows "Enter your vault passphrase." and does not call unlock', async () => {
      const fixture = create();
      await fixture.whenStable();
      fixture.componentInstance.passphrase = '';
      await fixture.componentInstance.unlock();
      expect(fixture.componentInstance.error).toBe('Enter your vault passphrase.');
      expect(vault.unlock).not.toHaveBeenCalled();
    });

    it('HTTP 0 and 503 show the network sentence', async () => {
      const { HttpErrorResponse } = await import('@angular/common/http');
      for (const status of [0, 503]) {
        TestBed.resetTestingModule();
        vault.unlock.and.rejectWith(new HttpErrorResponse({ status, statusText: 'x' }));
        const fixture = create();
        await fixture.whenStable();
        fixture.componentInstance.passphrase = 'correct horse battery staple';
        await fixture.componentInstance.unlock();
        expect(fixture.componentInstance.error).toBe("Can't reach Finance. Check your connection and try again.");
      }
    });

    it('shows the slow message after 1.5s', fakeAsync(() => {
      vault.unlock.and.returnValue(new Promise<boolean>(() => undefined));
      const fixture = create();
      flushMicrotasks();
      fixture.componentInstance.passphrase = 'correct horse battery staple';
      void fixture.componentInstance.unlock();
      fixture.detectChanges();
      expect(fixture.componentInstance.slow).toBe(false);
      tick(1500);
      expect(fixture.componentInstance.slow).toBe(true);
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('this can take a few seconds on a phone');
    }));

    it('error line is always rendered', async () => {
      const fixture = create();
      await fixture.whenStable();
      fixture.detectChanges();
      const line = fixture.nativeElement.querySelector('#vault-unlock-error');
      expect(line).not.toBeNull();
      expect(line.textContent).toBe('');
    });

    it('shows the auto-lock notice once', async () => {
      const { FinanceLockService } = await import('../core/finance-lock.service');
      const first = create();
      await first.whenStable();
      const lock = TestBed.inject(FinanceLockService);
      (lock as unknown as { lastLockReasonSignal: { set(value: { kind: 'auto'; minutes: number } | null): void } })
        .lastLockReasonSignal.set({ kind: 'auto', minutes: 15 });
      const withNotice = create(false);
      await withNotice.whenStable();
      withNotice.detectChanges();
      expect(withNotice.componentInstance.lockNotice).toBe('Finance locked after 15 minutes without activity.');
      expect(withNotice.nativeElement.textContent).toContain('Finance locked after 15 minutes without activity.');
      const second = create(false);
      await second.whenStable();
      expect(second.componentInstance.lockNotice).toBe('');
    });
  });
});

describe('routed vault unlock', () => {
  afterEach(() => { localStorage.removeItem('finance-dek'); TestBed.resetTestingModule(); });
  it('discards an unlock when another tab broadcasts a lock', async () => {
    const user = { id: 7, username: 'vivek', email: '', display_name: '', role: 'user' as const, is_active: true, must_change_password: false, created_at: '', updated_at: '' };
    const auth: SessionPort = { user$: new BehaviorSubject(user), currentUser: user, csrfToken: null, revision: 0, cleared$: new Subject<void>(), isAdmin: () => false, loadSession: () => of(user), clearLocalSession: () => Promise.resolve(), logout: () => undefined };
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule], providers: [provideRouter(routes, withDisabledInitialNavigation()), { provide: SESSION_CONTEXT, useValue: auth }] });
    const vault = TestBed.inject(VaultService);
    await vault.whenReady();
    const payload = (await createVaultMaterial('correct-horse-battery', 1000)).setupPayload;
    const harness = await RouterTestingHarness.create();
    const unlock = await harness.navigateByUrl('/vault/unlock', VaultUnlockComponent);
    const http = TestBed.inject(HttpTestingController);
    const started = Date.now();
    let status = http.match(apiUrl('/vault/status'))[0];
    while (!status && Date.now() - started < 5000) { await new Promise(resolve => setTimeout(resolve, 0)); status = http.match(apiUrl('/vault/status'))[0]; }
    (status ?? http.expectOne(apiUrl('/vault/status'))).flush({ exists: true, kdf_salt_b64: payload.kdf_salt_b64, kdf_iterations: payload.kdf_iterations, wrapped_dek_b64: payload.wrapped_dek_b64 });
    await harness.fixture.whenStable();
    let open: () => void = () => undefined;
    const gate = new Promise<void>(resolve => { open = () => resolve(); });
    let parked = false;
    const real = crypto.subtle.deriveKey.bind(crypto.subtle) as (...args: never[]) => Promise<unknown>;
    spyOn(crypto.subtle, 'deriveKey').and.callFake(((...args: never[]) => real(...args).then(async result => { parked = true; await gate; return result; })) as never);
    unlock.passphrase = 'correct-horse-battery';
    const pending = unlock.unlock();
    while (!parked) await new Promise(resolve => setTimeout(resolve, 0));
    const epoch = readLockEpoch();
    const channel = new BroadcastChannel('finance-vault-sync-v1');
    try {
      channel.postMessage({ version: 1, userId: 7, kind: 'lock', tabId: 'other-tab' });
      const wait = Date.now();
      while (readLockEpoch() === epoch && Date.now() - wait < 1000) await new Promise(resolve => setTimeout(resolve, 0));
      open(); await Promise.race([pending, new Promise(resolve => setTimeout(resolve, 1000))]);
      expect([readLockEpoch() - epoch, localStorage.getItem('finance-dek'), hasDek(), vault.isUnlocked, unlock.error]).toEqual([1, null, false, false, 'Vault was locked, try again']);
    } finally { channel.close(); }
    http.match(apiUrl('/vault/status')).forEach(request => request.flush({ exists: true, kdf_salt_b64: payload.kdf_salt_b64, kdf_iterations: payload.kdf_iterations, wrapped_dek_b64: payload.wrapped_dek_b64 }));
    http.verify();
  });
});
