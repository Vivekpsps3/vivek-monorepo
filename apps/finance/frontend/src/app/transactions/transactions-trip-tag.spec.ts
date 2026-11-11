import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of, Subject } from 'rxjs';
import { ConfirmService, ToastService } from '@vivek/ui';
import { FinanceService } from '../services/finance.service';
import { TransactionsComponent } from './transactions.component';
import { RECENT_PAST_TRIP_LIMIT } from './trip-tag';

describe('Transaction trip tag editor', () => {
  let fixture: ComponentFixture<TransactionsComponent>;
  let http: HttpTestingController;

  const home = {
    in_progress: [{ id: 2, title: 'Now' }],
    upcoming: [{ id: 3, title: 'Soon' }],
    past: Array.from({ length: RECENT_PAST_TRIP_LIMIT + 1 }, (_, index) => ({ id: 10 + index, title: `Past ${index}` })),
  };

  beforeEach(async () => {
    const finance = jasmine.createSpyObj('FinanceService', [
      'getTransactions', 'getAllTransactions', 'getJobIncomes', 'getImportReceipts', 'getBankAccounts', 'addTransaction', 'updateTransaction',
    ], {
      isLoading$: of(false),
      transactions$: of([]),
      jobIncomes$: of([]),
      dataChanges$: new Subject(),
    });
    finance.getTransactions.and.returnValue(of([]));
    finance.getAllTransactions.and.returnValue(of([]));
    finance.getJobIncomes.and.returnValue(of([]));
    finance.getImportReceipts.and.returnValue(of([]));
    finance.getBankAccounts.and.returnValue(of([]));
    finance.addTransaction.and.returnValue(of({ id: 1 }));
    finance.updateTransaction.and.returnValue(of({ id: 4 }));
    await TestBed.configureTestingModule({
      imports: [TransactionsComponent, HttpClientTestingModule],
      providers: [
        { provide: FinanceService, useValue: finance },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error']) },
        { provide: ConfirmService, useValue: {} },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) }, queryParamMap: of(convertToParamMap({})) } },
        { provide: Router, useValue: { events: new Subject(), navigate: () => Promise.resolve(true), createUrlTree: () => ({}), serializeUrl: () => '' } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(TransactionsComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  function labels(): string[] {
    fixture.detectChanges();
    return [...fixture.nativeElement.querySelectorAll('#tx-trip option')].map((option: HTMLOptionElement) => option.textContent?.trim() ?? '');
  }

  it('shows ordered trip choices, an orphan, and the list-outage note in the editor', () => {
    fixture.componentInstance.openAddModal();
    http.expectOne('/travel/api/home').flush(home);
    expect(labels()).toEqual([
      'No trip', 'Now', 'Soon',
      ...Array.from({ length: RECENT_PAST_TRIP_LIMIT }, (_, index) => `Past ${index}`),
    ]);

    fixture.componentInstance.transactionEditor.openTransactionEditor({
      id: 4, amount: 12, date: '2026-01-02', type: 'expense', category: 'Food',
      description: 'Lunch', kind: 'purchase', trip_id: 10 + RECENT_PAST_TRIP_LIMIT,
    });
    http.expectOne('/travel/api/home').flush(home);
    expect(labels().at(-1)).toBe('Earlier trip');

    fixture.componentInstance.transactionEditor.openAddModal(null);
    http.expectOne('/travel/api/home').flush('nope', { status: 503, statusText: 'unavailable' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#tx-trip-note')?.textContent).toContain('save without a trip tag');
    expect(labels()).toEqual(['No trip']);
  });
});
