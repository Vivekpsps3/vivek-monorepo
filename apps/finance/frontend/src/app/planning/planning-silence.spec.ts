import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { HTTP_ERROR_FALLBACK, ToastService } from '@vivek/ui';
import { firstValueFrom } from 'rxjs';
import { SILENT_ERROR_TOAST, httpErrorInterceptor } from '../core/http-error.interceptor';
import { EncryptedStoreService } from '../crypto/encrypted-store.service';
import { VaultService } from '../crypto/vault.service';
import { PlanningService } from '../services/planning.service';

/**
 * Planning create, update, and delete pass `{ silent: true }`. Dropping that
 * flag on any of those calls lets the interceptor toast.
 */
describe('planning profile writes through the interceptor', () => {
  let http: HttpTestingController;
  let toast: ToastService;
  let service: PlanningService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([httpErrorInterceptor])),
        provideHttpClientTesting(),
        VaultService,
        EncryptedStoreService,
        PlanningService,
      ],
    });
    const vault = TestBed.inject(VaultService);
    (vault as unknown as { dek: CryptoKey }).dek = {} as CryptoKey;
    (vault as unknown as { unlockedSubject: { next(value: boolean): void } }).unlockedSubject.next(true);
    spyOn(vault, 'encryptPayload').and.resolveTo('Y2lwaGVy');
    spyOn(vault, 'decryptPayload').and.resolveTo({
      id: 4,
      name: 'Probe profile',
      base_currency: 'USD',
      payload_json: '{}',
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
    } as never);
    http = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
    spyOn(toast, 'error');
    service = TestBed.inject(PlanningService);
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

  const profileRecord = {
    collection: 'planning_profiles',
    client_id: 'plan-4',
    ciphertext_b64: 'Y2lwaGVy',
    schema_version: 2,
    key_version: 1,
    revision: 1,
    updated_at: '2026-10-01T00:00:00Z',
  };

  it('keeps a failed profile create silent', async () => {
    const pending = firstValueFrom(service.createProfile({ name: 'Probe profile', payload: {} } as never)).catch(() => undefined);
    const list = await whenRequest(req => req.method === 'GET' && req.url.includes('/vault/records'));
    expect(list.request.context.get(SILENT_ERROR_TOAST)).withContext('create load').toBeTrue();
    list.flush([]);
    const save = await whenRequest(req => req.method === 'POST' && req.url.includes('/vault/records/upsert'));
    expect(save.request.context.get(SILENT_ERROR_TOAST)).withContext('create').toBeTrue();
    save.flush({ detail: 'Synthetic save failed' }, { status: 503, statusText: 'Unavailable' });
    await pending;
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('keeps a failed profile update silent', async () => {
    const pending = firstValueFrom(service.updateProfile(4, { name: 'Probe profile', payload: {} } as never)).catch(() => undefined);
    const list = await whenRequest(req => req.method === 'GET' && req.url.includes('/vault/records'));
    list.flush([profileRecord]);
    const save = await whenRequest(req => req.method === 'POST' && req.url.includes('/vault/records/upsert'));
    expect(save.request.context.get(SILENT_ERROR_TOAST)).withContext('update').toBeTrue();
    save.flush({ detail: 'Synthetic save failed' }, { status: 503, statusText: 'Unavailable' });
    await pending;
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('keeps a failed profile delete silent', async () => {
    const pending = firstValueFrom(service.deleteProfile(4)).catch(() => undefined);
    const list = await whenRequest(req => req.method === 'GET' && req.url.includes('/vault/records'));
    expect(list.request.context.get(SILENT_ERROR_TOAST)).withContext('delete load').toBeTrue();
    list.flush([profileRecord]);
    const remove = await whenRequest(req => req.method === 'POST' && req.url.includes('/vault/records/delete'));
    expect(remove.request.context.get(SILENT_ERROR_TOAST)).withContext('delete').toBeTrue();
    remove.flush({ detail: 'Synthetic delete failed' }, { status: 503, statusText: 'Unavailable' });
    await pending;
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalledWith(HTTP_ERROR_FALLBACK);
  });
});
