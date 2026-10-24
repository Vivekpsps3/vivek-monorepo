import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { HTTP_ERROR_FALLBACK, ToastService } from '@vivek/ui';
import { SILENT_ERROR_TOAST, httpErrorInterceptor } from '../core/http-error.interceptor';
import { EncryptedStoreService } from './encrypted-store.service';
import { VaultService } from './vault.service';

describe('vault load silence', () => {
  let http: HttpTestingController;
  let toast: ToastService;
  let store: EncryptedStoreService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([httpErrorInterceptor])),
        provideHttpClientTesting(),
        VaultService,
        EncryptedStoreService,
      ],
    });
    const vault = TestBed.inject(VaultService);
    (vault as unknown as { dek: CryptoKey }).dek = {} as CryptoKey;
    (vault as unknown as { unlockedSubject: { next(value: boolean): void } }).unlockedSubject.next(true);
    spyOn(vault, 'encryptPayload').and.resolveTo('Y2lwaGVy');
    spyOn(vault, 'decryptPayload').and.resolveTo({
      id: 1,
      name: 'Cash',
      current_value: 10,
    } as never);
    http = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
    spyOn(toast, 'error');
    store = TestBed.inject(EncryptedStoreService);
  });

  afterEach(() => http.verify());

  async function whenRequest(match: (req: {
    method: string;
    url: string;
    body?: { records?: Array<{ collection?: string; client_id?: string; ciphertext_b64?: string; expected_revision?: number | null }> };
    context: { get(token: typeof SILENT_ERROR_TOAST): boolean };
  }) => boolean) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const found = http.match(req => match(req));
      if (found.length) return found[0];
      await Promise.resolve();
    }
    return http.expectOne(req => match(req));
  }

  function fullLoad(req: { method: string; url: string }): boolean {
    return req.method === 'GET' && req.url.includes('/vault/records') && !req.url.includes('collection=');
  }

  function assetRow(revision: number, schemaVersion = 2) {
    return {
      collection: 'assets',
      client_id: 'asset-1',
      ciphertext_b64: 'Y2lwaGVy',
      schema_version: schemaVersion,
      key_version: 1,
      revision,
      updated_at: '2026-10-01T00:00:00Z',
    };
  }

  it('uses one silent GET when a silent caller and a normal caller load together', async () => {
    const silent = store.getStockLabScenarios({ silent: true });
    const open = store.getTransactions();
    await Promise.resolve();
    const requests = http.match(fullLoad);
    expect(requests.length).toBe(1);
    expect(requests[0].request.context.get(SILENT_ERROR_TOAST)).toBeTrue();
    requests[0].flush([]);
    await Promise.all([silent, open]);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('toasts a normal caller when the shared load fails and stays quiet for a silent caller', async () => {
    const silent = store.getStockLabScenarios({ silent: true }).catch(() => undefined);
    const open = store.getTransactions().catch(() => undefined);
    await Promise.resolve();
    const requests = http.match(fullLoad);
    expect(requests.length).toBe(1);
    expect(requests[0].request.context.get(SILENT_ERROR_TOAST)).toBeTrue();
    requests[0].flush({ detail: 'Synthetic load failed' }, { status: 503, statusText: 'Unavailable' });
    await Promise.all([silent, open]);
    expect(toast.error).toHaveBeenCalledOnceWith(HTTP_ERROR_FALLBACK);
  });

  it('does not roll a saved revision back when a slower load finishes after a write', async () => {
    const silent = store.getStockLabScenarios({ silent: true });
    const open = store.getTransactions();
    await Promise.resolve();
    const loads = http.match(fullLoad);
    loads[0].flush([assetRow(3)]);
    for (let step = 0; step < 30; step += 1) await Promise.resolve();

    const firstSave = store.updateAsset(1, { name: 'Edited' });
    const saved = await whenRequest(req => req.method === 'POST' && req.url.includes('/vault/records/upsert'));
    expect(saved.request.body?.records?.[0].expected_revision).toBe(3);
    saved.flush([assetRow(4)]);
    await firstSave;

    for (const late of loads.slice(1)) late.flush([assetRow(3)]);
    await Promise.all([silent, open]);

    const secondSave = store.updateAsset(1, { name: 'Edited again' });
    const next = await whenRequest(req => req.method === 'POST' && req.url.includes('/vault/records/upsert'));
    expect(next.request.body?.records?.[0].expected_revision).toBe(4);
    next.flush([assetRow(5)]);
    await secondSave;
  });

  it('sends a second update of the same asset with the revision from the first save', async () => {
    const preload = store.getAssets();
    const list = await whenRequest(fullLoad);
    list.flush([assetRow(3)]);
    await preload;

    const firstSave = store.updateAsset(1, { name: 'First' });
    const first = await whenRequest(req => req.method === 'POST' && req.url.includes('/vault/records/upsert'));
    expect(first.request.body?.records?.[0].expected_revision).toBe(3);
    const secondSave = store.updateAsset(1, { name: 'Second' });
    await settle();
    expect(http.match(req => req.method === 'POST' && req.url.includes('/vault/records/upsert')).length)
      .withContext('the second save waits for the first')
      .toBe(0);
    first.flush([assetRow(4)]);
    await firstSave;

    const second = await whenRequest(req => req.method === 'POST' && req.url.includes('/vault/records/upsert'));
    expect(second.request.body?.records?.[0].expected_revision).toBe(4);
    second.flush([assetRow(5)]);
    expect((await secondSave).name).toBe('Second');
  });

  it('sends a second update of the same transaction with the revision from the first save', async () => {
    const preload = store.getAssets();
    const list = await whenRequest(fullLoad);
    list.flush([{ ...assetRow(3), collection: 'transactions' }]);
    await preload;

    const firstSave = store.updateTransaction(1, { merchant: 'First' });
    const first = await whenRequest(req => req.method === 'POST' && req.url.includes('/vault/records/upsert'));
    expect(first.request.body?.records?.[0].expected_revision).toBe(3);
    const secondSave = store.updateTransaction(1, { merchant: 'Second' });
    await settle();
    expect(http.match(req => req.method === 'POST' && req.url.includes('/vault/records/upsert')).length)
      .withContext('the second save waits for the first')
      .toBe(0);
    first.flush([{ ...assetRow(4), collection: 'transactions' }]);
    await firstSave;

    const second = await whenRequest(req => req.method === 'POST' && req.url.includes('/vault/records/upsert'));
    expect(second.request.body?.records?.[0].expected_revision).toBe(4);
    second.flush([{ ...assetRow(5), collection: 'transactions' }]);
    expect((await secondSave).merchant).toBe('Second');
  });

  it('sends a second update of the same liability with the revision from the first save', async () => {
    const preload = store.getAssets();
    const list = await whenRequest(fullLoad);
    list.flush([{ ...assetRow(3), collection: 'liabilities' }]);
    await preload;

    const firstSave = store.updateLiability(1, { name: 'First' });
    const first = await whenRequest(req => req.method === 'POST' && req.url.includes('/vault/records/upsert'));
    expect(first.request.body?.records?.[0].expected_revision).toBe(3);
    const secondSave = store.updateLiability(1, { name: 'Second' });
    await settle();
    expect(http.match(req => req.method === 'POST' && req.url.includes('/vault/records/upsert')).length)
      .withContext('the second save waits for the first')
      .toBe(0);
    first.flush([{ ...assetRow(4), collection: 'liabilities' }]);
    await firstSave;

    const second = await whenRequest(req => req.method === 'POST' && req.url.includes('/vault/records/upsert'));
    expect(second.request.body?.records?.[0].expected_revision).toBe(4);
    second.flush([{ ...assetRow(5), collection: 'liabilities' }]);
    expect((await secondSave).name).toBe('Second');
  });

  it('rewrites a legacy record once when a silent load and a normal load overlap', async () => {
    const silent = store.getStockLabScenarios({ silent: true });
    const open = store.getTransactions();
    await Promise.resolve();
    const loads = http.match(fullLoad);
    expect(loads.length).toBe(1);
    expect(loads[0].request.context.get(SILENT_ERROR_TOAST)).toBeTrue();
    loads[0].flush([assetRow(3, 1)]);
    const rewrite = await whenRequest(req => req.method === 'POST' && req.url.includes('/vault/records/upsert'));
    expect(rewrite.request.context.get(SILENT_ERROR_TOAST)).toBeTrue();
    expect(rewrite.request.body?.records?.[0].expected_revision).toBe(3);
    rewrite.flush([assetRow(4)]);
    await Promise.all([silent, open]);
    expect(http.match(req => req.method === 'POST' && req.url.includes('/vault/records/upsert')).length).toBe(0);
  });

  it('retries a failed legacy rewrite without reloading, and stays quiet for a silent caller', async () => {
    const first = store.getStockLabScenarios({ silent: true }).then(() => 'ok', () => 'failed');
    const list = await whenRequest(fullLoad);
    expect(list.request.context.get(SILENT_ERROR_TOAST)).toBeTrue();
    list.flush([assetRow(3, 1)]);
    const rewrite = await whenRequest(req => req.method === 'POST' && req.url.includes('/vault/records/upsert'));
    expect(rewrite.request.context.get(SILENT_ERROR_TOAST)).toBeTrue();
    expect(rewrite.request.body?.records?.[0].expected_revision).toBe(3);
    rewrite.flush({ detail: 'Synthetic rewrite failed' }, { status: 503, statusText: 'Unavailable' });
    expect(await first).toBe('failed');
    expect(toast.error).not.toHaveBeenCalled();
    expect(http.match(fullLoad).length).toBe(0);

    const retryRead = store.getAssets();
    const again = await whenRequest(req => req.method === 'POST' && req.url.includes('/vault/records/upsert'));
    expect(http.match(fullLoad).length).withContext('collections stay loaded').toBe(0);
    expect(again.request.body?.records?.[0].expected_revision).toBe(3);
    again.flush({ detail: 'Synthetic rewrite failed' }, { status: 503, statusText: 'Unavailable' });
    expect(await retryRead).toEqual([jasmine.objectContaining({ id: 1, name: 'Cash', current_value: 10 })]);
    expect(toast.error).not.toHaveBeenCalled();

    const commit = store.addTransaction({
      date: '2026-10-22',
      type: 'expense',
      category: 'Food',
      amount: 4,
      description: 'Tea',
    } as never, { silent: true });
    const commitRewrite = await whenRequest(req => req.method === 'POST' && req.url.includes('/vault/records/upsert'));
    expect(commitRewrite.request.context.get(SILENT_ERROR_TOAST)).withContext('silent commit retry').toBeTrue();
    expect(commitRewrite.request.body?.records?.[0].expected_revision).toBe(3);
    commitRewrite.flush([assetRow(4)]);
    const insert = await whenRequest(req => req.method === 'POST' && req.url.includes('/vault/records/upsert'));
    expect(insert.request.body?.records?.[0].collection).toBe('transactions');
    expect(insert.request.context.get(SILENT_ERROR_TOAST)).toBeTrue();
    insert.flush([{
      collection: 'transactions',
      client_id: insert.request.body?.records?.[0].client_id,
      ciphertext_b64: 'Y2lwaGVy',
      schema_version: 2,
      key_version: 1,
      revision: 1,
      updated_at: '2026-10-01T00:00:00Z',
    }]);
    await commit;
    expect(toast.error).not.toHaveBeenCalled();
    expect(await store.getAssets()).toEqual([jasmine.objectContaining({ id: 1, name: 'Cash', current_value: 10 })]);
    expect(http.match(fullLoad).length).toBe(0);
  });

  it('shares one request when two silent callers load together', async () => {
    const first = store.getStockLabScenarios({ silent: true });
    const second = store.getStockLabScenarios({ silent: true });
    await Promise.resolve();
    const requests = http.match(req => req.method === 'GET' && req.url.includes('/vault/records'));
    expect(requests.length).toBe(1);
    expect(requests[0].request.context.get(SILENT_ERROR_TOAST)).toBeTrue();
    requests[0].flush([]);
    await Promise.all([first, second]);
  });

  it('keeps a silent save quiet when the 409 reload also fails', async () => {
    const preload = store.getAssets();
    const list = await whenRequest(req => req.method === 'GET' && req.url.includes('/vault/records') && !req.url.includes('collection='));
    list.flush([{
      collection: 'assets',
      client_id: 'asset-1',
      ciphertext_b64: 'Y2lwaGVy',
      schema_version: 2,
      key_version: 1,
      revision: 3,
      updated_at: '2026-10-01T00:00:00Z',
    }]);
    await preload;

    const pending = store.updateAsset(1, { name: 'Changed' }, { silent: true }).then(() => undefined, () => undefined);
    const save = await whenRequest(req => req.method === 'POST' && req.url.includes('/vault/records/upsert'));
    expect(save.request.context.get(SILENT_ERROR_TOAST)).withContext('silent save').toBeTrue();
    save.flush({ detail: 'conflict' }, { status: 409, statusText: 'Conflict' });
    const reload = await whenRequest(req => req.method === 'GET' && req.url.includes('collection=assets'));
    expect(reload.request.context.get(SILENT_ERROR_TOAST)).withContext('409 reload').toBeTrue();
    reload.flush({ detail: 'Synthetic reload failed' }, { status: 503, statusText: 'Unavailable' });
    await pending;
    expect(toast.error).not.toHaveBeenCalled();
  });

  async function settle(): Promise<void> {
    for (let step = 0; step < 20; step += 1) await Promise.resolve();
  }

  async function failLegacyRewrite(): Promise<void> {
    const first = store.getStockLabScenarios({ silent: true }).then(() => undefined, () => undefined);
    const list = await whenRequest(fullLoad);
    list.flush([assetRow(3, 1)]);
    const rewrite = await whenRequest(req => req.method === 'POST' && req.url.includes('/vault/records/upsert'));
    rewrite.flush({ detail: 'Synthetic rewrite failed' }, { status: 503, statusText: 'Unavailable' });
    await first;
    expect(toast.error).not.toHaveBeenCalled();
  }

  it('toasts once when several normal callers share a failed load', async () => {
    const silent = store.getStockLabScenarios({ silent: true }).catch(() => undefined);
    const first = store.getAssets().catch(() => undefined);
    const second = store.getTransactions().catch(() => undefined);
    const third = store.getLiabilities().catch(() => undefined);
    await Promise.resolve();
    const requests = http.match(fullLoad);
    expect(requests.length).toBe(1);
    requests[0].flush({ detail: 'Synthetic load failed' }, { status: 503, statusText: 'Unavailable' });
    await Promise.all([silent, first, second, third]);
    expect(toast.error).toHaveBeenCalledOnceWith(HTTP_ERROR_FALLBACK);
  });

  it('saves a legacy record during its rewrite at the next revision without a conflict', async () => {
    await failLegacyRewrite();
    const read = store.getAssets();
    const rewrite = await whenRequest(req => req.method === 'POST' && req.url.includes('/vault/records/upsert'));
    expect(rewrite.request.body?.records?.[0].expected_revision).toBe(3);
    const save = store.updateAsset(1, { name: 'B' });
    await settle();
    expect(http.match(req => req.method === 'POST').length).withContext('the save waits for the rewrite').toBe(0);
    rewrite.flush([assetRow(4)]);
    expect(await read).toEqual([jasmine.objectContaining({ id: 1, name: 'Cash', current_value: 10 })]);
    const user = await whenRequest(req => req.method === 'POST' && req.url.includes('/vault/records/upsert'));
    expect(user.request.body?.records?.[0].expected_revision).toBe(4);
    expect(user.request.context.get(SILENT_ERROR_TOAST)).toBeFalse();
    user.flush([assetRow(5)]);
    expect((await save).name).toBe('B');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('applies two saves of another record in call order while a rewrite is in flight', async () => {
    const vault = TestBed.inject(VaultService);
    (vault.decryptPayload as jasmine.Spy).and.callFake(async (_ciphertext: string, _collection: string, clientId: string) => (
      clientId === 'asset-2'
        ? { id: 2, name: 'Bonds', current_value: 5 }
        : { id: 1, name: 'Cash', current_value: 10 }
    ));
    (vault.encryptPayload as jasmine.Spy).and.callFake(async (data: { name?: string }) => data.name ?? 'row');

    const firstLoad = store.getStockLabScenarios({ silent: true }).then(() => undefined, () => undefined);
    const list = await whenRequest(fullLoad);
    list.flush([
      assetRow(3, 1),
      { ...assetRow(6), client_id: 'asset-2' },
    ]);
    const failed = await whenRequest(req => req.method === 'POST' && req.url.includes('/vault/records/upsert'));
    expect(failed.request.body?.records?.[0].client_id).toBe('asset-1');
    failed.flush({ detail: 'Synthetic rewrite failed' }, { status: 503, statusText: 'Unavailable' });
    await firstLoad;

    const firstSave = store.updateAsset(2, { name: 'First' });
    const rewrite = await whenRequest(req => req.method === 'POST' && req.url.includes('/vault/records/upsert'));
    expect(rewrite.request.body?.records?.[0].client_id).toBe('asset-1');
    const secondSave = store.updateAsset(2, { name: 'Second' });
    await settle();
    expect(http.match(req => req.method === 'POST').length).withContext('the later save waits').toBe(0);
    rewrite.flush([assetRow(4)]);

    const earlier = await whenRequest(req => req.method === 'POST' && req.url.includes('/vault/records/upsert'));
    expect(earlier.request.body?.records?.[0].ciphertext_b64).toBe('First');
    expect(earlier.request.body?.records?.[0].expected_revision).toBe(6);
    earlier.flush([{ ...assetRow(7), client_id: 'asset-2' }]);
    const later = await whenRequest(req => req.method === 'POST' && req.url.includes('/vault/records/upsert'));
    expect(later.request.body?.records?.[0].ciphertext_b64).toBe('Second');
    expect(later.request.body?.records?.[0].expected_revision).toBe(7);
    later.flush([{ ...assetRow(8), client_id: 'asset-2' }]);
    expect((await firstSave).name).toBe('First');
    expect((await secondSave).name).toBe('Second');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('returns loaded rows when a background rewrite fails', async () => {
    await failLegacyRewrite();
    const read = store.getAssets().then(rows => rows, (error: Error) => error);
    const retry = await whenRequest(req => req.method === 'POST' && req.url.includes('/vault/records/upsert'));
    retry.flush({ detail: 'conflict' }, { status: 409, statusText: 'Conflict' });
    const reload = await whenRequest(req => req.method === 'GET' && req.url.includes('collection=assets'));
    expect(reload.request.context.get(SILENT_ERROR_TOAST)).toBeTrue();
    reload.flush([assetRow(5, 1)]);
    const outcome = await read;
    expect(outcome instanceof Error).toBeFalse();
    expect(outcome).toEqual([jasmine.objectContaining({ id: 1, name: 'Cash', current_value: 10 })]);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('issues a fresh GET after a failed load and none after a settled load', async () => {
    const failed = store.getAssets().catch(() => undefined);
    const first = await whenRequest(fullLoad);
    first.flush({ detail: 'Synthetic load failed' }, { status: 503, statusText: 'Unavailable' });
    await failed;

    const retried = store.getAssets();
    const second = await whenRequest(fullLoad);
    second.flush([]);
    await retried;

    const settled = store.getAssets();
    await Promise.resolve();
    expect(http.match(fullLoad).length).withContext('a settled load is not fetched again').toBe(0);
    await settled;
  });

  it('toasts a 422 from a normal write and stays quiet for a silent write', async () => {
    const preload = store.getAssets();
    const list = await whenRequest(fullLoad);
    list.flush([assetRow(3)]);
    await preload;

    const normal = store.updateAsset(1, { name: 'Bad' }).then(() => 'ok', () => 'failed');
    const noisy = await whenRequest(req => req.method === 'POST' && req.url.includes('/vault/records/upsert'));
    expect(noisy.request.context.get(SILENT_ERROR_TOAST)).toBeFalse();
    noisy.flush({ detail: 'Invalid amount' }, { status: 422, statusText: 'Unprocessable Entity' });
    expect(await normal).toBe('failed');
    expect(toast.error).toHaveBeenCalledOnceWith(HTTP_ERROR_FALLBACK);

    const quiet = store.updateAsset(1, { name: 'Quiet' }, { silent: true }).then(() => 'ok', () => 'failed');
    const silent = await whenRequest(req => req.method === 'POST' && req.url.includes('/vault/records/upsert'));
    expect(silent.request.context.get(SILENT_ERROR_TOAST)).toBeTrue();
    silent.flush({ detail: 'Invalid amount' }, { status: 422, statusText: 'Unprocessable Entity' });
    expect(await quiet).toBe('failed');
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it('drops an in-flight load and a pending rewrite when the session changes', async () => {
    const vault = TestBed.inject(VaultService);
    await failLegacyRewrite();
    const retry = store.getAssets().then(rows => rows, (error: Error) => error);
    const inflight = await whenRequest(req => req.method === 'POST' && req.url.includes('/vault/records/upsert'));
    store.clear();
    vault.lock();
    (vault as unknown as { dek: CryptoKey }).dek = {} as CryptoKey;
    (vault as unknown as { unlockedSubject: { next(value: boolean): void } }).unlockedSubject.next(true);
    inflight.flush([assetRow(4)]);
    const outcome = await retry;
    expect(outcome instanceof Error ? outcome.message : '').not.toContain('another tab');
    expect(toast.error).not.toHaveBeenCalled();

    const next = store.getAssets();
    const again = await whenRequest(fullLoad);
    again.flush([]);
    expect(await next).toEqual([]);
    expect(http.match(req => req.method === 'POST').length).withContext('the old rewrite does not write').toBe(0);
    expect(toast.error).not.toHaveBeenCalled();
  });
});
