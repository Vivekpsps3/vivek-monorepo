import { TestBed } from '@angular/core/testing';
import { EncryptedStoreService } from '../crypto/encrypted-store.service';
import { PlanningService } from './planning.service';

describe('PlanningService', () => {
  let service: PlanningService;
  let encStore: jasmine.SpyObj<EncryptedStoreService>;

  beforeEach(() => {
    encStore = jasmine.createSpyObj<EncryptedStoreService>('EncryptedStoreService', [
      'getNetWorth',
      'getJobIncomes',
      'getFixedExpenses',
      'getSubscriptions',
      'getTransactions',
      'getImportReceipts',
      'getBankAccounts',
      'getAssets',
      'getLiabilities',
      'getHoldings',
      'listPlanningProfiles',
      'savePlanningProfile',
      'deletePlanningProfile',
    ]);
    TestBed.configureTestingModule({
      providers: [
        PlanningService,
        { provide: EncryptedStoreService, useValue: encStore },
      ],
    });
    service = TestBed.inject(PlanningService);
    encStore.getAssets.and.resolveTo([] as any);
    encStore.getLiabilities.and.resolveTo([] as any);
    encStore.getHoldings.and.resolveTo([] as any);
  });

  it('loads the full encrypted receipt and account context for the suggestion utility', done => {
    const transactions = [{ id: 1 } as any];
    const receipts = [{ id: 2, status: 'complete' } as any];
    const accounts = [{ id: 3, account_key: 'acct-a', confirmed: true } as any];
    encStore.getTransactions.and.resolveTo(transactions);
    encStore.getImportReceipts.and.resolveTo(receipts);
    encStore.getBankAccounts.and.resolveTo(accounts);

    service.getSpendingSuggestionContext().subscribe({
      next: context => {
        expect(context).toEqual({ transactions, receipts, accounts });
        done();
      },
      error: done.fail,
    });
  });

});
