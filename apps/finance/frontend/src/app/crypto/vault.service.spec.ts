import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { WrappedSigningKey } from '@vivek/auth';
import { apiUrl } from '../core/api-url';
import { SESSION_CONTEXT, SILENT_ERROR_TOAST, type SessionPort } from '@vivek/ui';
import { ToastService } from '@vivek/ui';
import { hasDek, holdDek } from './dek-holder';
import { createVaultMaterial, persistDekLocal } from './vault-crypto';
import { VaultService } from './vault.service';

describe('VaultService KDF upgrade', () => {
  let service: VaultService;
  let http: HttpTestingController;

  const legacyAuth: WrappedSigningKey = {
    kdf_salt_b64: 'MTIzNDU2Nzg5MDEyMzQ1Ng==',
    kdf_iterations: 310000,
    wrapped_private_key_b64: 'bGVnYWN5LWF1dGgtd3JhcA==',
    recovery_wrapped_private_key_b64: '',
  };
  const upgradedAuth: WrappedSigningKey = {
    ...legacyAuth,
    kdf_salt_b64: 'bmV3LXNhbHQtMTIzNDU2Nzg==',
    kdf_iterations: 600000,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(VaultService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('keeps the new auth wrap when the vault wrap update fails', async () => {
    service.loadAuthWrap(legacyAuth);
    (service as unknown as { dek: CryptoKey }).dek = {} as CryptoKey;
    (service as unknown as { statusSubject: { next(value: unknown): void } }).statusSubject.next({
      exists: true,
      kdf_iterations: 310000,
      kdf_salt_b64: 'c2FsdA==',
      wrapped_dek_b64: 'd3JhcA==',
      key_version: 1,
    });
    spyOn(service as unknown as { rewrapAuthWrap(): Promise<WrappedSigningKey> }, 'rewrapAuthWrap').and.resolveTo(upgradedAuth);
    spyOn(service as unknown as { rewrapVaultDek(): Promise<unknown> }, 'rewrapVaultDek').and.resolveTo({
      kdf_salt_b64: 'dmF1bHQtc2FsdA==',
      kdf_iterations: 600000,
      wrapped_dek_b64: 'dmF1bHQtd3JhcA==',
    });
    const toast = TestBed.inject(ToastService);
    spyOn(toast, 'error');

    const pending = service.upgradeKdfIfNeeded('vault-passphrase');
    await Promise.resolve();
    await Promise.resolve();
    const authReq = http.expectOne(apiUrl('/auth/passwordless/wraps'));
    expect(authReq.request.method).toBe('PUT');
    authReq.flush({ ok: true });
    await Promise.resolve();
    await Promise.resolve();
    const vaultReq = http.expectOne(apiUrl('/vault/wraps'));
    expect(vaultReq.request.method).toBe('PUT');
    vaultReq.flush({ detail: 'unavailable' }, { status: 500, statusText: 'Error' });
    await pending;

    expect(service['authWrap']).toEqual(upgradedAuth);
    expect(service.kdfUpgradeFailures).toBe(1);
    expect(toast.error).toHaveBeenCalled();
  });

  it('loads the signing wrap for a session that never cached one', async () => {
    (service as unknown as { statusSubject: { next(value: unknown): void } }).statusSubject.next({
      exists: true,
      kdf_iterations: 600000,
      kdf_salt_b64: 'c2FsdA==',
      wrapped_dek_b64: 'd3JhcA==',
      key_version: 1,
    });

    const pending = service.upgradeKdfIfNeeded('vault-passphrase');
    const read = http.expectOne(apiUrl('/auth/passwordless/wraps'));
    expect(read.request.method).toBe('GET');
    read.flush({ auth: { ...legacyAuth, kdf_iterations: 600000 } });
    await pending;

    expect(service['authWrap']?.kdf_iterations).toBe(600000);
    expect(service.kdfUpgradeFailures).toBe(0);
  });
});

describe('VaultService per-request silence', () => {
  let service: VaultService;
  let http: HttpTestingController;
  const row = { collection: 'assets', client_id: 'one', ciphertext_b64: 'Y2lwaGVy' };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(VaultService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('marks a silent upsert and leaves a concurrent normal upsert unmarked', () => {
    service.upsertRecords([row], { silent: true }).subscribe({ error: () => undefined });
    service.upsertRecords([row]).subscribe({ error: () => undefined });
    const requests = http.match(apiUrl('/vault/records/upsert'));
    expect(requests.length).toBe(2);
    expect(requests[0].request.context.get(SILENT_ERROR_TOAST)).toBeTrue();
    expect(requests[1].request.context.get(SILENT_ERROR_TOAST)).toBeFalse();
    requests.forEach(request => request.flush([]));
  });

  it('marks a silent delete and leaves a concurrent normal delete unmarked', () => {
    const record = { collection: 'assets', client_id: 'one', expected_revision: 1 };
    service.deleteRecords([record], { silent: true }).subscribe({ error: () => undefined });
    service.deleteRecords([record]).subscribe({ error: () => undefined });
    const requests = http.match(apiUrl('/vault/records/delete'));
    expect(requests.length).toBe(2);
    expect(requests[0].request.context.get(SILENT_ERROR_TOAST)).toBeTrue();
    expect(requests[1].request.context.get(SILENT_ERROR_TOAST)).toBeFalse();
    requests.forEach(request => request.flush({ deleted: 1 }));
  });
});

describe('VaultService lock', () => {
  afterEach(() => localStorage.removeItem('finance-dek'));

  it('clears the stored key and the in-memory key independently of the unlocked flag', async () => {
    localStorage.removeItem('finance-dek');
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    const service = TestBed.inject(VaultService);
    await service.whenReady();
    holdDek({} as CryptoKey);
    service['unlockedSubject'].next(true);
    localStorage.setItem('finance-dek', 'raw-key-bytes');
    expect(service.isUnlocked).toBeTrue();
    service.lock();
    expect(service.isUnlocked).toBeFalse();
    const seen: boolean[] = [];
    const epoch = service['epoch'];
    service.unlocked$.subscribe(value => seen.push(value));
    localStorage.setItem('finance-dek', 'again');
    holdDek({} as CryptoKey);
    service.lock();
    expect(localStorage.getItem('finance-dek')).toBeNull();
    expect(hasDek()).toBeFalse();
    expect(service['epoch']).toBe(epoch + 1);
    expect(seen).toEqual([false, false]);
    localStorage.setItem('finance-dek', 'again');
    holdDek({} as CryptoKey);
    service.lock();
    expect(localStorage.getItem('finance-dek')).toBeNull();
    expect(hasDek()).toBeFalse();
    expect(service['epoch']).toBe(epoch + 2);
    expect(seen).toEqual([false, false, false]);
    localStorage.setItem('finance-dek', 'again');
    service.lock();
    expect(localStorage.getItem('finance-dek')).toBeNull();
    expect(hasDek()).toBeFalse();
    expect(service['epoch']).toBe(epoch + 2);
    expect(seen).toEqual([false, false, false]);
    service['unlockedSubject'].next(true);
    expect(hasDek()).toBeFalse();
  });
});

describe('VaultService unlock epoch', () => {
  const passphrase = 'correct-horse-battery';
  afterEach(() => { localStorage.removeItem('finance-dek'); TestBed.resetTestingModule(); });

  async function lockDuring(name: 'deriveKey' | 'exportKey'): Promise<void> {
    localStorage.removeItem('finance-dek');
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    const service = TestBed.inject(VaultService);
    await service.whenReady();
    const payload = (await createVaultMaterial(passphrase, 1000)).setupPayload;
    service.loadPublicStatus({ exists: true, kdf_salt_b64: payload.kdf_salt_b64, kdf_iterations: payload.kdf_iterations, wrapped_dek_b64: payload.wrapped_dek_b64 });
    let open: () => void = () => undefined;
    const gate = new Promise<void>(resolve => { open = () => resolve(); });
    let parked = false;
    const real = crypto.subtle[name].bind(crypto.subtle) as (...args: never[]) => Promise<unknown>;
    spyOn(crypto.subtle, name).and.callFake(((...args: never[]) => real(...args).then(async result => {
      parked = true;
      await gate;
      return result;
    })) as never);
    const pending = service.unlock(passphrase);
    while (!parked) await new Promise(resolve => setTimeout(resolve, 0));
    service.lock();
    open();
    const opened = await pending;
    expect(opened).toBeFalse();
    expect(localStorage.getItem('finance-dek')).toBeNull();
    expect(hasDek()).toBeFalse();
    expect(service.isUnlocked).toBeFalse();
  }

  it('discards the key when a lock lands during derivation', () => lockDuring('deriveKey'));
  it('discards the key when a lock lands before the finance-dek write', () => lockDuring('exportKey'));

  async function discardDuringStatus(signOut: boolean): Promise<void> {
    localStorage.removeItem('finance-dek');
    const cleared$ = new Subject<void>();
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule], providers: [{ provide: SESSION_CONTEXT, useValue: { cleared$ } as unknown as SessionPort }] });
    const service = TestBed.inject(VaultService);
    await service.whenReady();
    const http = TestBed.inject(HttpTestingController);
    const payload = (await createVaultMaterial(passphrase, 1000)).setupPayload;
    const pending = service.unlock(passphrase);
    let request: ReturnType<HttpTestingController['expectOne']> | undefined;
    for (let attempt = 0; attempt < 20 && !request; attempt += 1) {
      request = http.match(apiUrl('/vault/status'))[0];
      if (!request) await new Promise(resolve => setTimeout(resolve, 0));
    }
    if (signOut) cleared$.next(); else service.lock();
    (request ?? http.expectOne(apiUrl('/vault/status'))).flush({ exists: true, kdf_salt_b64: payload.kdf_salt_b64, kdf_iterations: payload.kdf_iterations, wrapped_dek_b64: payload.wrapped_dek_b64 });
    expect([await pending, localStorage.getItem('finance-dek'), hasDek(), service.isUnlocked]).toEqual([false, null, false, false]);
    http.verify();
  }

  it('discards an unlock when a lock lands during an uncached status fetch', () => discardDuringStatus(false));
  it('discards an unlock when a sign-out lands during an uncached status fetch', () => discardDuringStatus(true));

  async function nextHttp(http: HttpTestingController, url: string): Promise<ReturnType<HttpTestingController['expectOne']>> {
    const started = Date.now();
    while (Date.now() - started < 20000) {
      const [request] = http.match(url);
      if (request) return request;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    return http.expectOne(url);
  }

  it('does not store a key when a lock lands during setup or adopt', async () => {
    localStorage.removeItem('finance-dek');
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    const service = TestBed.inject(VaultService);
    await service.whenReady();
    const http = TestBed.inject(HttpTestingController);
    const material = await createVaultMaterial(passphrase, 1000);
    const setup = service.setup(passphrase);
    const posted = await nextHttp(http, apiUrl('/finance/vault/setup'));
    service.lock();
    posted.flush({ exists: true });
    await setup;
    expect([localStorage.getItem('finance-dek'), hasDek(), service.isUnlocked]).toEqual([null, false, false]);
    const adopted = service.adoptBootstrapVault(material.dek);
    const status = await nextHttp(http, apiUrl('/vault/status'));
    service.lock();
    status.flush({ exists: true });
    await adopted;
    expect([localStorage.getItem('finance-dek'), hasDek(), service.isUnlocked]).toEqual([null, false, false]);
    http.verify();
  });

  it('discards a browser key when a lock lands during hydrate', async () => {
    localStorage.removeItem('finance-dek');
    await persistDekLocal((await createVaultMaterial(passphrase, 1000)).dek);
    let open: () => void = () => undefined;
    const gate = new Promise<void>(resolve => { open = () => resolve(); });
    let parked = false;
    const real = crypto.subtle.importKey.bind(crypto.subtle) as (...args: never[]) => Promise<unknown>;
    spyOn(crypto.subtle, 'importKey').and.callFake(((...args: never[]) => real(...args).then(async result => {
      parked = true;
      await gate;
      return result;
    })) as never);
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    const service = TestBed.inject(VaultService);
    while (!parked) await new Promise(resolve => setTimeout(resolve, 0));
    service.lock();
    open();
    await service.whenReady();
    expect([localStorage.getItem('finance-dek'), hasDek(), service.isUnlocked]).toEqual([null, false, false]);
  });
});

describe('VaultService whenReady', () => {
  afterEach(() => localStorage.removeItem('finance-dek'));

  it('resolves before a missing browser key is treated as unlocked', async () => {
    localStorage.removeItem('finance-dek');
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    const service = TestBed.inject(VaultService);
    await service.whenReady();
    expect(service.isUnlocked).toBeFalse();
  });
});
