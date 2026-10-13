import { Transaction } from '../models/transaction.model';

export type SpendingGroupDimension = 'category' | 'merchant';

/** Filter sentinel for activity rows without a bank account identity. */
export const UNASSIGNED_ACCOUNT_FILTER = '__unassigned_account__';

export function normalizeSpendingLabel(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function spendingGroupLabel(transaction: Transaction, dimension: SpendingGroupDimension): string {
  const value = dimension === 'category' ? transaction.category : transaction.merchant;
  return String(value || '').trim() || (dimension === 'category' ? 'Uncategorized' : 'Unassigned merchant');
}

export function spendingGroupKey(transaction: Transaction, dimension: SpendingGroupDimension): string {
  return normalizeSpendingLabel(spendingGroupLabel(transaction, dimension));
}
