import { transactionEffects } from '../crypto/client-finance';
import { Transaction } from '../models/transaction.model';

export interface SpendCategoryRow {
  label: string;
  value: number;
  pct: number;
}

export interface SpendPurchaseRow {
  id: number;
  date: string;
  description: string;
  category: string;
  amount: number;
}

export interface MonthSpendSummary {
  monthKey: string;
  expenseTotal: number;
  incomeTotal: number;
  net: number;
  activeDays: number;
  categories: SpendCategoryRow[];
  topPurchases: SpendPurchaseRow[];
}

export function monthKeyFromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function inMonth(date: string, monthKey: string): boolean {
  return !!monthKey && date.startsWith(`${monthKey}-`);
}

export function summarizeMonthSpend(
  transactions: Array<Pick<Transaction, 'id' | 'date' | 'type' | 'category' | 'description' | 'amount' | 'kind'>>,
  monthKey: string,
  topN = 5
): MonthSpendSummary {
  const rows = (monthKey ? transactions.filter(tx => inMonth(tx.date, monthKey)) : transactions)
    .filter(tx => {
      const effect = transactionEffects(tx as Transaction);
      return effect.income !== 0 || effect.spending !== 0;
    });
  const expenses = rows.filter(tx => transactionEffects(tx as Transaction).spending !== 0);
  const incomeTotal = rows.reduce((sum, tx) => sum + transactionEffects(tx as Transaction).income, 0);
  const expenseTotal = rows.reduce((sum, tx) => sum + transactionEffects(tx as Transaction).spending, 0);
  const byCategory = new Map<string, number>();
  for (const tx of expenses) {
    const label = tx.category.trim() || 'Uncategorized';
    byCategory.set(label, (byCategory.get(label) || 0) + transactionEffects(tx as Transaction).spending);
  }
  const categories = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({
      label,
      value,
      pct: expenseTotal ? (value / expenseTotal) * 100 : 0,
    }));
  const topPurchases = [...expenses.filter(tx => transactionEffects(tx as Transaction).spending > 0)]
    .sort((a, b) => b.amount - a.amount || b.date.localeCompare(a.date))
    .slice(0, topN)
    .map(tx => ({
      id: tx.id,
      date: tx.date,
      description: (tx.description || '').trim() || tx.category,
      category: tx.category,
      amount: tx.amount,
    }));
  return {
    monthKey,
    expenseTotal,
    incomeTotal,
    net: incomeTotal - expenseTotal,
    activeDays: new Set(rows.map(tx => tx.date)).size,
    categories,
    topPurchases,
  };
}
