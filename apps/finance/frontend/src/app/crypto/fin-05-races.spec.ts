import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { httpErrorInterceptor } from '@vivek/ui';
import { EncryptedStoreService } from './encrypted-store.service';
import { VaultService } from './vault.service';

describe('FIN-05 delete routing and locked lookups', () => {
  let http: HttpTestingController;
  let store: EncryptedStoreService;
  let vault: VaultService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([httpErrorInterceptor])),
        provideHttpClientTesting(),
        VaultService,
        EncryptedStoreService,
      ],
    });
    vault = TestBed.inject(VaultService);
    (vault as unknown as { dek: CryptoKey }).dek = {} as CryptoKey;
    (vault as unknown as { unlockedSubject: { next(value: boolean): void } }).unlockedSubject.next(true);
    spyOn(vault, 'encryptPayload').and.resolveTo('Y2lwaGVy');
    spyOn(vault, 'decryptPayload').and.callFake((async (_cipher: string, _collection: string, clientId: string) => {
      if (clientId === 'holding-1') return { id: 1, symbol: 'MSFT', shares: 2, purchase_price: 10, purchase_date: '2024-01-02' };
      if (clientId === 'holding-2') return { id: 2, symbol: 'VOO', shares: 1, purchase_price: 80, purchase_date: '2026-01-01' };
      if (clientId === 'txn-1') return { id: 1, date: '2026-01-02', type: 'expense', category: 'Food', amount: 4, description: 'Tea marker' };
      if (clientId === 'txn-2') return { id: 2, date: '2026-01-02', type: 'expense', category: 'Food', amount: 9, description: 'Bakery marker' };
      if (clientId === 'bank-1') return { id: 3, bank_slug: 'chase', account_mask: '1234', account_key: 'chk', display_name: 'Checking', confirmed: true };
      if (clientId === 'broker-1') return { id: 4, broker_slug: 'fidelity', broker_name: 'Fidelity', account_mask: '9999' };
      return { id: 1, name: 'Cash', current_value: 10 };
    }) as VaultService['decryptPayload']);
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(EncryptedStoreService);
  });

  afterEach(() => http.verify());

  function row(collection: string, clientId: string) {
    return {
      collection,
      client_id: clientId,
      ciphertext_b64: 'Y2lwaGVy',
      schema_version: 2,
      key_version: 1,
      revision: 3,
      updated_at: '2026-10-01T00:00:00Z',
    };
  }

  async function whenRequest(match: (req: { method: string; url: string; body?: { records?: Array<{ collection?: string; client_id?: string }> } }) => boolean) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const found = http.match(req => match(req));
      if (found.length) return found[0];
      await Promise.resolve();
    }
    return http.expectOne(req => match(req));
  }

  const seeded = [
    row('holdings', 'holding-1'),
    row('holdings', 'holding-2'),
    row('transactions', 'txn-1'),
    row('transactions', 'txn-2'),
    row('bank_accounts', 'bank-1'),
    row('brokerage_accounts', 'broker-1'),
  ];

  async function preload(): Promise<void> {
    const pending = store.getHoldings();
    const list = await whenRequest(req => req.method === 'GET' && req.url.includes('/vault/records') && !req.url.includes('collection='));
    list.flush(seeded);
    await pending;
  }

  it('FQA3 deletes a holding without removing the transaction that shares its id, then reloads', async () => {
    await preload();
    const holdingDelete = store.deleteHolding(1);
    const request = await whenRequest(req => req.method === 'POST' && req.url.includes('/vault/records/delete'));
    expect(request.request.body?.records).toEqual([
      jasmine.objectContaining({ collection: 'holdings', client_id: 'holding-1', expected_revision: 3 }),
    ]);
    request.flush({ deleted: 1 });
    await holdingDelete;

    const reload = store.reloadCollections(['holdings', 'transactions']);
    const holdings = await whenRequest(req => req.method === 'GET' && req.url.includes('collection=holdings'));
    holdings.flush([row('holdings', 'holding-2')]);
    const transactions = await whenRequest(req => req.method === 'GET' && req.url.includes('collection=transactions'));
    transactions.flush([row('transactions', 'txn-1'), row('transactions', 'txn-2')]);
    await reload;

    expect((await store.getHoldings()).map(item => item.symbol)).toEqual(['VOO']);
    expect((await store.getTransactions()).map(item => item.description).sort()).toEqual(['Bakery marker', 'Tea marker']);
    expect(http.match(req => req.method === 'POST').length).toBe(0);
  });

  it('FQA3 deletes a transaction without removing the holding that shares its id, then reloads', async () => {
    await preload();
    const transactionDelete = store.deleteTransaction(1);
    const request = await whenRequest(req => req.method === 'POST' && req.url.includes('/vault/records/delete'));
    expect(request.request.body?.records).toEqual([
      jasmine.objectContaining({ collection: 'transactions', client_id: 'txn-1', expected_revision: 3 }),
    ]);
    request.flush({ deleted: 1 });
    await transactionDelete;

    const reload = store.reloadCollections(['transactions', 'holdings']);
    const transactions = await whenRequest(req => req.method === 'GET' && req.url.includes('collection=transactions'));
    transactions.flush([row('transactions', 'txn-2')]);
    const holdings = await whenRequest(req => req.method === 'GET' && req.url.includes('collection=holdings'));
    holdings.flush([row('holdings', 'holding-1'), row('holdings', 'holding-2')]);
    await reload;

    expect((await store.getTransactions()).map(item => item.description)).toEqual(['Bakery marker']);
    expect((await store.getHoldings()).map(item => item.symbol).sort()).toEqual(['MSFT', 'VOO']);
  });

  it('FQA1 a locked bank or brokerage lookup throws and does not return the cached rows', async () => {
    await preload();
    expect((await store.getBankAccounts()).map(account => account.display_name)).toEqual(['Checking']);
    expect((await store.getBrokerageAccounts()).map(account => account.account_mask)).toEqual(['9999']);
    (vault as unknown as { dek: CryptoKey | null }).dek = null;
    (vault as unknown as { unlockedSubject: { next(value: boolean): void } }).unlockedSubject.next(false);
    await expectAsync(store.getBankAccounts()).toBeRejectedWithError('Vault locked');
    await expectAsync(store.getBrokerageAccounts()).toBeRejectedWithError('Vault locked');
  });
});
