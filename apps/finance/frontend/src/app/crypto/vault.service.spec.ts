import { HttpClientTestingModule, HttpTestingController, type TestRequest } from '@angular/common/http/testing';
import { EMPTY, firstValueFrom } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { encodeBase64 } from '@vivek/browser';
import { WrappedSigningKey } from '@vivek/auth';
import { apiUrl } from '../core/api-url';
import { SESSION_CONTEXT, SILENT_ERROR_TOAST, ToastService, type SessionPort } from '@vivek/ui';
import { VAULT_PRESENCE, deleteFinanceVaultDb } from './dek-store';
import { createVaultMaterial, encryptJson, hmacBlindIndex, importVaultKeys, indexedDbHoldsDek, legacyDekBlindIndex, recordAad } from './vault-crypto';
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

  function bodyOf(request: TestRequest): { records: Array<{ client_id: string; collection: string; ciphertext_b64: string; expected_revision: number; indexes?: Array<{ index_value_b64: string }> }> } {
    return request.request.body;
  }

  const txUrl = apiUrl('/vault/records?collection=transactions');

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
    (await requestFor(txUrl)).flush([tx1, tx2]);
    const firstUpsert = await requestFor(apiUrl('/vault/records/upsert'));
    expect(bodyOf(firstUpsert).records.map(row => row.client_id)).toEqual(['txn_aaaaaaaa']);
    expect(bodyOf(firstUpsert).records[0].indexes?.[0].index_value_b64).toBe(await hmacBlindIndex(service.requireDek(), 'dedupe-one'));
    firstUpsert.flush([{ ...tx1, revision: 2 }]);
    (await requestFor(txUrl)).flush([tx1, tx2]);
    const secondUpsert = await requestFor(apiUrl('/vault/records/upsert'));
    expect(bodyOf(secondUpsert).records[0].client_id).toBe('txn_bbbbbbbb');
    secondUpsert.flush({ detail: 'interrupted' }, { status: 500, statusText: 'Error' });
    await expectAsync(firstPass).toBeRejected();
    expect(service.blindIndexVersion).toBe(1);
    const secondPass = service.ensureBlindIndexes();
    (await requestFor(apiUrl('/vault/records'))).flush([tx1, health, tx2, pr]);
    (await requestFor(txUrl)).flush([tx2]);
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

  it('unions legacy and HKDF lookup hits', async () => {
    spyOn(VaultService.prototype, 'ensureBlindIndexes').and.resolveTo();
    const service = await boot(6);
    const pending = service.lookupBlindIndex('transactions', 'dedupe_key', 'shared');
    (await requestFor(apiUrl('/vault/indexes/lookup'))).flush({ client_ids: ['txn_new'] });
    (await requestFor(apiUrl('/vault/indexes/lookup'))).flush({ client_ids: ['txn_old', 'txn_new'] });
    expect(await pending).toEqual(['txn_new', 'txn_old']);
  });

  it('a lock during migration leaves no IndexedDB key and no presence flag', async () => {
    localStorage.setItem('finance-dek', encodeBase64(new Uint8Array(32).fill(4)));
    const setItem = localStorage.setItem.bind(localStorage);
    const gate: { service?: VaultService } = {};
    spyOn(localStorage, 'setItem').and.callFake((key: string, value: string) => {
      setItem(key, value);
      if (key === VAULT_PRESENCE) gate.service?.lock();
    });
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    const service = TestBed.inject(VaultService);
    gate.service = service;
    http = TestBed.inject(HttpTestingController);
    await service.whenReady();
    expect(service.isUnlocked).toBeFalse();
    expect(localStorage.getItem('finance-dek')).toBeNull();
    expect(localStorage.getItem(VAULT_PRESENCE)).toBeNull();
    expect(await indexedDbHoldsDek()).toBeFalse();
  });

  it('posts nothing under a new session when the user changes during re-index', async () => {
    const who = { id: 1 };
    const session = { get currentUser() { return { id: who.id }; }, user$: EMPTY, cleared$: EMPTY } as unknown as SessionPort;
    localStorage.setItem('finance-dek', encodeBase64(new Uint8Array(32).fill(6)));
    spyOn(VaultService.prototype, 'ensureBlindIndexes').and.resolveTo();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [{ provide: SESSION_CONTEXT, useValue: session }],
    });
    const service = TestBed.inject(VaultService);
    http = TestBed.inject(HttpTestingController);
    await service.whenReady();
    (VaultService.prototype.ensureBlindIndexes as jasmine.Spy).and.callThrough();
    const tx = await sealed(service.requireDek(), 'transactions', 'txn_aaaaaaaa', { dedupe_key: 'dedupe-one' });
    const pass = service.ensureBlindIndexes();
    (await requestFor(apiUrl('/vault/records'))).flush([tx]);
    const verify = await requestFor(txUrl);
    who.id = 2;
    verify.flush([tx]);
    await pass;
    expect(http.match(request => request.url.includes('upsert')).length).toBe(0);
    expect(service.blindIndexVersion).toBe(1);
  });

  it('a new service instance resumes stored progress', async () => {
    spyOn(VaultService.prototype, 'ensureBlindIndexes').and.resolveTo();
    const first = await boot(8);
    const tx1 = await sealed(first.requireDek(), 'transactions', 'txn_aaaaaaaa', { dedupe_key: 'dedupe-one' });
    const tx2 = await sealed(first.requireDek(), 'transactions', 'txn_bbbbbbbb', { dedupe_key: 'dedupe-two' });
    (VaultService.prototype.ensureBlindIndexes as jasmine.Spy).and.callThrough();
    const pass = first.ensureBlindIndexes();
    (await requestFor(apiUrl('/vault/records'))).flush([tx1, tx2]);
    (await requestFor(txUrl)).flush([tx1, tx2]);
    (await requestFor(apiUrl('/vault/records/upsert'))).flush([{ ...tx1, revision: 2 }]);
    (await requestFor(txUrl)).flush([tx1, tx2]);
    (await requestFor(apiUrl('/vault/records/upsert'))).flush({ detail: 'interrupted' }, { status: 500, statusText: 'Error' });
    await expectAsync(pass).toBeRejected();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    const reloaded = TestBed.inject(VaultService);
    http = TestBed.inject(HttpTestingController);
    await reloaded.whenReady();
    expect(reloaded.isUnlocked).toBeTrue();
    expect(reloaded.blindIndexVersion).toBe(1);
    const batch = reloaded.ensureBlindIndexes();
    (await requestFor(apiUrl('/vault/records'))).flush([tx1, tx2]);
    (await requestFor(txUrl)).flush([tx2]);
    const only = await requestFor(apiUrl('/vault/records/upsert'));
    expect(bodyOf(only).records.map(row => row.client_id)).toEqual(['txn_bbbbbbbb']);
    only.flush([{ ...tx2, revision: 2 }]);
    await batch;
    expect(reloaded.blindIndexVersion).toBe(2);
  });

  it('version 2 suppresses the scan', async () => {
    spyOn(VaultService.prototype, 'ensureBlindIndexes').and.resolveTo();
    const first = await boot(3);
    (VaultService.prototype.ensureBlindIndexes as jasmine.Spy).and.callThrough();
    const pass = first.ensureBlindIndexes();
    (await requestFor(apiUrl('/vault/records'))).flush([]);
    await pass;
    expect(first.blindIndexVersion).toBe(2);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    const reloaded = TestBed.inject(VaultService);
    http = TestBed.inject(HttpTestingController);
    await reloaded.whenReady();
    expect(reloaded.blindIndexVersion).toBe(2);
    expect(reloaded.isUnlocked).toBeTrue();
    http.verify();
  });

  it('retries a 409 with the refetched ciphertext and does not resurrect a deleted row', async () => {
    spyOn(VaultService.prototype, 'ensureBlindIndexes').and.resolveTo();
    const service = await boot(7);
    const tx = await sealed(service.requireDek(), 'transactions', 'txn_cccccccc', { dedupe_key: 'dedupe-three' });
    const gone = await sealed(service.requireDek(), 'transactions', 'txn_dddddddd', { dedupe_key: 'dedupe-four' });
    (VaultService.prototype.ensureBlindIndexes as jasmine.Spy).and.callThrough();
    const pass = service.ensureBlindIndexes();
    (await requestFor(apiUrl('/vault/records'))).flush([tx, gone]);
    (await requestFor(txUrl)).flush([tx, gone]);
    const conflict = await requestFor(apiUrl('/vault/records/upsert'));
    expect(bodyOf(conflict).records[0].client_id).toBe('txn_cccccccc');
    expect(bodyOf(conflict).records[0].expected_revision).toBe(1);
    expect(bodyOf(conflict).records[0].ciphertext_b64).toBe(tx.ciphertext_b64);
    conflict.flush({ detail: 'conflict' }, { status: 409, statusText: 'Conflict' });
    const revised = { ...tx, revision: 4, ciphertext_b64: 'Y2lwaGVyLXJldmlzZWQ=' };
    (await requestFor(txUrl)).flush([revised, gone]);
    const retried = await requestFor(apiUrl('/vault/records/upsert'));
    expect(bodyOf(retried).records[0].expected_revision).toBe(4);
    expect(bodyOf(retried).records[0].ciphertext_b64).toBe(revised.ciphertext_b64);
    retried.flush([{ ...revised, revision: 5 }]);
    (await requestFor(txUrl)).flush([revised]);
    await pass;
    expect(service.blindIndexVersion).toBe(2);
    expect(http.match(request => request.url.includes('upsert')).length).toBe(0);
  });

  it('counts an undecryptable row without logging its id', async () => {
    spyOn(VaultService.prototype, 'ensureBlindIndexes').and.resolveTo();
    const service = await boot(5);
    const tx = await sealed(service.requireDek(), 'transactions', 'txn_poison00', { dedupe_key: 'dedupe-poison' });
    tx.ciphertext_b64 = 'bm90LWF1dGg=';
    (VaultService.prototype.ensureBlindIndexes as jasmine.Spy).and.callThrough();
    const debug = spyOn(console, 'debug');
    const pass = service.ensureBlindIndexes();
    (await requestFor(apiUrl('/vault/records'))).flush([tx]);
    await pass;
    expect(service.blindIndexVersion).toBe(2);
    const text = debug.calls.allArgs().map(args => args.map(String).join(' ')).join('\n');
    expect(text).toContain('undecryptable rows: 1');
    expect(text).not.toContain('txn_poison00');
    expect(http.match(request => request.url.includes('upsert')).length).toBe(0);
  });

  it('resolves unlock before the re-index batch finishes', async () => {
    const passphrase = 'correct horse battery staple';
    const material = await createVaultMaterial(passphrase, 1_000);
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    const service = TestBed.inject(VaultService);
    http = TestBed.inject(HttpTestingController);
    await service.whenReady();
    service.loadPublicStatus({
      exists: true,
      kdf_salt_b64: material.setupPayload.kdf_salt_b64,
      kdf_iterations: material.setupPayload.kdf_iterations,
      wrapped_dek_b64: material.setupPayload.wrapped_dek_b64,
      key_version: 1,
    });
    const tx = await sealed(material.dek, 'transactions', 'txn_aaaaaaaa', { dedupe_key: 'dedupe-one' });
    const pending = service.unlock(passphrase);
    const listed = await requestFor(apiUrl('/vault/records'));
    await pending;
    const batch = service.ensureBlindIndexes();
    expect(service.isUnlocked).toBeTrue();
    expect(service.blindIndexVersion).toBe(1);
    const newer = { ...tx, revision: 3, ciphertext_b64: 'bmV3ZXItY2lwaGVy' };
    listed.flush([tx]);
    (await requestFor(txUrl)).flush([newer]);
    const posted = await requestFor(apiUrl('/vault/records/upsert'));
    expect(bodyOf(posted).records[0].ciphertext_b64).toBe(newer.ciphertext_b64);
    expect(bodyOf(posted).records[0].expected_revision).toBe(3);
    posted.flush([{ ...newer, revision: 4 }]);
    await batch;
    expect(service.blindIndexVersion).toBe(2);
  });

  it('a logout during the batch stops it', async () => {
    spyOn(VaultService.prototype, 'ensureBlindIndexes').and.resolveTo();
    const service = await boot(11);
    const tx = await sealed(service.requireDek(), 'transactions', 'txn_aaaaaaaa', { dedupe_key: 'dedupe-one' });
    (VaultService.prototype.ensureBlindIndexes as jasmine.Spy).and.callThrough();
    const batch = service.ensureBlindIndexes();
    const listed = await requestFor(apiUrl('/vault/records'));
    service.lock();
    listed.flush([tx]);
    await batch;
    expect(service.isUnlocked).toBeFalse();
    expect(service.blindIndexVersion).toBe(1);
    expect(await indexedDbHoldsDek()).toBeFalse();
    expect(http.match(request => request.url.includes('upsert')).length).toBe(0);
  });

  it('does not list a second batch until the stopped one finishes', async () => {
    const passphrase = 'correct horse battery staple';
    const material = await createVaultMaterial(passphrase, 1_000);
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    const service = TestBed.inject(VaultService);
    http = TestBed.inject(HttpTestingController);
    await service.whenReady();
    service.loadPublicStatus({
      exists: true,
      kdf_salt_b64: material.setupPayload.kdf_salt_b64,
      kdf_iterations: material.setupPayload.kdf_iterations,
      wrapped_dek_b64: material.setupPayload.wrapped_dek_b64,
      key_version: 1,
    });
    const pending = service.unlock(passphrase);
    const firstList = await requestFor(apiUrl('/vault/records'));
    await pending;
    service.lock();
    await service.unlock(passphrase);
    const batch = service.ensureBlindIndexes();
    let startedEarly = false;
    for (let attempt = 0; attempt < 5 && !startedEarly; attempt += 1) {
      startedEarly = http.match(request => request.url === apiUrl('/vault/records')).length > 0;
      if (!startedEarly) await new Promise(resolve => setTimeout(resolve, 20));
    }
    expect(startedEarly).toBeFalse();
    firstList.flush([]);
    (await requestFor(apiUrl('/vault/records'))).flush([]);
    await batch;
    expect(service.blindIndexVersion).toBe(2);
    expect(service.isUnlocked).toBeTrue();
  });

  it('logs a background re-index failure without ids', async () => {
    localStorage.setItem('finance-dek', encodeBase64(new Uint8Array(32).fill(12)));
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    const service = TestBed.inject(VaultService);
    http = TestBed.inject(HttpTestingController);
    const debug = spyOn(console, 'debug');
    await service.whenReady();
    const batch = service.ensureBlindIndexes();
    expect(service.isUnlocked).toBeTrue();
    const tx = await sealed(service.requireDek(), 'transactions', 'txn_logme0001', { dedupe_key: 'dedupe-log' });
    (await requestFor(apiUrl('/vault/records'))).flush([tx]);
    (await requestFor(txUrl)).flush([tx]);
    (await requestFor(apiUrl('/vault/records/upsert'))).flush({ detail: 'txn_logme0001 failed' }, { status: 500, statusText: 'Error' });
    await batch.catch(() => undefined);
    const text = debug.calls.allArgs().map(args => args.map(String).join(' ')).join('\n');
    expect(text).toContain('vault re-index stopped before version 2');
    expect(text).not.toContain('txn_logme0001');
    expect(service.blindIndexVersion).toBe(1);
    expect(service.isUnlocked).toBeTrue();
  });
});
