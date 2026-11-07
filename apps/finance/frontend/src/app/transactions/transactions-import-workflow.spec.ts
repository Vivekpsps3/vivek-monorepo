import { of, throwError } from 'rxjs';
import { TransactionsImportWorkflow } from './transactions-import-workflow';

function makeWorkflow(overrides: Record<string, unknown> = {}) {
  const finance: any = {
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
  const toast: any = { success: jasmine.createSpy('success'), error: jasmine.createSpy('error') };
  const confirm: any = { ask: jasmine.createSpy('ask').and.resolveTo(true) };
  const workflow = new TransactionsImportWorkflow(
    finance, toast, confirm, { markForCheck: () => undefined } as any, {} as any, {} as any,
  );
  return { workflow, finance, toast, confirm };
}

const receipt: any = {
  id: 9, bank_slugs: ['chase'], filenames: ['chase.csv'], status: 'complete',
  started_at: '2026-10-30T12:00:00Z', inserted_count: 3, unresolved: [],
};

describe('TransactionsImportWorkflow F9', () => {
  it('preselects the bank from the last receipt, else the only account bank', () => {
    const { workflow } = makeWorkflow();
    workflow.importReceipts = [receipt];
    expect(workflow.defaultBankSlug).toBe('chase');
    workflow.importReceipts = [];
    workflow.bankAccounts = [{ bank_slug: 'amex' } as any, { bank_slug: 'amex' } as any];
    expect(workflow.defaultBankSlug).toBe('amex');
    workflow.bankAccounts = [{ bank_slug: 'amex' } as any, { bank_slug: 'citi' } as any];
    expect(workflow.defaultBankSlug).toBe('');
  });

  it('labels the action from importable and selected counts, never Save receipt', () => {
    const { workflow } = makeWorkflow();
    workflow.importPreviews = [{
      id: 1, bank_slug: 'chase', filename: 'chase.csv', error: null,
      preview: { rows: [{ status: 'new' }, { status: 'new' }, { status: 'duplicate' }], summary: { total_parsed: 3, new: 2, duplicate: 1, skipped: 0, errors: 0 }, errors: [], skipped: [] },
    } as any];
    expect(workflow.importableCount).toBe(2);
    expect(workflow.importActionLabel).toBe('Select the transactions to import');
    workflow.importSelected = new Set(['a']);
    (workflow as any).importRows; // warm getter
    workflow.importPreviews[0].preview!.rows = [{ status: 'new', dedupe_key: 'a' }] as any;
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

  it('renders the shared receipt line and status labels', () => {
    const { workflow } = makeWorkflow();
    expect(workflow.receiptLineFor(receipt)).toBe('chase.csv · Oct 30, 2026 · Imported · 3 saved');
    expect(workflow.importStatusLabel({ status: 'duplicate' } as any)).toBe('Already imported');
    expect(workflow.importStatusLabel({ status: 'new', kind: 'refund' } as any)).toBe('Refund');
    expect(workflow.importStatusLabel({ status: 'new', kind: 'purchase' } as any)).toBe('Purchase');
  });
});
