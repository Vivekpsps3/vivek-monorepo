import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { FinanceService } from './finance.service';
import { VaultService } from '../crypto/vault.service';
import { EncryptedStoreService } from '../crypto/encrypted-store.service';

describe('FinanceService', () => {
  let service: FinanceService;
  let http: HttpTestingController;
  let encStore: jasmine.SpyObj<EncryptedStoreService>;

  beforeEach(() => {
    encStore = jasmine.createSpyObj<EncryptedStoreService>('EncryptedStoreService', [
      'getTransactions',
      'addTransaction',
      'getHoldings',
      'getNetWorth',
      'updateHoldingPrice',
      'bulkRenameTransactionCategories',
    ]);
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
  });

  afterEach(() => http.verify());

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
        http.expectNone(r => r.url.includes('/transactions/categories'));
        done();
      },
      error: done.fail,
    });
  });

  it('imports Fidelity positions client-side', done => {
    encStore.getBrokerageAccounts = jasmine.createSpy().and.resolveTo([]);
    encStore.upsertBrokerageAccount = jasmine.createSpy().and.callFake(async (body: any) => ({ id: 1, ...body }));
    encStore.getHoldings.and.resolveTo([]);
    encStore.deleteHolding = jasmine.createSpy().and.resolveTo(undefined);
    encStore.addHolding = jasmine.createSpy().and.callFake(async (body: any) => ({ id: 5, ...body }));
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
            expect(encStore.addHolding).toHaveBeenCalled();
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
