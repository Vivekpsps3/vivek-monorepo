import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { ConfirmService, ToastService } from '@vivek/ui';
import { FinanceService } from '../services/finance.service';
import { TransactionsComponent } from './transactions.component';

describe('Transactions edit link', () => {
  it('keeps a saved editor closed when the ledger refreshes with the edit link still set', () => {
    const transactions$ = new Subject<Array<Record<string, unknown>>>();
    const row = {
      id: 7,
      date: '2026-10-22',
      type: 'expense',
      kind: 'purchase',
      category: 'Food',
      amount: 10,
      description: 'Coffee',
      merchant: 'Market',
    };
    const finance = jasmine.createSpyObj('FinanceService', [
      'getTransactions', 'getAllTransactions', 'getJobIncomes', 'getImportReceipts', 'getBankAccounts', 'getImportBanks',
    ], {
      isLoading$: of(false),
      transactions$,
      jobIncomes$: of([]),
      dataChanges$: new Subject(),
    });
    finance.getTransactions.and.returnValue(of([]));
    finance.getAllTransactions.and.returnValue(of([row]));
    finance.getJobIncomes.and.returnValue(of([]));
    finance.getImportReceipts.and.returnValue(of([]));
    finance.getBankAccounts.and.returnValue(of([]));
    finance.getImportBanks.and.returnValue(of([]));
    const params = convertToParamMap({ edit: '7' });

    TestBed.configureTestingModule({
      imports: [TransactionsComponent],
      providers: [
        { provide: FinanceService, useValue: finance },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error']) },
        { provide: ConfirmService, useValue: {} },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: params }, queryParamMap: new BehaviorSubject(params) } },
        { provide: Router, useValue: {
          events: new Subject(),
          navigate: () => Promise.resolve(true),
          createUrlTree: () => ({}),
          serializeUrl: () => '/spending',
        } },
      ],
    });
    const fixture: ComponentFixture<TransactionsComponent> = TestBed.createComponent(TransactionsComponent);
    const open = spyOn(fixture.componentInstance.transactionEditor, 'openTransactionEditor').and.callThrough();
    fixture.detectChanges();

    transactions$.next([row]);
    expect(open).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.showModal).toBeTrue();

    transactions$.next([{ ...row, amount: 99 }]);
    expect(open).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.editingTxId).toBe(7);
  });
});
