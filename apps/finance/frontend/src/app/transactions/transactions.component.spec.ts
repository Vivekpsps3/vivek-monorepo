import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { from, of, Subject, throwError } from 'rxjs';
import { TransactionsComponent } from './transactions.component';
import { FinanceService } from '../services/finance.service';
import { ToastService } from '../services/toast.service';
import { ConfirmService } from '../services/confirm.service';
import { BankImportFilePreview } from '../models/transaction.model';
import { buildBankImportPreviews, listClientBankImports } from '../utils/bank-import.util';

describe('Transactions multi-file import UI', () => {
  let fixture: ComponentFixture<TransactionsComponent>;
  let component: TransactionsComponent;
  let finance: jasmine.SpyObj<FinanceService>;
  let previewPromise: Promise<BankImportFilePreview[]> | undefined;
  const chaseFile = () => new File(['Transaction Date,Post Date,Description,Category,Type,Amount,Memo\n01/02/2026,01/03/2026,Coffee,Food,Sale,-10.00,'], 'chase.csv');
  const amexFile = () => new File(['Date,Description,Account #,Amount,Category\n01/02/2026,Lunch,-1001,20.00,Food'], 'amex.csv');

  beforeEach(async () => {
    finance = jasmine.createSpyObj('FinanceService', ['getTransactions', 'getImportBanks', 'previewBankImports', 'commitBankImports'], { isLoading$: of(false), transactions$: of([]) });
    finance.getTransactions.and.returnValue(of([]));
    finance.getImportBanks.and.returnValue(of(listClientBankImports()));
    previewPromise = undefined;
    finance.previewBankImports.and.callFake(files => {
      previewPromise = buildBankImportPreviews(files, new Set());
      return from(previewPromise);
    });
    finance.commitBankImports.and.returnValue(of({ inserted: 2, skipped: 0, batch_id: 0 }));
    await TestBed.configureTestingModule({
      imports: [TransactionsComponent],
      providers: [
        { provide: FinanceService, useValue: finance },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error']) },
        { provide: ConfirmService, useValue: {} },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
        { provide: Router, useValue: { navigate: () => Promise.resolve(true) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(TransactionsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    component.openImportModal();
    fixture.detectChanges();
  });

  const button = (name: string): HTMLButtonElement => Array.from(fixture.nativeElement.querySelectorAll('button')).find((node: any) => node.textContent.trim() === name) as HTMLButtonElement;

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
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('#import-bank-' + entry.id);
    select.value = slug;
    select.dispatchEvent(new Event('change'));
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
    expect(finance.commitBankImports.calls.mostRecent().args[0].map(row => row.account_display)).toEqual(['Chase ···chase', 'American Express ···1001']);
    expect(component.showImportModal).toBeFalse();
  });

  it('keeps duplicate rows unselected and counts their amount only once', async () => {
    chooseFiles([chaseFile(), chaseFile()]);
    assignBank(0, 'chase');
    assignBank(1, 'chase');
    await preview();
    expect(component.importSummary.duplicate).toBe(1);
    expect(component.selectedImportCount).toBe(1);
    expect(component.selectedImportExpenseTotal).toBe(10);
    expect(fixture.nativeElement.querySelectorAll('.import-file-preview input[type="checkbox"]').length).toBe(1);
    component.toggleImportRow(component.importRows[1]);
    expect(component.selectedImportCount).toBe(1);
  });

  it('keeps failed file diagnostics and imports valid rows from other files', async () => {
    chooseFiles([chaseFile(), amexFile()]);
    assignBank(0, 'amex');
    assignBank(1, 'amex');
    await preview();
    expect(component.importPreviews[0].error).toContain('Missing required columns');
    expect(fixture.nativeElement.querySelector('.import-file-preview [role="alert"]').textContent).toContain('Missing required columns');
    expect(component.selectedImportCount).toBe(1);
    button('Back').click();
    fixture.detectChanges();
    expect(component.importFiles.map(entry => entry.bank_slug)).toEqual(['amex', 'amex']);
    assignBank(0, 'chase');
    await preview();
    expect(component.selectedImportCount).toBe(2);
  });

  it('retains selection for safe retries and prevents closing while saving', async () => {
    chooseFiles([chaseFile(), amexFile()]);
    assignBank(0, 'chase');
    assignBank(1, 'amex');
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

  it('adds more files, removes individual files, and discards canceled previews', () => {
    chooseFiles([chaseFile()]);
    assignBank(0, 'chase');
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
});
