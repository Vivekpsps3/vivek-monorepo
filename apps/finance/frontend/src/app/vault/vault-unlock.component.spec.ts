import { ComponentFixture, TestBed } from '@angular/core/testing';
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
    expect(router.navigateByUrl).toHaveBeenCalledWith('/finance/embed');
    expect(fixture.componentInstance.busy).toBeFalse();
  });

  it('keeps the passphrase when unlock fails', async () => {
    const auth = jasmine.createSpyObj('AuthService', ['loadSession']);
    auth.currentUser = { username: 'vivek', email: 'vivek@pending.local' };
    const vault = jasmine.createSpyObj('VaultService', ['refreshStatus', 'unlock', 'upgradeKdfIfNeeded']);
    vault.isUnlocked = false;
    vault.refreshStatus.and.resolveTo({ exists: true });
    vault.unlock.and.rejectWith(new Error('Unlock failed'));

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

    expect(fixture.componentInstance.passphrase).toBe('correct horse battery staple');
    expect(fixture.componentInstance.error).toBe('Unlock failed');
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
});

describe('routed vault unlock', () => {
  afterEach(() => { localStorage.removeItem('finance-dek'); TestBed.resetTestingModule(); });
  it('discards an unlock when another tab broadcasts a lock', async () => {
    const user = { id: 7, username: 'vivek', email: '', display_name: '', role: 'user' as const, is_active: true, must_change_password: false, created_at: '', updated_at: '' };
    const auth: SessionPort = { user$: new BehaviorSubject(user), currentUser: user, csrfToken: null, revision: 0, cleared$: new Subject<void>(), isAdmin: () => false, loadSession: () => of(user), clearLocalSession: () => undefined, logout: () => undefined };
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
