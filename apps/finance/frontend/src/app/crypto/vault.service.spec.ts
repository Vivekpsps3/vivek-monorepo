import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { WrappedSigningKey } from '@vivek/auth';
import { apiUrl } from '../core/api-url';
import { SILENT_ERROR_TOAST } from '../core/http-error.interceptor';
import { ToastService } from '@vivek/ui';
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
