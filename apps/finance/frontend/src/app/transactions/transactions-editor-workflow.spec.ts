import { of, throwError } from 'rxjs';
import { TransactionsEditorWorkflow } from './transactions-editor-workflow';

function editor() {
  const finance = jasmine.createSpyObj('FinanceService', ['updateTransaction', 'addTransaction']);
  finance.updateTransaction.and.returnValue(of({}));
  finance.addTransaction.and.returnValue(of({}));
  const toast = jasmine.createSpyObj('ToastService', ['success', 'error']);
  const route = { snapshot: { queryParamMap: { get: () => null, has: () => false } } };
  const router = { navigate: () => Promise.resolve(true) };
  const workflow = new TransactionsEditorWorkflow(
    finance,
    toast,
    { markForCheck() {} } as never,
    route as never,
    router as never,
  );
  return { workflow, finance, toast };
}

describe('TransactionsEditorWorkflow', () => {
  it('writes an untouched legacy 1.005 back unchanged', () => {
    const { workflow, finance } = editor();
    workflow.openTransactionEditor({
      id: 4,
      amount: 1.005,
      date: '2026-01-02',
      type: 'expense',
      category: 'Food',
      description: 'Lunch',
      kind: 'purchase',
    } as never);
    workflow.saveTransaction();
    expect(finance.updateTransaction.calls.mostRecent().args[1].amount).toBe(1.005);
  });

  it('rejects an edited amount that has more than two decimal places', () => {
    const { workflow, finance } = editor();
    workflow.openTransactionEditor({
      id: 4,
      amount: 1.005,
      date: '2026-01-02',
      type: 'expense',
      category: 'Food',
      description: '',
      kind: 'purchase',
    } as never);
    workflow.onAmountChange('1.005');
    workflow.saveTransaction();
    expect(finance.updateTransaction).not.toHaveBeenCalled();
    expect(workflow.fieldErrors.map(error => error.message)).toContain('Enter an amount with up to 2 decimal places.');
  });

  it('starts a new transaction with an empty amount', () => {
    const { workflow } = editor();
    workflow.openAddModal(null);
    expect(workflow.newTx.amount).toBe('' as unknown as number);
  });

  it('shows the save failure inside the dialog', () => {
    const { workflow, finance, toast } = editor();
    finance.updateTransaction.and.returnValue(throwError(() => ({ error: { detail: 'Synthetic save failed' } })));
    workflow.openTransactionEditor({
      id: 4,
      amount: 12,
      date: '2026-01-02',
      type: 'expense',
      category: 'Food',
      description: 'Lunch',
      kind: 'purchase',
    } as never);
    workflow.saveTransaction();
    expect(workflow.showModal).toBeTrue();
    expect(workflow.transactionSaveError).toBe("Couldn't save. Something went wrong. Try again.");
    expect(workflow.newTx.category).toBe('Food');
    expect(toast.error).not.toHaveBeenCalled();
  });
});
