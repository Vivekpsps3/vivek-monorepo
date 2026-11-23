import type { NetWorth } from '../models/transaction.model';
import { amountProblem, excludedAmountNote } from '../utils/validators';

export type AccountHallKind = 'asset' | 'debt';

/** One published account. The hall does not own a copy of the ledger. */
export interface AccountHallRecord {
  kind: AccountHallKind;
  id: number;
  name: string;
  category: string;
  asOf: string;
  /** Stored positive amount from the asset or debt record. */
  value: number;
}

export interface AccountHallDrawer {
  key: string;
  kind: AccountHallKind;
  id: number;
  name: string;
  category: string;
  asOf: string;
  revealed: boolean;
  /**
   * Signed display amount from the published row.
   * Null while this drawer is locked, or when the stored amount cannot be shown.
   */
  amount: number | null;
  problem: 'over-max' | 'negative' | 'invalid' | null;
}

/** Narrow view of published accounts and the published net-worth parts. */
export interface AccountHallProjection {
  drawers: AccountHallDrawer[];
  accounts: number | null;
  investments: number | null;
  debts: number | null;
  total: number | null;
  excludedNote: string | null;
  revealedKey: string | null;
}

export function accountHallKey(kind: AccountHallKind, id: number): string {
  return `${kind}:${id}`;
}

/**
 * Project drawers from records the caller already loaded.
 * Net-worth figures are copied from the published total. This function does not
 * add the rows again, and it leaves every amount null until one drawer is unlocked.
 */
export function projectAccountHall(
  records: readonly AccountHallRecord[],
  netWorth: NetWorth | null,
  revealedKey: string | null,
): AccountHallProjection {
  const counterOpen = netWorth != null && revealedKey != null;
  const drawers = records.map(record => {
    const key = accountHallKey(record.kind, record.id);
    const revealed = counterOpen && key === revealedKey;
    const problem = amountProblem(record.value, 'nonNegative');
    const amount = revealed && problem == null
      ? (record.kind === 'debt' ? -record.value : record.value)
      : null;
    return {
      key,
      kind: record.kind,
      id: record.id,
      name: record.name,
      category: record.category,
      asOf: record.asOf,
      revealed,
      amount,
      problem,
    };
  });
  const showFigures = drawers.some(drawer => drawer.revealed);
  return {
    drawers,
    accounts: showFigures ? netWorth!.other_assets : null,
    investments: showFigures ? netWorth!.portfolio : null,
    debts: showFigures ? -netWorth!.liabilities : null,
    total: showFigures ? netWorth!.total : null,
    excludedNote: showFigures ? excludedAmountNote(netWorth!.excluded_invalid_amounts ?? 0) : null,
    revealedKey: showFigures ? revealedKey : null,
  };
}
