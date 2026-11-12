import { ChangeDetectorRef } from '@angular/core';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { ConfirmService, ToastService } from '@vivek/ui';
import { Observable, of, Subject, throwError } from 'rxjs';
import { fakeAsync, tick } from '@angular/core/testing';
import { MarketRefreshCoordinatorService } from '../services/market-refresh-coordinator.service';
import { lockFinance } from '../crypto/lock-finance';
import {
  BankAccountRecord,
  BankImportFilePreview,
  ImportPreviewRow,
  ImportReceipt,
} from '../models/transaction.model';
import { FinanceService } from '../services/finance.service';
import { TransactionsImportWorkflow } from './transactions-import-workflow';

function makeWorkflow(overrides: Record<string, unknown> = {}) {
  const finance = {
    dataChanges$: of(),
    getBankAccounts: () => of([]),
    getImportReceipts: () => of([]),
    getImportBanks: () => of([]),
    previewUndoImportReceipt: jasmine.createSpy('previewUndoImportReceipt')
      .and.returnValue(of({ removable: 2, editedKept: 1, alreadyGone: 0 })),
    undoBankImport: jasmine.createSpy('undoBankImport').and.returnValue(of({ removed: 2, edited: 1, missing: 0 })),
    deleteImportReceipt: jasmine.createSpy('deleteImportReceipt').and.returnValue(of(undefined)),
    ...overrides,
  };
  const toast = { success: jasmine.createSpy('success'), error: jasmine.createSpy('error') };
  const confirm = { ask: jasmine.createSpy('ask').and.resolveTo(true) };
  const workflow = new TransactionsImportWorkflow(
    finance as unknown as FinanceService,
    toast as unknown as ToastService,
    confirm as unknown as ConfirmService,
    { markForCheck: () => undefined } as unknown as ChangeDetectorRef,
    {} as unknown as ActivatedRoute,
    {} as unknown as Router,
  );
  return { workflow, finance, toast, confirm };
}

const receipt: ImportReceipt = {
  id: 9, bank_slugs: ['chase'], filenames: ['chase.csv'], status: 'complete',
  started_at: '2026-10-30T12:00:00Z', selected_row_count: 3, inserted_count: 3,
  unresolved: [], account_displays: [],
};

function bankAccount(bank_slug: string): BankAccountRecord {
  return {
    id: 1, bank_slug, account_mask: '1234', account_key: bank_slug,
    display_name: bank_slug, confirmed: true,
  };
}

function previewRow(overrides: Partial<ImportPreviewRow> = {}): ImportPreviewRow {
  return {
    dedupe_key: '', date: '2026-10-30', account_mask: '1234', account_display: 'Card',
    description: '', category: '', amount: 0, status: 'new', ...overrides,
  };
}

describe('TransactionsImportWorkflow F9', () => {
  it('preselects the bank from the last receipt, else the only account bank', () => {
    const { workflow } = makeWorkflow();
    workflow.importReceipts = [receipt];
    expect(workflow.defaultBankSlug).toBe('chase');
    workflow.importReceipts = [];
    workflow.bankAccounts = [bankAccount('amex'), bankAccount('amex')];
    expect(workflow.defaultBankSlug).toBe('amex');
    workflow.bankAccounts = [bankAccount('amex'), bankAccount('citi')];
    expect(workflow.defaultBankSlug).toBe('');
  });

  it('labels the action from importable and selected counts, never Save receipt', () => {
    const { workflow } = makeWorkflow();
    const preview: BankImportFilePreview = {
      id: 1, bank_slug: 'chase', filename: 'chase.csv', error: null,
      preview: {
        bank: 'chase', filename: 'chase.csv',
        rows: [previewRow(), previewRow(), previewRow({ status: 'duplicate' })],
        summary: { total_parsed: 3, new: 2, duplicate: 1, skipped: 0, errors: 0 },
        errors: [], skipped: [],
      },
    };
    workflow.importPreviews = [preview];
    expect(workflow.importableCount).toBe(2);
    expect(workflow.importActionLabel).toBe('Select the transactions to import');
    workflow.importSelected = new Set(['a']);
    expect(workflow.importRows.length).toBe(3);
    workflow.importPreviews[0].preview!.rows = [previewRow({ dedupe_key: 'a' })];
    expect(workflow.importActionLabel).toBe('Import 1 transaction');
    expect(workflow.importActionLabel).not.toContain('Save receipt');
  });

  it('previews undo counts and puts them in the confirm dialog', async () => {
    const { workflow, finance, confirm, toast } = makeWorkflow();
    await workflow.undoImport(receipt);
    expect(finance.previewUndoImportReceipt).toHaveBeenCalledWith(9);
    expect(confirm.ask).toHaveBeenCalledWith(
      'Undo this import?',
      'Remove 2 transactions this import added. 1 transaction you edited will stay. This also removes the statement coverage this import confirmed.',
      'Undo import', 'Cancel',
    );
    expect(finance.undoBankImport).toHaveBeenCalledWith(9);
    expect(toast.success).toHaveBeenCalled();
  });

  it('does not undo when the preview fails or the user cancels', async () => {
    const failing = makeWorkflow({
      previewUndoImportReceipt: jasmine.createSpy('preview').and.returnValue(throwError(() => new Error('nope'))),
    });
    await failing.workflow.undoImport(receipt);
    expect(failing.finance.undoBankImport).not.toHaveBeenCalled();
    expect(failing.toast.error).toHaveBeenCalled();

    const cancelling = makeWorkflow();
    cancelling.confirm.ask.and.resolveTo(false);
    await cancelling.workflow.undoImport(receipt);
    expect(cancelling.finance.undoBankImport).not.toHaveBeenCalled();
  });

  it('deletes a withdrawn receipt record only after confirm', async () => {
    const { workflow, finance, confirm } = makeWorkflow();
    await workflow.deleteImportReceipt({ ...receipt, status: 'withdrawn' });
    expect(confirm.ask).toHaveBeenCalledWith(
      'Delete this receipt record?',
      "The transactions stay. You just won't be able to undo this import later.",
      'Delete receipt', 'Cancel',
    );
    expect(finance.deleteImportReceipt).toHaveBeenCalledWith(9);
  });

  it('clears cached bank accounts when a refresh hits a locked vault and keeps them on other errors', fakeAsync(() => {
    const dataChanges$ = new Subject<{ collections: string[]; source: string }>();
    let mode: 'rows' | 'locked' | 'offline' = 'rows';
    const { workflow } = makeWorkflow({
      dataChanges$,
      getBankAccounts: () => {
        if (mode === 'locked') return throwError(() => new Error('Vault locked'));
        if (mode === 'offline') return throwError(() => new Error('offline'));
        return of([bankAccount('chase')]);
      },
      getImportReceipts: () => of([receipt]),
    });
    workflow.bankAccounts = [bankAccount('amex')];
    workflow.connectImportContextRefresh();
    tick(60);
    expect(workflow.bankAccounts.map(account => account.bank_slug)).toEqual(['chase']);
    expect(workflow.importReceipts).toEqual([receipt]);

    mode = 'locked';
    dataChanges$.next({ collections: ['bank_accounts'], source: 'remote' });
    tick(120);
    expect(workflow.bankAccounts).toEqual([]);
    expect(workflow.importReceipts).toEqual([receipt]);

    mode = 'rows';
    dataChanges$.next({ collections: ['bank_accounts'], source: 'remote' });
    tick(120);
    expect(workflow.bankAccounts.map(account => account.bank_slug)).toEqual(['chase']);

    mode = 'offline';
    dataChanges$.next({ collections: ['bank_accounts'], source: 'remote' });
    tick(120);
    expect(workflow.bankAccounts.map(account => account.bank_slug)).toEqual(['chase']);
  }));

  it('clears cached bank accounts when a lookup completes without rows', fakeAsync(() => {
    const { workflow } = makeWorkflow({
      getBankAccounts: () => new Observable(subscriber => subscriber.complete()),
      getImportReceipts: () => of([]),
    });
    workflow.bankAccounts = [bankAccount('chase')];
    workflow.connectImportContextRefresh();
    tick(60);
    expect(workflow.bankAccounts).toEqual([]);
  }));

  it('renders the shared receipt line and status labels', () => {
    const { workflow } = makeWorkflow();
    expect(workflow.receiptLineFor(receipt)).toBe('chase.csv · Oct 30, 2026 · Imported · 3 saved');
    expect(workflow.importStatusLabel(previewRow({ status: 'duplicate' }))).toBe('Already imported');
    expect(workflow.importStatusLabel(previewRow({ kind: 'refund' }))).toBe('Refund');
    expect(workflow.importStatusLabel(previewRow({ kind: 'purchase' }))).toBe('Purchase');
  });

  it('CSV2 does not write a custom import that has no valid rows, then commits the correction', () => {
    const commit = jasmine.createSpy('commitBankImports').and.returnValue(of({ inserted: 1, skipped: 0, batch_id: 4 }));
    const { workflow } = makeWorkflow({ commitBankImports: commit, saveCsvMappingProfile: () => of({ id: 1, name: 'Custom CSV', format_version: 1, record_type: 'csv_mapping_profile', mapping: { version: 1 } }) });
    const file = { id: 1, bank_slug: 'custom_csv', file: new File(['Date,Amount'], 'mixed.csv'), csv_mapping: { version: 1 as const, date_column: 'Date', description_column: 'Description', amount_column: 'Amount', date_format: 'iso' as const, amount_mode: 'signed' as const, outflow_sign: 'negative' as const, refund_mode: 'description' as const, header_row: true } };
    workflow.importFiles = [file];
    workflow.importPreviews = [{
      id: 1, bank_slug: 'custom_csv', filename: 'mixed.csv', error: null,
      preview: {
        bank: 'Custom CSV', filename: 'mixed.csv', rows: [], skipped: [],
        errors: [{ line: 2, reason: 'unsupported currency EUR. Finance records USD only.' }],
        summary: { total_parsed: 0, new: 0, duplicate: 0, skipped: 0, errors: 1 },
      },
    }];
    workflow.commitImport();
    expect(commit).not.toHaveBeenCalled();
    expect(workflow.importError).toContain('unsupported currency EUR');

    const row = previewRow({ dedupe_key: 'bus', description: 'Bus', amount: 3, kind: 'purchase' });
    workflow.importPreviews = [{
      id: 1, bank_slug: 'custom_csv', filename: 'mixed.csv', error: null,
      preview: {
        bank: 'Custom CSV', filename: 'mixed.csv', rows: [row], skipped: [], errors: [],
        summary: { total_parsed: 1, new: 1, duplicate: 0, skipped: 0, errors: 0 },
      },
    }];
    workflow.importSelected = new Set(['bus']);
    workflow.commitImport();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit.calls.mostRecent().args[0]).toEqual([row]);
  });

  it('CSV3 drops custom CSV text when the vault locks', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        { provide: FinanceService, useValue: { clearSessionState: () => undefined } },
        { provide: MarketRefreshCoordinatorService, useValue: { endSession: () => undefined } },
      ],
    });
    const { workflow } = makeWorkflow();
    workflow.showImportModal = true;
    workflow.importFiles = [{ id: 1, bank_slug: 'custom_csv', file: new File(['SECRET-NOTE-77,1'], 'secret.csv') }];
    workflow.importPreviews = [{ id: 1, bank_slug: 'custom_csv', filename: 'secret.csv', preview: null, error: 'SECRET-NOTE-77' }];
    try {
      await lockFinance(TestBed.inject(Injector));
    } catch {
      // The snapshot drop runs before lock finishes talking to the vault.
    }
    expect(workflow.showImportModal).toBeFalse();
    expect(workflow.importFiles).toEqual([]);
    expect(workflow.importPreviews).toEqual([]);
    workflow.ngOnDestroy();
    TestBed.resetTestingModule();
  });
});
