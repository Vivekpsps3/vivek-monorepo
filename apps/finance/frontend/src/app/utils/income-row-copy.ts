import type { IncomeCashflowOccurrence } from '../models/transaction.model';

type IncomeRow = Pick<IncomeCashflowOccurrence, 'kind' | 'label' | 'name' | 'detail'> &
  Partial<Pick<IncomeCashflowOccurrence, 'payday_frequency'>>;

const FREQUENCY_LABEL: Record<string, string> = {
  weekly: 'Weekly',
  biweekly: 'Every two weeks',
  semimonthly: 'Twice a month',
  monthly: 'Monthly',
};

/** F18 (REC-01): "Acme paycheck", not "Projected paycheck · Acme". */
export function incomeRowTitle(row: IncomeRow): string {
  if (row.kind === 'paycheck') return `${row.name} paycheck`;
  if (row.kind === 'posted') return `${row.name} income`;
  return row.label.replace(/ estimate$/i, '');
}

/** Paycheck rows read "Estimated net · Every two weeks"; others keep `detail`. */
export function incomeRowSubtitle(row: IncomeRow): string {
  if (row.kind !== 'paycheck') return row.detail;
  const frequency = row.payday_frequency ? FREQUENCY_LABEL[row.payday_frequency] : undefined;
  return frequency ? `Estimated net · ${frequency}` : 'Estimated net';
}
