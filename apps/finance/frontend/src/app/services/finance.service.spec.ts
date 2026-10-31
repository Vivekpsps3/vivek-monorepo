import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { firstValueFrom, Subject } from 'rxjs';
import { ToastService } from '@vivek/ui';
import { holdDek, wipeDek } from '../crypto/dek-holder';
import { lockFinance, lockLoad } from '../crypto/lock-finance';
import { FinanceService } from './finance.service';
import { VaultService } from '../crypto/vault.service';
import { EncryptedStoreService } from '../crypto/encrypted-store.service';
import { Asset } from '../models/transaction.model';

describe('FinanceService', () => {
  let service: FinanceService;
  let http: HttpTestingController;
  let encStore: jasmine.SpyObj<EncryptedStoreService>;
  let storeChanges: Subject<any>;

  beforeEach(() => {
    encStore = jasmine.createSpyObj<EncryptedStoreService>('EncryptedStoreService', [
      'getTransactions',
      'addTransaction',
      'getHoldings',
      'getNetWorth',
      'getAssets',
      'getLiabilities',
      'getJobIncomes',
      'getFixedExpenses',
      'getSubscriptions',
      'getCashflowSummary',
      'reloadCollections',
      'updateHoldingPrice',
      'bulkRenameTransactionCategories',
      'getBrokerageAccounts',
      'upsertBrokerageAccount',
      'createHoldingImportStage',
      'getHoldingImportStages',
      'getHoldingImportStageRows',
      'verifyHoldingImportStage',
      'activateHoldingImportStage',
      'updateHolding',
    ]);
    storeChanges = new Subject<any>();
    (encStore as any).changes$ = storeChanges.asObservable();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        FinanceService,
        { provide: VaultService, useValue: {} },
        { provide: EncryptedStoreService, useValue: encStore },
      ],
    });
    service = TestBed.inject(FinanceService);
    http = TestBed.inject(HttpTestingController);
    holdDek({} as CryptoKey);
  });

  afterEach(() => http.verify());
  afterEach(() => wipeDek());

  it('refreshes the complete transaction stream after an import instead of truncating it', async () => {
    const transactions = Array.from({ length: 5001 }, (_, id) => ({
      id: id + 1, date: '2026-01-01', type: 'expense', category: 'Other', amount: 1,
    })) as any;
    encStore.getTransactions.and.resolveTo(transactions);

    (service as any).refreshAfterImport();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect((service as any)._transactions.value.length).toBe(5001);
    expect((service as any)._dashboardTransactions.value.length).toBe(5001);
  });

  it('retries an in-flight Home snapshot after a holding quote invalidates the dashboard cache', async () => {
    encStore.getTransactions.and.resolveTo([] as any);
    encStore.getAssets.and.resolveTo([] as any);
    encStore.getLiabilities.and.resolveTo([] as any);
    encStore.getJobIncomes.and.resolveTo([] as any);
    encStore.getFixedExpenses.and.resolveTo([] as any);
    encStore.getSubscriptions.and.resolveTo([] as any);
    encStore.getNetWorth.and.resolveTo({ total: 0 } as any);
    encStore.getCashflowSummary.and.resolveTo({} as any);
    const beforeQuote = [{ id: 1, symbol: 'VOO', shares: 2, purchase_price: 100, purchase_date: null, current_price: 100 }];
    const afterQuote = [{ ...beforeQuote[0], current_price: 125 }];
    let releaseInitial!: (rows: any[]) => void;
    const initialHoldings = new Promise<any[]>(resolve => { releaseInitial = resolve; });
    let calls = 0;
    encStore.getHoldings.and.callFake(() => calls++ === 0 ? initialHoldings as any : Promise.resolve(afterQuote) as any);

    const dashboard = firstValueFrom(service.loadDashboard());
    storeChanges.next({ collection: 'holdings', source: 'local' });
    releaseInitial(beforeQuote);
    const result = await dashboard;

    expect(calls).toBe(2);
    expect(result[1]).toEqual(afterQuote);
  });

  it('publishes overlapping remote invalidations for different collections independently', async () => {
    const asset = { id: 3, name: 'Remote cash', current_value: 100 };
    const liability = { id: 4, name: 'Remote loan', current_balance: 200 };
    let releaseAssets!: (rows: any[]) => void;
    const assetRead = new Promise<any[]>(resolve => { releaseAssets = resolve; });
    encStore.reloadCollections.and.resolveTo();
    encStore.getAssets.and.returnValue(assetRead as any);
    encStore.getLiabilities.and.resolveTo([liability] as any);
    encStore.getNetWorth.and.resolveTo({ total: -100 } as any);
    const events: any[] = [];
    const subscription = service.dataChanges$.subscribe(change => events.push(change));

    const assetsRefresh = service.refreshCollectionsFromAnotherTab(['assets']);
    await new Promise(resolve => setTimeout(resolve, 0));
    const liabilitiesRefresh = service.refreshCollectionsFromAnotherTab(['liabilities']);
    await liabilitiesRefresh;
    releaseAssets([asset]);
    await assetsRefresh;
    subscription.unsubscribe();

    expect((service as any)._assets.value).toEqual([asset]);
    expect((service as any)._liabilities.value).toEqual([liability]);
    expect(events).toContain(jasmine.objectContaining({ collections: ['assets'], source: 'remote' }));
    expect(events).toContain(jasmine.objectContaining({ collections: ['liabilities'], source: 'remote' }));
  });

  it('does not deliver decrypted assets after a lock', async () => {
    const secret = { id: 9, name: 'secret-asset', current_value: 1 } as Asset;
    let release: (rows: Asset[]) => void = () => undefined;
    encStore.getAssets.and.returnValue(new Promise<Asset[]>(resolve => { release = resolve; }));
    let token = 4;
    Object.defineProperty(encStore, 'sessionToken', { configurable: true, get: () => token });
    (encStore as unknown as { clear(): void }).clear = () => { token += 1; };
    (TestBed.inject(VaultService) as unknown as { lock(): void }).lock = () => undefined;
    const seen: Asset[][] = [];
    let completed = false;
    service.getAssets().subscribe({ next: rows => seen.push(rows), complete: () => { completed = true; } });
    service.clearSessionState();
    release([secret]);
    await Promise.resolve();
    expect([seen, completed]).toEqual([[], true]);
    wipeDek(); const worth: unknown[] = []; encStore.getNetWorth.and.resolveTo({ total: 9 } as never);
    service.getNetWorth().subscribe(value => worth.push(value)); await Promise.resolve();
    expect([worth, (service as unknown as { _netWorth: { value: unknown } })._netWorth.value]).toEqual([[], null]);
  });

  it('does not replay cached assets or net worth once lockFinance starts', () => {
    const secret = { id: 9, name: 'secret-asset', current_value: 1 } as Asset;
    (service as unknown as { _assets: { next(rows: Asset[]): void }; _netWorth: { next(value: unknown): void } })._assets.next([secret]);
    (service as unknown as { _netWorth: { next(value: unknown): void } })._netWorth.next({ total: 40 });
    const assets: Asset[][] = []; const totals: unknown[] = []; const real = lockLoad.modules;
    lockLoad.modules = (() => new Promise(() => undefined)) as typeof lockLoad.modules;
    try {
      void lockFinance(TestBed.inject(Injector));
      service.assets$.subscribe(rows => assets.push(rows));
      service.netWorth$.subscribe(value => totals.push(value));
      expect([assets, totals]).toEqual([[[]], [null]]);
    } finally { lockLoad.modules = real; }
  });

  it('does not deliver asset rows deferred across lockFinance', async () => {
    const secret = { id: 9, name: 'secret-asset', current_value: 1 } as Asset;
    let release: (rows: Asset[]) => void = () => undefined;
    const hang = () => encStore.getAssets.and.returnValue(new Promise<Asset[]>(resolve => { release = resolve; }));
    const seen: Asset[][] = [];
    let cleared = 0;
    (encStore as unknown as { clear(): void }).clear = () => { cleared += 1; };
    (TestBed.inject(VaultService) as unknown as { lock(): void }).lock = () => undefined;
    spyOn(TestBed.inject(ToastService), 'error');
    const real = lockLoad.modules;
    try {
      hang(); service.getAssets().subscribe(rows => seen.push(rows));
      lockLoad.modules = (() => new Promise(() => undefined)) as typeof lockLoad.modules;
      void lockFinance(TestBed.inject(Injector)); release([secret]); await Promise.resolve();
      hang(); service.getAssets().subscribe(rows => seen.push(rows));
      lockLoad.modules = (() => Promise.reject(new Error('chunk'))) as typeof lockLoad.modules;
      await lockFinance(TestBed.inject(Injector)); release([secret]); await Promise.resolve();
      expect([seen, cleared]).toEqual([[], 3]);
    } finally { lockLoad.modules = real; }
  });

  it('continues refreshing valid collections when one member of a multi-collection snapshot goes stale', async () => {
    const freshHolding = { id: 2, symbol: 'VOO', shares: 3, current_price: 120 };
    const asset = { id: 3, name: 'Remote cash', current_value: 100 };
    let releaseFirstHoldings!: (rows: any[]) => void;
    const firstHoldingsRead = new Promise<any[]>(resolve => { releaseFirstHoldings = resolve; });
    let holdingReads = 0;
    encStore.reloadCollections.and.resolveTo();
    encStore.getHoldings.and.callFake(() => holdingReads++ === 0
      ? firstHoldingsRead as any
      : Promise.resolve([freshHolding]) as any);
    encStore.getAssets.and.resolveTo([asset] as any);
    encStore.getNetWorth.and.resolveTo({ total: 460 } as any);

    const mixedRefresh = service.refreshCollectionsFromAnotherTab(['holdings', 'assets']);
    await new Promise(resolve => setTimeout(resolve, 0));
    await service.refreshCollectionsFromAnotherTab(['holdings']);
    releaseFirstHoldings([{ id: 1, symbol: 'VOO', shares: 2, current_price: 100 }]);
    await mixedRefresh;

    expect((service as any)._holdings.value).toEqual([freshHolding]);
    expect((service as any)._assets.value).toEqual([asset]);
  });

  it('imports bank CSV through encrypted records', done => {
    encStore.getTransactions.and.resolveTo([]);
    encStore.addTransaction.and.resolveTo({ id: 1 } as any);
    const file = new File(
      [
        [
          'Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit',
          '2026-01-02,2026-01-03,1234,Coffee,Food,5.25,',
        ].join('\n'),
      ],
      'capital.csv',
      { type: 'text/csv' }
    );

    service.previewBankImport('capital_one', file).subscribe({
      next: preview => {
        expect(preview.summary.new).toBe(1);
        service.commitBankImport('capital_one', preview.filename, preview.rows).subscribe({
          next: result => {
            expect(result.inserted).toBe(1);
            expect(encStore.addTransaction).toHaveBeenCalledOnceWith(
              jasmine.objectContaining({
                type: 'expense',
                source: 'import',
                description: 'Coffee',
                dedupe_key: preview.rows[0].dedupe_key,
              })
            );
            http.expectNone(req => req.url.includes('/imports/'));
            done();
          },
          error: done.fail,
        });
      },
      error: done.fail,
    });
  });

  it('previews mixed-bank files and commits their combined selection without plaintext HTTP', done => {
    encStore.getTransactions.and.resolveTo([]);
    encStore.addTransaction.and.resolveTo({ id: 1 } as any);
    const files = [
      { id: 1, bank_slug: 'capital_one', file: new File(['Transaction Date,Card No.,Description,Category,Debit,Credit\n2026-01-02,1234,Coffee,Food,5.25,'], 'capital.csv') },
      { id: 2, bank_slug: 'amex', file: new File(['Date,Description,Account #,Amount,Category\n01/02/2026,Lunch,-1001,10.00,Food'], 'amex.csv') },
    ];
    service.previewBankImports(files).subscribe({
      next: previews => {
        expect(previews.map(entry => entry.preview!.bank)).toEqual(['Capital One', 'American Express']);
        const rows = previews.flatMap(entry => entry.preview!.rows);
        service.commitBankImports(rows).subscribe({
          next: result => {
            expect(result.inserted).toBe(2);
            expect(encStore.addTransaction.calls.allArgs().map(args => args[0].account_display)).toEqual(['Capital One ···1234', 'American Express ···1001']);
            http.expectNone(() => true);
            done();
          },
          error: done.fail,
        });
      },
      error: done.fail,
    });
  });

  it('refreshes unique ticker symbols with per-symbol failures and reports counts', done => {
    encStore.getHoldings.and.resolveTo([
      { id: 1, symbol: 'aapl', shares: 1, purchase_price: 10, current_price: 10 },
      { id: 2, symbol: 'AAPL', shares: 2, purchase_price: 10, current_price: 10 },
      { id: 3, symbol: '', shares: 1, purchase_price: 10, current_price: 10 },
      { id: 4, symbol: 'FAIL', shares: 1, purchase_price: 10, current_price: 10 },
    ] as any);
    encStore.updateHoldingPrice.and.resolveTo({} as any);
    encStore.getNetWorth.and.resolveTo({} as any);

    service.refreshAllHoldingPrices().subscribe({
      next: result => {
        expect(result.updated).toBe(2);
        expect(result.failed).toBe(1);
        expect(encStore.updateHoldingPrice.calls.count()).toBe(2);
        done();
      },
      error: done.fail,
    });
    setTimeout(() => {
      const aapl = http.expectOne(r => r.url.endsWith('/market/price/AAPL') && r.params.get('refresh') === 'true');
      const fail = http.expectOne(r => r.url.endsWith('/market/price/FAIL') && r.params.get('refresh') === 'true');
      expect(aapl.request.body).toBeNull();
      aapl.flush({ symbol: 'AAPL', price: 200, price_source: 'live', valid: true });
      fail.flush('unavailable', { status: 503, statusText: 'Unavailable' });
    });
  });

  it('renames categories locally', done => {
    encStore.bulkRenameTransactionCategories.and.resolveTo({ updated: 2, conflicts: 0 });
    service.renameCategory('Dining', 'Food').subscribe({
      next: result => {
        expect(result.updated).toBe(2);
        expect(encStore.bulkRenameTransactionCategories).toHaveBeenCalledWith([{ fromCategory: 'Dining', toCategory: 'Food' }]);
        http.expectNone(r => r.url.includes('/finance/transactions/categories'));
        done();
      },
      error: done.fail,
    });
  });

  it('imports Fidelity positions client-side', done => {
    encStore.getBrokerageAccounts.and.resolveTo([]);
    encStore.upsertBrokerageAccount.and.callFake(async (body: any) => ({ id: 1, ...body } as any));
    encStore.getHoldings.and.resolveTo([]);
    const stage = { id: 4, source: 'fidelity', filename: 'fidelity.csv', status: 'staged', account_masks: ['Z111'], expected_row_count: 1, account_replacements: [], created_at: '2026-10-11T00:00:00Z' };
    encStore.createHoldingImportStage.and.callFake(async (body: any, rows: any[]) => ({ id: 4, ...body, expected_row_count: rows.length } as any));
    encStore.getHoldingImportStages.and.resolveTo([stage] as any);
    encStore.getHoldingImportStageRows.and.resolveTo([]);
    encStore.verifyHoldingImportStage.and.callFake(async () => ({ id: 4, status: 'verified' } as any));
    encStore.activateHoldingImportStage.and.resolveTo({ accounts_replaced: 1, holdings_replaced: 0, inserted: 1, accounts: ['Fidelity ···Z111'], stage_id: 4, status: 'activated' });
    encStore.getNetWorth.and.resolveTo({
      other_assets: 0,
      portfolio: 0,
      liabilities: 0,
      total_assets: 0,
      total: 0,
    });

    const csv = [
      'Account Number,Account Name,Symbol,Quantity,Average Cost Basis',
      'Z111,Individual,VOO,2,500',
    ].join('\n');
    const file = new File([csv], 'fidelity.csv', { type: 'text/csv' });

    service.previewFidelityImport(file).subscribe({
      next: preview => {
        expect(preview.summary.positions).toBe(1);
        service.commitFidelityImport(preview.filename, preview.rows).subscribe({
          next: result => {
            expect(result.inserted).toBe(1);
            expect(encStore.createHoldingImportStage).toHaveBeenCalled();
            expect(encStore.verifyHoldingImportStage).toHaveBeenCalledWith(4);
            expect(encStore.activateHoldingImportStage).toHaveBeenCalledWith(4);
            http.expectNone(r => r.url.includes('/imports/fidelity') || r.url.includes('/imports/brokerages'));
            done();
          },
          error: done.fail,
        });
      },
      error: done.fail,
    });
  });
});
