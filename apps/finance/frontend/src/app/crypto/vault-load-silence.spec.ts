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
    body?: { records?: Array<{ collection?: string; client_id?: string; expected_revision?: number | null }> };
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

    const retryRead = store.getAssets().then(rows => rows, () => 'failed' as const);
    const again = await whenRequest(req => req.method === 'POST' && req.url.includes('/vault/records/upsert'));
    expect(http.match(fullLoad).length).withContext('collections stay loaded').toBe(0);
    expect(again.request.body?.records?.[0].expected_revision).toBe(3);
    again.flush({ detail: 'Synthetic rewrite failed' }, { status: 503, statusText: 'Unavailable' });
    expect(await retryRead).toBe('failed');
    expect(toast.error).toHaveBeenCalledOnceWith(HTTP_ERROR_FALLBACK);

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
    expect(toast.error).toHaveBeenCalledTimes(1);
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
});
