import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture,TestBed } from '@angular/core/testing';
import { ActivatedRoute,convertToParamMap,Router } from '@angular/router';
import { ConfirmService,ToastService } from '@vivek/ui';
import { BehaviorSubject,from,of,Subject,throwError } from 'rxjs';
import { BankImportFilePreview } from '../models/transaction.model';
import { FinanceService } from '../services/finance.service';
import { buildBankImportPreviews,listClientBankImports } from '../utils/bank-import.util';
import { TransactionsEditorWorkflow } from './transactions-editor-workflow';
import { TransactionsImportWorkflow } from './transactions-import-workflow';
import { TransactionsComponent } from './transactions.component';

describe('Transactions multi-file import UI', () => {
  let fixture: ComponentFixture<TransactionsComponent>;
  let component: TransactionsComponent;
  let finance: jasmine.SpyObj<FinanceService>;
  let routeQuery: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let dataChanges$: Subject<any>;
  let jobIncomeResults$: BehaviorSubject<any[]>;
  let previewPromise: Promise<BankImportFilePreview[]> | undefined;
  const chaseFile = () => new File(['Transaction Date,Post Date,Description,Category,Type,Amount,Memo\n01/02/2026,01/03/2026,Coffee,Food,Sale,-10.00,'], 'chase.csv');
  const amexFile = () => new File(['Date,Description,Account #,Amount,Category\n01/02/2026,Lunch,-1001,20.00,Food'], 'amex.csv');

  beforeEach(async () => {
    dataChanges$ = new Subject<any>();
    jobIncomeResults$ = new BehaviorSubject<any[]>([]);
    finance = jasmine.createSpyObj('FinanceService', ['getTransactions', 'getAllTransactions', 'getJobIncomes', 'getImportReceipts', 'getBankAccounts', 'getImportBanks', 'previewBankImports', 'commitBankImports', 'addTransaction'], { isLoading$: of(false), transactions$: of([]), jobIncomes$: of([]), dataChanges$ });
    finance.getTransactions.and.returnValue(of([]));
    finance.getAllTransactions.and.returnValue(of([]));
    finance.getJobIncomes.and.returnValue(jobIncomeResults$.asObservable());
    finance.getImportReceipts.and.returnValue(of([]));
    finance.getBankAccounts.and.returnValue(of([]));
    finance.getImportBanks.and.returnValue(of(listClientBankImports()));
    previewPromise = undefined;
    finance.previewBankImports.and.callFake(files => {
      previewPromise = buildBankImportPreviews(files, new Set());
      return from(previewPromise);
    });
    finance.commitBankImports.and.returnValue(of({ inserted: 2, skipped: 0, batch_id: 0 }));
    routeQuery = new BehaviorSubject(convertToParamMap({}));
    await TestBed.configureTestingModule({
      imports: [TransactionsComponent],
      providers: [
        { provide: FinanceService, useValue: finance },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error']) },
        { provide: ConfirmService, useValue: {} },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) }, queryParamMap: routeQuery.asObservable() } },
        { provide: Router, useValue: {
          events: new Subject(),
          navigate: () => Promise.resolve(true),
          createUrlTree: () => ({}),
          serializeUrl: () => '/finance/recurring?t=pay',
        } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(TransactionsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    (component as any).startImportWizard();
    fixture.detectChanges();
  });

  const button = (name: string): HTMLButtonElement => Array.from(fixture.nativeElement.querySelectorAll('button')).find((node: any) => node.textContent.trim() === name) as HTMLButtonElement;

  // The import-context refresh is debounce-driven (two 60ms debounce stages
  // in TransactionsImportWorkflow), so a fixed sleep races it under load:
  // any delay in the first stage pushes completion past the sleep. Wait for
  // the refresh outcome itself instead of a wall-clock guess.

  function chooseFiles(files: File[]) {
    const transfer = new DataTransfer();
    for (const file of files) transfer.items.add(file);
    const input: HTMLInputElement = fixture.nativeElement.querySelector('#import-file');
    expect(input.multiple).toBeTrue();
    input.files = transfer.files;
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  function assignBank(index: number, slug: string) {
    const entry = component.importFiles[index];
    component.onImportBankSelectionChange(entry, slug);
    fixture.detectChanges();
  }

  function assignAccountName(index: number, label?: string) {
    const entry = component.importFiles[index];
    entry.new_account_label = label || `${entry.bank_slug} account`;
    component.onNewAccountLabelChange(entry);
    fixture.detectChanges();
  }

  async function preview() {
    button('Preview all files').click();
    fixture.detectChanges();
    expect(previewPromise).toBeDefined();
    await previewPromise;
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('selects multiple files, assigns independent banks, previews and commits the combined selection', async () => {
    chooseFiles([chaseFile(), amexFile()]);
    expect(component.importFiles.length).toBe(2);
    expect(button('Preview all files').disabled).toBeFalse();
    button('Preview all files').click();
    fixture.detectChanges();
    expect(component.importError).toContain('Choose the bank for chase.csv first.');
    expect(previewPromise).toBeUndefined();
    assignBank(0, 'chase');
    expect(button('Preview all files').disabled).toBeFalse();
    assignBank(1, 'amex');
    assignAccountName(0, 'Chase Checking');
    assignAccountName(1, 'Amex Gold');
    expect(button('Preview all files').disabled).toBeFalse();
    await preview();
    expect(component.selectedImportCount).toBe(2);
    expect(component.selectedImportExpenseTotal).toBe(30);
    const sections = fixture.nativeElement.querySelectorAll('.import-file-preview');
    expect(sections.length).toBe(2);
    expect(sections[0].textContent).toContain('chase.csv · Chase');
    expect(sections[1].textContent).toContain('amex.csv · American Express');
    button('Import 2 transactions').click();
    fixture.detectChanges();
    expect(finance.commitBankImports.calls.mostRecent().args[0].map(row => row.account_display)).toEqual(['Chase Checking', 'Amex Gold']);
    expect(component.showImportModal).toBeFalse();
  });

  it('adds more files, removes individual files, and discards canceled previews', () => {
    chooseFiles([chaseFile()]);
    assignBank(0, 'chase');
    assignAccountName(0);
    chooseFiles([amexFile()]);
    expect(component.importFiles[0].bank_slug).toBe('chase');
    component.removeImportFile(component.importFiles[1].id);
    expect(component.importFiles.length).toBe(1);
    const pending = new Subject<BankImportFilePreview[]>();
    finance.previewBankImports.and.returnValue(pending);
    component.runImportPreview();
    component.closeImportModal();
    pending.next([]);
    expect(component.importStep).toBe('upload');
    expect(component.importParsing).toBeFalse();
    expect(component.importFiles).toEqual([]);
  });

  it('shows scheduled work income beside recorded income and reconciles the aggregate overlap', () => {
    component.closeImportModal();
    component.typeFilter = 'income';
    routeQuery.next(convertToParamMap({ t: 'activity', v: 'income', month: '2026-01' }));
    const job = {
      id: 31,
      employer: 'Acme',
      pay_frequency: 'annual',
      payday_frequency: 'weekly',
      first_pay_date: '2026-01-08',
      base_pay: 52_000,
      annual_bonus: 0,
      annual_equity: 0,
      annual_other: 0,
      annual_taxes: 0,
      annual_deductions: 0,
      effective_date: '2026-01-01',
      is_active: true,
    };
    jobIncomeResults$.next([job]);
    finance.getAllTransactions.and.returnValue(of([{
      id: 77, date: '2026-01-15', type: 'income', category: 'pay', amount: 3_800, merchant: 'Payroll',
    }] as any));
    component.retryActivityLoad();
    fixture.detectChanges();

    const summary = component.workIncomeSummary!;
    expect(component.workIncomePeriod).toEqual({ start: '2026-01-01', end: '2026-01-31', label: '2026-01-01–2026-01-31' });
    expect(summary.observed_income).toBe(3_800);
    expect(summary.scheduled_income).toBe(4_000);
    expect(summary.income_overlap_adjustment).toBe(-3_800);
    expect(summary.total_income).toBe(4_000);
    expect(summary.income_occurrences.reduce((sum, row) => sum + row.amount, 0)).toBe(summary.total_income);
    expect(component.workIncomeSources.filter(row => row.kind === 'paycheck').length).toBe(4);
    expect(component.workIncomeSources.some(row => row.kind === 'overlap')).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('Scheduled work income');
    expect(fixture.nativeElement.textContent).toContain('Combined income');
    expect(fixture.nativeElement.textContent).toContain('Overlap adjustment');
    expect(fixture.nativeElement.textContent).toContain('not matched to a specific deposit');
  });

  it('requires a finite work-income date scope and intersects it with Activity filters', () => {
    component.summaryMonth = '2026-01';
    component.selectedCalendarDate = '2026-02-01';
    expect(component.workIncomePeriod).toBeNull();

    component.selectedCalendarDate = '2026-01-15';
    component.fromDate = '2026-01-16';
    expect(component.workIncomePeriod).toBeNull();

    component.selectedCalendarDate = null;
    component.summaryMonth = '';
    component.fromDate = '2026-01-10';
    component.throughDate = '2026-01-20';
    expect(component.workIncomePeriod).toEqual({ start: '2026-01-10', end: '2026-01-20', label: '2026-01-10–2026-01-20' });

    component.throughDate = '';
    expect(component.workIncomePeriod).toBeNull();
    component.fromDate = '';
    expect(component.workIncomePeriod).toBeNull();
  });

});

describe('Transactions delete and undo errors', () => {
  function makeComponent() {
    const finance = jasmine.createSpyObj('FinanceService', ['deleteTransaction', 'restoreTransaction']);
    const toast = jasmine.createSpyObj('ToastService', ['success', 'error'], { toasts$: of([]) });
    const confirm = { ask: () => Promise.resolve(true) } as unknown as ConfirmService;
    const component = TestBed.runInInjectionContext(() => new TransactionsComponent(
      finance,
      toast,
      confirm,
      { markForCheck() {} } as ChangeDetectorRef,
      {} as ActivatedRoute,
      {} as Router,
      {} as TransactionsImportWorkflow,
      { dismiss: () => undefined } as TransactionsEditorWorkflow,
    ));
    component.allTransactions = [transaction];
    return { component, finance, toast };
  }

  const transaction = {
    id: 8, date: '2026-10-03', type: 'expense' as const, category: 'Food', amount: -45.67, description: 'Legacy return',
  };

  it('shows one retry toast when undoing a transaction delete fails and keeps the amount', async () => {
    const { component, finance, toast } = makeComponent();
    finance.deleteTransaction.and.returnValue(of({ ok: true }));
    finance.restoreTransaction.and.returnValue(throwError(() => new Error('nope')));
    await component.deleteTransaction(transaction);
    const undo = toast.success.calls.mostRecent().args[1] as () => void;
    undo();
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error.calls.mostRecent().args[0]).toBe("Couldn't restore this transaction.");
    expect(toast.error.calls.mostRecent().args[1].label).toBe('Try again');
    expect(finance.restoreTransaction).toHaveBeenCalledWith(jasmine.objectContaining({
      date: '2026-10-03', category: 'Food', amount: -45.67, description: 'Legacy return',
    }), true);
    const retry = toast.error.calls.mostRecent().args[1].run as () => void;
    finance.restoreTransaction.calls.reset();
    toast.error.calls.reset();
    retry();
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(finance.restoreTransaction.calls.mostRecent().args[0].amount).toBe(-45.67);
    component.ngOnDestroy();
    finance.restoreTransaction.calls.reset();
    retry();
    expect(finance.restoreTransaction).not.toHaveBeenCalled();
  });
});
