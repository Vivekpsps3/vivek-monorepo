import { HttpClientTestingModule, HttpTestingController, type TestRequest } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { encodeBase64 } from '@vivek/browser';
import { WrappedSigningKey } from '@vivek/auth';
import { apiUrl } from '../core/api-url';
import { SILENT_ERROR_TOAST } from '@vivek/ui';
import { ToastService } from '@vivek/ui';
import { deleteFinanceVaultDb } from './dek-store';
import { encryptJson, hmacBlindIndex, importVaultKeys, legacyDekBlindIndex, recordAad } from './vault-crypto';
import { VaultService, type EncryptedRecordDto } from './vault.service';

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

describe('VaultService whenReady', () => {
  afterEach(async () => {
    localStorage.removeItem('finance-dek');
    TestBed.resetTestingModule();
    await deleteFinanceVaultDb();
  });

  it('resolves before a missing browser key is treated as unlocked', async () => {
    localStorage.removeItem('finance-dek');
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    const service = TestBed.inject(VaultService);
    await service.whenReady();
    expect(service.isUnlocked).toBeFalse();
  });
});

describe('VaultService blind-index upgrade', () => {
  let http: HttpTestingController;

  async function requestFor(url: string): Promise<TestRequest> {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const found = http.match(request => request.url === url);
      if (found.length) return found[0];
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error(`Timed out waiting for ${url}`);
  }

  async function sealed(dek: CryptoKey, collection: string, clientId: string, data: object): Promise<EncryptedRecordDto> {
    return {
      collection, client_id: clientId, schema_version: 2, key_version: 1, revision: 1, updated_at: '2026-01-02T00:00:00Z',
      ciphertext_b64: await encryptJson(dek, data, recordAad(collection, clientId, 2, 1)),
    };
  }

  function bodyOf(request: TestRequest): { records: Array<{ client_id: string; collection: string; indexes?: Array<{ index_value_b64: string }> }> } {
    return request.request.body;
  }

  beforeEach(async () => { localStorage.removeItem('finance-dek'); await deleteFinanceVaultDb(); });
  afterEach(async () => { http?.verify(); localStorage.removeItem('finance-dek'); TestBed.resetTestingModule(); await deleteFinanceVaultDb(); });

  async function boot(byte: number): Promise<VaultService> {
    localStorage.setItem('finance-dek', encodeBase64(new Uint8Array(32).fill(byte)));
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    const service = TestBed.inject(VaultService);
    http = TestBed.inject(HttpTestingController);
    await service.whenReady();
    return service;
  }

  it('falls back to the DEK blind index before re-index', async () => {
    spyOn(VaultService.prototype, 'ensureBlindIndexes').and.resolveTo();
    const service = await boot(6);
    expect(localStorage.getItem('finance-dek')).toBeNull();
    expect(service.blindIndexVersion).toBe(1);
    expect(service.requireDek().extractable).toBeFalse();
    const pending = service.lookupBlindIndex('health_stats', 'record', 'synthetic-health-token');
    const primary = await requestFor(apiUrl('/vault/indexes/lookup'));
    expect(primary.request.body.index_value_b64).toBe(await hmacBlindIndex(service.requireDek(), 'synthetic-health-token'));
    primary.flush({ client_ids: [] });
    const fallback = await requestFor(apiUrl('/vault/indexes/lookup'));
    expect(fallback.request.body.index_value_b64).toBe(await legacyDekBlindIndex(service.requireDek(), 'synthetic-health-token'));
    fallback.flush({ client_ids: ['hlt_stats0001'] });
    expect(await pending).toEqual(['hlt_stats0001']);
  });

  it('resumes an interrupted re-index and still resolves health rows', async () => {
    const raw = new Uint8Array(32).fill(8);
    const seeded = await importVaultKeys(raw);
    const healthPlain = { kind: 'stats', day: '2026-01-02', steps: 1000 };
    const prPlain = { kind: 'pr', movement: 'squat', value: 100 };
    const health = await sealed(seeded.dek, 'health_stats', 'hlt_stats0001', healthPlain);
    const pr = await sealed(seeded.dek, 'health_prs', 'hlt_prs000001', prPlain);
    const tx1 = await sealed(seeded.dek, 'transactions', 'txn_aaaaaaaa', { id: 1, dedupe_key: 'dedupe-one' });
    const tx2 = await sealed(seeded.dek, 'transactions', 'txn_bbbbbbbb', { id: 2, dedupe_key: 'dedupe-two' });
    const pause = spyOn(VaultService.prototype, 'ensureBlindIndexes').and.resolveTo();
    localStorage.setItem('finance-dek', encodeBase64(raw));
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    const service = TestBed.inject(VaultService);
    http = TestBed.inject(HttpTestingController);
    await service.whenReady();
    expect(await service.decryptPayload(health.ciphertext_b64, 'health_stats', 'hlt_stats0001', 2, 1)).toEqual(healthPlain);
    expect(await service.decryptPayload(pr.ciphertext_b64, 'health_prs', 'hlt_prs000001', 2, 1)).toEqual(prPlain);
    pause.and.callThrough();
    const firstPass = service.ensureBlindIndexes();
    (await requestFor(apiUrl('/vault/records'))).flush([tx1, health, tx2, pr]);
    const firstUpsert = await requestFor(apiUrl('/vault/records/upsert'));
    expect(bodyOf(firstUpsert).records.map(row => row.client_id)).toEqual(['txn_aaaaaaaa']);
    expect(bodyOf(firstUpsert).records[0].indexes?.[0].index_value_b64).toBe(await hmacBlindIndex(service.requireDek(), 'dedupe-one'));
    firstUpsert.flush([{ ...tx1, revision: 2 }]);
    const secondUpsert = await requestFor(apiUrl('/vault/records/upsert'));
    expect(bodyOf(secondUpsert).records[0].client_id).toBe('txn_bbbbbbbb');
    secondUpsert.flush({ detail: 'interrupted' }, { status: 500, statusText: 'Error' });
    await expectAsync(firstPass).toBeRejected();
    expect(service.blindIndexVersion).toBe(1);
    const secondPass = service.ensureBlindIndexes();
    (await requestFor(apiUrl('/vault/records'))).flush([tx1, health, tx2, pr]);
    const resumed = await requestFor(apiUrl('/vault/records/upsert'));
    expect(bodyOf(resumed).records.map(row => row.client_id)).toEqual(['txn_bbbbbbbb']);
    resumed.flush([{ ...tx2, revision: 2 }]);
    await secondPass;
    expect(service.blindIndexVersion).toBe(2);
    expect(await service.decryptPayload(health.ciphertext_b64, 'health_stats', 'hlt_stats0001', 2, 1)).toEqual(healthPlain);
    expect(await service.decryptPayload(pr.ciphertext_b64, 'health_prs', 'hlt_prs000001', 2, 1)).toEqual(prPlain);
    const listed = firstValueFrom(service.listRecords('health_stats'));
    (await requestFor(apiUrl('/vault/records?collection=health_stats'))).flush([health]);
    const rows = await listed;
    expect(rows.map(row => row.client_id)).toEqual(['hlt_stats0001']);
    expect(await service.decryptPayload(rows[0].ciphertext_b64, rows[0].collection, rows[0].client_id, rows[0].schema_version, rows[0].key_version)).toEqual(healthPlain);
    const legacyLookup = service.lookupBlindIndex('health_stats', 'record', 'synthetic-health-token');
    (await requestFor(apiUrl('/vault/indexes/lookup'))).flush({ client_ids: [] });
    const fallback = await requestFor(apiUrl('/vault/indexes/lookup'));
    expect(fallback.request.body.index_value_b64).toBe(await legacyDekBlindIndex(service.requireDek(), 'synthetic-health-token'));
    fallback.flush({ client_ids: ['hlt_stats0001'] });
    expect(await legacyLookup).toEqual(['hlt_stats0001']);
  });
});
