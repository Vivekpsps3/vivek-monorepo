import { transactionEffects } from '../crypto/client-finance';
import { Transaction } from '../models/transaction.model';
import { spendingGroupKey, UNASSIGNED_ACCOUNT_FILTER } from '../utils/spending-filter.util';

export interface TransactionActivityFilters {
  searchTerm: string;
  typeFilter: 'all' | 'income' | 'expense';
  summaryMonth: string;
  fromDate: string;
  throughDate: string;
  selectedCalendarDate: string | null;
  accountFilter: string;
  categoryFilter: string;
  merchantFilter: string;
  receiptFilter: string;
}

export interface TransactionActivityTotals {
  monthExpenseTotal: number;
  monthIncomeTotal: number;
}

/** Applies the Activity page's search and exact context filters without mutating source rows. */
export function filterTransactionActivity(rows: Transaction[], filters: TransactionActivityFilters): Transaction[] {
  const query = filters.searchTerm.trim().toLocaleLowerCase();
  return rows.filter(row => {
    if (query && ![row.description, row.category, row.merchant, row.account_display, row.kind]
      .some(value => String(value || '').toLocaleLowerCase().includes(query))) return false;
    if (filters.typeFilter !== 'all' && (filters.typeFilter === 'income'
      ? transactionEffects(row).income === 0
      : transactionEffects(row).spending === 0 && row.kind !== 'ambiguous_credit')) return false;
    if (filters.summaryMonth && !row.date.startsWith(`${filters.summaryMonth}-`)) return false;
    if (filters.fromDate && row.date < filters.fromDate) return false;
    if (filters.throughDate && row.date > filters.throughDate) return false;
    if (filters.selectedCalendarDate && row.date !== filters.selectedCalendarDate) return false;
    if (filters.accountFilter === UNASSIGNED_ACCOUNT_FILTER && String(row.bank_account_key || '').trim()) return false;
    if (filters.accountFilter && filters.accountFilter !== UNASSIGNED_ACCOUNT_FILTER && row.bank_account_key !== filters.accountFilter) return false;
    if (filters.categoryFilter && spendingGroupKey(row, 'category') !== filters.categoryFilter) return false;
    if (filters.merchantFilter && spendingGroupKey(row, 'merchant') !== filters.merchantFilter) return false;
    if (filters.receiptFilter && Number(row.import_receipt_id) !== Number(filters.receiptFilter)) return false;
    return true;
  });
}

export function sortTransactionActivity(
  rows: Transaction[],
  column: 'date' | 'category' | 'amount',
  direction: 'asc' | 'desc',
): Transaction[] {
  return [...rows].sort((a, b) => {
    const valueA = column === 'date' ? a.date : column === 'amount' ? a.amount : a.category;
    const valueB = column === 'date' ? b.date : column === 'amount' ? b.amount : b.category;
    if (valueA < valueB) return direction === 'asc' ? -1 : 1;
    if (valueA > valueB) return direction === 'asc' ? 1 : -1;
    return 0;
  });
}

export function paginateTransactionActivity(rows: Transaction[], visibleRowCount: number): {
  rows: Transaction[];
  hasMore: boolean;
} {
  return { rows: rows.slice(0, visibleRowCount), hasMore: rows.length > visibleRowCount };
}

/** Activity totals exclude transfers, card payments, and credits awaiting classification. */
export function transactionActivityTotals(rows: Transaction[]): TransactionActivityTotals {
  const included = rows.filter(row => !['payment', 'transfer', 'ambiguous_credit'].includes(row.kind || ''));
  return {
    monthExpenseTotal: included.reduce((sum, row) => sum + transactionEffects(row).spending, 0),
    monthIncomeTotal: included.reduce((sum, row) => sum + transactionEffects(row).income, 0),
  };
}
