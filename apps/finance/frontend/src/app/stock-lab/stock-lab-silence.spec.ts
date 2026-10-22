import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectorRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HTTP_ERROR_FALLBACK, ToastService } from '@vivek/ui';
import { Subject, of } from 'rxjs';
import { SILENT_ERROR_TOAST, httpErrorInterceptor } from '../core/http-error.interceptor';
import { EncryptedStoreService } from '../crypto/encrypted-store.service';
import { VaultService } from '../crypto/vault.service';
import { FinanceService } from '../services/finance.service';
import { MarketResearchService } from '../services/market-research.service';
import { StockLabScenarioService } from '../services/stock-lab-scenario.service';
import { StockLabComponent } from './stock-lab.component';

/**
 * Goes through the real scenario service, encrypted store, vault HTTP call, and
 * interceptor. A mocked scenario service cannot see the second toast.
 */
describe('stock lab scenario failures through the interceptor', () => {
  let http: HttpTestingController;
  let toast: ToastService;
  let component: StockLabComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([httpErrorInterceptor])),
        provideHttpClientTesting(),
        VaultService,
        EncryptedStoreService,
        StockLabScenarioService,
        {
          provide: FinanceService,
          useValue: { holdings$: new Subject(), getHoldings: () => of([]) },
        },
        {
          provide: MarketResearchService,
          useValue: { getBatch: () => of({ results: [], failed: [] }) },
        },
      ],
    });
    const vault = TestBed.inject(VaultService);
    (vault as unknown as { dek: CryptoKey }).dek = {} as CryptoKey;
    (vault as unknown as { unlockedSubject: { next(value: boolean): void } }).unlockedSubject.next(true);
    spyOn(vault, 'encryptPayload').and.resolveTo('Y2lwaGVy');
    spyOn(vault, 'decryptPayload').and.resolveTo({
      id: 4,
      name: 'VOO scenario',
      primary_symbol: 'VOO',
      comparison_symbols: [],
      include_owned_symbols: false,
      selected_owned_symbols: [],
      purchase_mode: 'budget',
      updated_at: '2026-10-01T00:00:00Z',
      created_at: '2026-10-01T00:00:00Z',
    } as never);
    http = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
    spyOn(toast, 'error');
    spyOn(toast, 'success');
    component = new StockLabComponent(
      TestBed.inject(MarketResearchService),
      TestBed.inject(StockLabScenarioService),
      TestBed.inject(FinanceService),
      toast,
      { markForCheck() {} } as ChangeDetectorRef,
    );
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

  async function flushList(rows: unknown[] = []) {
    const list = await whenRequest(req => req.method === 'GET' && req.url.includes('/vault/records'));
    expect(list.request.context.get(SILENT_ERROR_TOAST)).withContext('scenario load').toBeTrue();
    list.flush(rows);
  }

  it('shows the inline save sentence and no fallback toast', async () => {
    const pending = component.saveScenario();
    await flushList();
    const save = await whenRequest(req => req.method === 'POST' && req.url.includes('/vault/records/upsert'));
    expect(save.request.context.get(SILENT_ERROR_TOAST)).toBeTrue();
    save.flush({ detail: 'Synthetic save failed' }, { status: 500, statusText: 'Error' });
    await pending;

    expect(component.error).toBe("Couldn't save this scenario.");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows the inline load sentence and no fallback toast', async () => {
    const pending = component.loadScenarios();
    const list = await whenRequest(req => req.method === 'GET' && req.url.includes('/vault/records'));
    expect(list.request.context.get(SILENT_ERROR_TOAST)).toBeTrue();
    list.flush({ detail: 'Synthetic load failed' }, { status: 500, statusText: 'Error' });
    await pending;

    expect(component.error).toBe("Couldn't load saved scenarios.");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows the inline delete sentence and no fallback toast', async () => {
    component.scenario = { ...component.scenario, id: 4 };
    const pending = component.deleteScenario();
    await flushList([{
      collection: 'stock_lab_scenarios',
      client_id: 'scenario-4',
      ciphertext_b64: 'Y2lwaGVy',
      schema_version: 2,
      key_version: 1,
      revision: 1,
      updated_at: '2026-10-01T00:00:00Z',
    }]);
    const remove = await whenRequest(req => req.method === 'POST' && req.url.includes('/vault/records/delete'));
    expect(remove.request.context.get(SILENT_ERROR_TOAST)).toBeTrue();
    remove.flush({ detail: 'Synthetic delete failed' }, { status: 500, statusText: 'Error' });
    await pending;

    expect(component.error).toBe("Couldn't delete this scenario.");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('still toasts a concurrent non-silent failure while a silent save is in flight', async () => {
    const pending = component.saveScenario();
    await flushList();
    // match() removes the request from the open list, so keep this handle.
    const quiet = await whenRequest(req => req.method === 'POST' && req.url.includes('/vault/records/upsert') && req.context.get(SILENT_ERROR_TOAST));
    const vault = TestBed.inject(VaultService);
    let noisySettled = false;
    vault.upsertRecords([{
      collection: 'assets',
      client_id: 'concurrent',
      ciphertext_b64: 'Y2lwaGVy',
    }]).subscribe({
      error: () => { noisySettled = true; },
    });
    const noisy = await whenRequest(req => req.method === 'POST' && req.url.includes('/vault/records/upsert') && !req.context.get(SILENT_ERROR_TOAST));
    expect(quiet.request.context.get(SILENT_ERROR_TOAST)).withContext('silent save').toBeTrue();
    expect(noisy.request.context.get(SILENT_ERROR_TOAST)).withContext('normal upsert').toBeFalse();
    noisy!.flush({ detail: 'Synthetic save failed' }, { status: 500, statusText: 'Error' });
    await Promise.resolve();
    expect(noisySettled).toBeTrue();
    expect(toast.error).toHaveBeenCalledOnceWith(HTTP_ERROR_FALLBACK);

    quiet!.flush({ detail: 'Synthetic save failed' }, { status: 500, statusText: 'Error' });
    await pending;
    expect(component.error).toBe("Couldn't save this scenario.");
    expect(toast.error).toHaveBeenCalledTimes(1);
  });
});
