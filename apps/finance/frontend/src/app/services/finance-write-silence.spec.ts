import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { HTTP_ERROR_FALLBACK, ToastService } from '@vivek/ui';
import { firstValueFrom } from 'rxjs';
import { SILENT_ERROR_TOAST, httpErrorInterceptor } from '@vivek/ui';
import { EncryptedStoreService } from '../crypto/encrypted-store.service';
import { VaultService } from '../crypto/vault.service';
import { FinanceService } from './finance.service';

/**
 * A FinanceService write must carry silence through commit(), and a prepared
 * batch must carry it through savePreparedRecords. Dropping either argument
 * makes the matching request visible to the interceptor.
 */
describe('finance writes through the interceptor', () => {
  let http: HttpTestingController;
  let toast: ToastService;
  let finance: FinanceService;
  let store: EncryptedStoreService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([httpErrorInterceptor])),
        provideHttpClientTesting(),
        VaultService,
        EncryptedStoreService,
        FinanceService,
      ],
    });
    const vault = TestBed.inject(VaultService);
    (vault as unknown as { dek: CryptoKey }).dek = {} as CryptoKey;
    (vault as unknown as { unlockedSubject: { next(value: boolean): void } }).unlockedSubject.next(true);
    spyOn(vault, 'encryptPayload').and.resolveTo('Y2lwaGVy');
    spyOn(vault, 'decryptPayload').and.resolveTo({} as never);
    spyOn(vault, 'blindIndex').and.resolveTo('index');
    http = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
    spyOn(toast, 'error');
    finance = TestBed.inject(FinanceService);
    store = TestBed.inject(EncryptedStoreService);
  });

  afterEach(() => http.verify());

  async function whenRequest(match: (req: { method: string; url: string; body?: { records?: Array<{ collection: string }> }; context: { get(token: typeof SILENT_ERROR_TOAST): boolean } }) => boolean) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const found = http.match(req => match(req));
      if (found.length) return found[0];
      await Promise.resolve();
    }
    return http.expectOne(req => match(req));
  }

  it('forwards silence through commit and through a prepared-record save', async () => {
    const quiet = firstValueFrom(finance.addTransaction({
      date: '2026-10-22',
      type: 'expense',
      category: 'Food',
      amount: 12,
      description: 'Lunch',
    } as never, true)).catch(() => undefined);
    const list = await whenRequest(req => req.method === 'GET' && req.url.includes('/vault/records'));
    expect(list.request.context.get(SILENT_ERROR_TOAST)).withContext('commit load').toBeTrue();
    list.flush([]);
    const save = await whenRequest(req =>
      req.method === 'POST'
      && req.url.includes('/vault/records/upsert')
      && req.body?.records?.[0]?.collection === 'transactions');
    expect(save.request.context.get(SILENT_ERROR_TOAST)).withContext('commit').toBeTrue();

    const prepared = (store as unknown as {
      savePreparedRecords(collection: string, records: Array<{ id: number; name: string; value: number }>, replaceExisting: boolean, options: { silent: boolean }): Promise<unknown>;
    }).savePreparedRecords('assets', [{ id: 41, name: 'Cash', value: 10 }], false, { silent: true });
    const batch = await whenRequest(req =>
      req.method === 'POST'
      && req.url.includes('/vault/records/upsert')
      && req.body?.records?.[0]?.collection === 'assets');
    expect(batch.request.context.get(SILENT_ERROR_TOAST)).withContext('prepared records').toBeTrue();

    const noisyDone = firstValueFrom(finance.addTransaction({
      date: '2026-10-22',
      type: 'expense',
      category: 'Food',
      amount: 4,
      description: 'Tea',
    } as never)).then(() => false, () => true);
    const noisy = await whenRequest(req =>
      req.method === 'POST'
      && req.url.includes('/vault/records/upsert')
      && req.body?.records?.[0]?.collection === 'transactions'
      && !req.context.get(SILENT_ERROR_TOAST));
    noisy.flush({ detail: 'Synthetic save failed' }, { status: 503, statusText: 'Unavailable' });
    expect(await noisyDone).toBeTrue();
    expect(toast.error).toHaveBeenCalledOnceWith(HTTP_ERROR_FALLBACK);

    save.flush({ detail: 'Synthetic save failed' }, { status: 503, statusText: 'Unavailable' });
    batch.flush({ detail: 'Synthetic save failed' }, { status: 503, statusText: 'Unavailable' });
    await Promise.all([quiet, prepared.catch(() => undefined)]);
    expect(toast.error).toHaveBeenCalledTimes(1);
  });
});
