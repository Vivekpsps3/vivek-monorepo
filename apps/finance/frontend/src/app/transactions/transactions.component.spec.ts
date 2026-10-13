import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject, from, of, Subject, throwError } from 'rxjs';
import { TransactionsComponent } from './transactions.component';
import { FinanceService } from '../services/finance.service';
import { ToastService } from '../services/toast.service';
import { ConfirmService } from '../services/confirm.service';
import { BankImportFilePreview } from '../models/transaction.model';
import { buildBankImportPreview, buildBankImportPreviews, listClientBankImports } from '../utils/bank-import.util';

describe('Transactions multi-file import UI', () => {
  let fixture: ComponentFixture<TransactionsComponent>;
  let component: TransactionsComponent;
  let finance: jasmine.SpyObj<FinanceService>;
  let routeQuery: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let dataChanges$: Subject<any>;
  let previewPromise: Promise<BankImportFilePreview[]> | undefined;
  const chaseFile = () => new File(['Transaction Date,Post Date,Description,Category,Type,Amount,Memo\n01/02/2026,01/03/2026,Coffee,Food,Sale,-10.00,'], 'chase.csv');
  const amexFile = () => new File(['Date,Description,Account #,Amount,Category\n01/02/2026,Lunch,-1001,20.00,Food'], 'amex.csv');

  beforeEach(async () => {
    dataChanges$ = new Subject<any>();
    finance = jasmine.createSpyObj('FinanceService', ['getTransactions', 'getAllTransactions', 'getImportReceipts', 'getBankAccounts', 'getImportBanks', 'previewBankImports', 'commitBankImports', 'addTransaction'], { isLoading$: of(false), transactions$: of([]), dataChanges$ });
    finance.getTransactions.and.returnValue(of([]));
    finance.getAllTransactions.and.returnValue(of([]));
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
        { provide: Router, useValue: { navigate: () => Promise.resolve(true) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(TransactionsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    (component as any).startImportWizard();
    fixture.detectChanges();
  });

  const button = (name: string): HTMLButtonElement => Array.from(fixture.nativeElement.querySelectorAll('button')).find((node: any) => node.textContent.trim() === name) as HTMLButtonElement;

  it('refreshes account and receipt context in the open import wizard without replacing its draft', async () => {
    let accounts: any[] = [{ id: 1, account_key: 'account-a', display_name: 'Old card label', confirmed: true, bank_slug: 'chase' }];
    let receipts: any[] = [];
    finance.getBankAccounts.and.callFake(() => of(accounts));
    finance.getImportReceipts.and.callFake(() => of(receipts));
    const draft = { id: 'draft-1', filename: 'statement.csv', bank_slug: 'chase', bank_account_id: 1, account_display: 'Old card label' } as any;
    component.importFiles = [draft];
    component.importStep = 'preview';
    component.importError = 'Keep this draft message';
    await new Promise(resolve => setTimeout(resolve, 150));

    accounts = [{ ...accounts[0], display_name: 'Renamed card' }];
    receipts = [{ id: 9, status: 'withdrawn', filenames: ['statement.csv'], unresolved: [], account_displays: ['Renamed card'] }];
    dataChanges$.next({ collections: ['bank_accounts', 'import_batches'], source: 'remote' });
    await new Promise(resolve => setTimeout(resolve, 150));
    fixture.detectChanges();

    expect(component.showImportModal).toBeTrue();
    expect(component.bankAccounts[0].display_name).toBe('Renamed card');
    expect(component.importReceipts.map(receipt => receipt.id)).toEqual([9]);
    expect(component.importFiles[0]).toBe(draft);
    expect(component.importStep).toBe('preview');
    expect(component.importError).toBe('Keep this draft message');
  });

  it('shows the exact account from a deep link after account options load asynchronously', async () => {
    const accounts = [{ id: 1, account_key: 'card-a', display_name: 'Primary card', confirmed: true, bank_slug: 'chase' }];
    finance.getBankAccounts.and.returnValue(of(accounts as any));
    routeQuery.next(convertToParamMap({ account: 'card-a' }));
    dataChanges$.next({ collections: ['bank_accounts'], source: 'remote' });
    await new Promise(resolve => setTimeout(resolve, 160));
    fixture.detectChanges();

    const accountSelect: HTMLSelectElement = fixture.nativeElement.querySelector('#tx-account-filter');
    expect(component.accountFilter).toBe('card-a');
    expect(accountSelect.value).toBe('card-a');
    expect(accountSelect.selectedOptions[0].textContent?.trim()).toBe('Primary card');
  });

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
    expect(button('Preview all files').disabled).toBeTrue();
    assignBank(0, 'chase');
    expect(button('Preview all files').disabled).toBeTrue();
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
    button('Import 2 transaction(s)').click();
    fixture.detectChanges();
    expect(finance.commitBankImports.calls.mostRecent().args[0].map(row => row.account_display)).toEqual(['Chase Checking', 'Amex Gold']);
    expect(component.showImportModal).toBeFalse();
  });

  it('keeps duplicate rows unselected and counts their amount only once', async () => {
    chooseFiles([chaseFile(), chaseFile()]);
    assignBank(0, 'chase');
    assignBank(1, 'chase');
    assignAccountName(0, 'Chase Sapphire');
    assignAccountName(1, 'Chase Sapphire');
    component.importFiles[1].account_key = component.importFiles[0].account_key;
    await preview();
    expect(component.importSummary.duplicate).toBe(1);
    expect(component.selectedImportCount).toBe(1);
    expect(component.selectedImportExpenseTotal).toBe(10);
    expect(fixture.nativeElement.querySelectorAll('.import-file-preview input[type="checkbox"]').length).toBe(1);
    component.toggleImportRow(component.importRows[1]);
    expect(component.selectedImportCount).toBe(1);
  });

  it('sends legacy account mapping only after the file-level opt-in', async () => {
    chooseFiles([chaseFile()]);
    assignBank(0, 'chase');
    assignAccountName(0, 'Chase Sapphire');
    expect(component.importFiles[0].map_legacy_account).toBeFalse();
    const legacy = await buildBankImportPreview('chase', 'legacy.csv', await chaseFile().text(), new Set());
    const legacyKey = legacy.rows[0].dedupe_key;
    finance.previewBankImports.and.callFake(files => {
      previewPromise = buildBankImportPreviews(files, new Set([legacyKey]), new Set([legacyKey]));
      return from(previewPromise);
    });

    component.onLegacyAccountMappingChange(component.importFiles[0], true);
    await preview();

    expect(finance.previewBankImports.calls.mostRecent().args[0][0]).toEqual(jasmine.objectContaining({
      account_display: 'Chase Sapphire',
      map_legacy_account: true,
    }));
    expect(component.legacyMappingCount).toBe(1);
    expect(component.canSaveImport).toBeTrue();
    expect(component.importActionLabel).toBe('Map 1 legacy transaction(s)');
    component.commitImport();
    expect(finance.commitBankImports.calls.mostRecent().args[0][0].legacy_dedupe_key).toBe(legacyKey);
  });

  it('keeps failed file diagnostics and imports valid rows from other files', async () => {
    chooseFiles([chaseFile(), amexFile()]);
    assignBank(0, 'amex');
    assignBank(1, 'amex');
    assignAccountName(0);
    assignAccountName(1);
    await preview();
    expect(component.importPreviews[0].error).toContain('Missing required columns');
    expect(fixture.nativeElement.querySelector('.import-file-preview [role="alert"]').textContent).toContain('Missing required columns');
    expect(component.selectedImportCount).toBe(1);
    button('Back').click();
    fixture.detectChanges();
    expect(component.importFiles.map(entry => entry.bank_slug)).toEqual(['amex', 'amex']);
    assignBank(0, 'chase');
    assignAccountName(0);
    await preview();
    expect(component.selectedImportCount).toBe(2);
  });

  it('retains selection for safe retries and prevents closing while saving', async () => {
    chooseFiles([chaseFile(), amexFile()]);
    assignBank(0, 'chase');
    assignBank(1, 'amex');
    assignAccountName(0);
    assignAccountName(1);
    await preview();
    finance.commitBankImports.and.returnValue(throwError(() => new Error('Connection failed')));
    component.commitImport();
    fixture.detectChanges();
    expect(component.showImportModal).toBeTrue();
    expect(component.selectedImportCount).toBe(2);
    expect(component.importError).toContain('Retry safely skips');
    const pending = new Subject<any>();
    finance.commitBankImports.and.returnValue(pending);
    component.commitImport();
    component.closeImportModal();
    component.clearImportSelection();
    expect(component.showImportModal).toBeTrue();
    expect(component.selectedImportCount).toBe(2);
    pending.next({ inserted: 1, skipped: 1, batch_id: 0 });
    expect(component.showImportModal).toBeFalse();
  });

  it('ignores duplicate transaction submits and re-enables retry after a failed save', () => {
    const failedWrite = new Subject<any>();
    finance.addTransaction.and.returnValue(failedWrite);
    component.openAddModal();
    component.newTx = {
      date: '2026-10-11', type: 'expense', category: 'Food', amount: 12,
      description: '', merchant: null, reviewed: true,
    };

    component.saveTransaction();
    component.saveTransaction();
    expect(finance.addTransaction).toHaveBeenCalledTimes(1);
    expect(component.saving).toBeTrue();

    failedWrite.error(new Error('Temporary vault write failure'));
    fixture.detectChanges();
    expect(component.saving).toBeFalse();
    expect(component.showModal).toBeTrue();

    finance.addTransaction.and.returnValue(of({ id: 9 } as any));
    component.saveTransaction();
    expect(finance.addTransaction).toHaveBeenCalledTimes(2);
    expect(component.showModal).toBeFalse();
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

  it('filters exact Activity context and calculates totals over the full matching ledger beyond pagination', () => {
    component.closeImportModal();
    const matching = Array.from({ length: 101 }, (_, index) => ({
      id: index + 1, date: '2026-05-12', type: 'expense', category: index % 2 ? 'Food' : ' FOOD ',
      amount: 10, description: 'Cafe charge', merchant: index % 2 ? 'Coffee Shop' : ' coffee shop ',
      bank_account_key: 'acct-a', account_display: 'Card A', kind: 'purchase', reviewed: false,
    }));
    const other = Array.from({ length: 50 }, (_, index) => ({
      id: 200 + index, date: '2026-04-12', type: 'expense', category: 'Travel', amount: 900,
      merchant: 'Rail', bank_account_key: 'acct-b', kind: 'purchase', reviewed: false,
    }));
    finance.getAllTransactions.and.returnValue(of([...matching, ...other] as any));
    component.retryActivityLoad();
    routeQuery.next(convertToParamMap({
      t: 'activity', month: '2026-05', account: 'acct-a', category: ' FOOD ', merchant: ' Coffee Shop ', review: 'needs',
    }));
    fixture.detectChanges();

    expect(component.matchingTransactions.length).toBe(101);
    expect(component.sortedMatchingTransactions.length).toBe(101);
    expect(component.sortedMatchingTransactions.length).toBeGreaterThan(component.pageSize);
    expect(component.filteredTransactions.length).toBe(100);
    expect(component.hasMore).toBeTrue();
    expect(component.monthExpenseTotal).toBe(1010);

    routeQuery.next(convertToParamMap({ t: 'activity', month: '2026-04', account: 'acct-b', category: 'travel', merchant: 'rail', review: 'needs' }));
    fixture.detectChanges();
    expect(component.matchingTransactions.length).toBe(50);
    expect(component.monthExpenseTotal).toBe(45000);
  });

  it('supports blank merchant and unassigned account exact filters', () => {
    component.closeImportModal();
    const unassigned = {
      id: 701, date: '2026-03-10', type: 'expense', category: 'Food', amount: 7,
      merchant: '  ', bank_account_key: null, kind: 'purchase', reviewed: false,
    };
    finance.getAllTransactions.and.returnValue(of([unassigned] as any));
    component.retryActivityLoad();
    routeQuery.next(convertToParamMap({
      t: 'activity', month: '2026-03', account: '__unassigned_account__', category: 'food', merchant: 'unassigned merchant', review: 'needs',
    }));
    expect(component.matchingTransactions.map(row => row.id)).toEqual([701]);
  });

  it('keeps all historical category totals visible for a full-history chart drilldown', () => {
    component.closeImportModal();
    const rows = [
      { id: 801, date: '2024-05-10', type: 'expense', category: 'Food', amount: 11, kind: 'purchase', reviewed: true },
      { id: 802, date: '2025-05-10', type: 'expense', category: ' FOOD ', amount: 19, kind: 'purchase', reviewed: true },
    ];
    finance.getAllTransactions.and.returnValue(of(rows as any));
    component.retryActivityLoad();
    routeQuery.next(convertToParamMap({ t: 'activity', month: 'all', category: 'food' }));
    expect(component.summaryMonth).toBe('');
    expect(component.matchingTransactions.map(row => row.id)).toEqual([801, 802]);
    expect(component.monthExpenseTotal).toBe(30);
  });
});
