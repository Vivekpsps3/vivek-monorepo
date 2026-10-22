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

  async function whenRequest(match: (req: { method: string; url: string; context: { get(token: typeof SILENT_ERROR_TOAST): boolean } }) => boolean) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const found = http.match(req => match(req));
      if (found.length) return found[0];
      await Promise.resolve();
    }
    return http.expectOne(req => match(req));
  }

  it('does not let a silent first load hide a normal load failure', async () => {
    const silent = store.getStockLabScenarios({ silent: true }).catch(() => undefined);
    const open = store.getTransactions().catch(() => undefined);
    const requests = http.match(req => req.method === 'GET' && req.url.includes('/vault/records'));
    expect(requests.map(req => req.request.context.get(SILENT_ERROR_TOAST)).sort()).toEqual([false, true]);

    const openReq = requests.find(req => req.request.context.get(SILENT_ERROR_TOAST) === false)!;
    const silentReq = requests.find(req => req.request.context.get(SILENT_ERROR_TOAST) === true)!;
    openReq.flush({ detail: 'Synthetic load failed' }, { status: 503, statusText: 'Unavailable' });
    await Promise.resolve();
    expect(toast.error).toHaveBeenCalledOnceWith(HTTP_ERROR_FALLBACK);
    silentReq.flush({ detail: 'Synthetic load failed' }, { status: 503, statusText: 'Unavailable' });
    await Promise.all([silent, open]);
    expect(toast.error).toHaveBeenCalledTimes(1);
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
