import { Injector } from '@angular/core';
import { hasDek } from '../crypto/dek-holder';
import { financeVaultPresent } from '../crypto/dek-store';
import { VaultService } from '../crypto/vault.service';
import { FinanceLoadedNames, FinanceService } from './finance.service';

/** At most five ready name rows. Amounts, notes, and transactions stay out. */
export const FINANCE_NAME_LIMIT = 5;

export interface FinanceSearchName {
  app: 'finance';
  kind: 'account' | 'holding' | 'bill';
  id: number;
  title: string;
  href: string;
}

export type FinanceSearchQuery =
  | { status: 'none' | 'locked' | 'unloaded' }
  | { status: 'ready'; names: FinanceSearchName[] };

export interface FinanceSearchRecents {
  status: 'none' | 'locked' | 'unloaded' | 'ready';
  names: FinanceSearchName[];
  missing: { kind: string; id: number }[];
}

const ACCOUNT_HREF = '/finance/have';
const HOLDING_HREF = '/finance/have?t=holdings';
const BILL_HREF = '/finance/recurring?t=spend';

function contains(value: string | null | undefined, needle: string): boolean {
  return !!value && value.toLocaleLowerCase().includes(needle);
}

function take(rows: FinanceSearchName[], row: FinanceSearchName): void {
  if (rows.length < FINANCE_NAME_LIMIT) rows.push(row);
}

/** Case-insensitive substring over ready name streams only, capped at five. */
export function matchLoadedFinanceNames(loaded: FinanceLoadedNames, query: string): FinanceSearchName[] {
  const needle = query.trim().toLocaleLowerCase();
  if (needle.length < 2) return [];
  const rows: FinanceSearchName[] = [];
  if (loaded.ready.assets) {
    for (const row of loaded.assets) {
      if (contains(row.name, needle)) {
        take(rows, { app: 'finance', kind: 'account', id: row.id, title: row.name, href: ACCOUNT_HREF });
      }
    }
  }
  if (loaded.ready.liabilities) {
    for (const row of loaded.liabilities) {
      if (contains(row.name, needle)) {
        take(rows, { app: 'finance', kind: 'account', id: row.id, title: row.name, href: ACCOUNT_HREF });
      }
    }
  }
  if (loaded.ready.holdings) {
    for (const row of loaded.holdings) {
      if (contains(row.symbol, needle) || contains(row.name, needle)) {
        take(rows, {
          app: 'finance',
          kind: 'holding',
          id: row.id,
          title: row.name?.trim() || row.symbol,
          href: HOLDING_HREF,
        });
      }
    }
  }
  if (loaded.ready.fixedExpenses) {
    for (const row of loaded.fixedExpenses) {
      if (contains(row.name, needle)) {
        take(rows, { app: 'finance', kind: 'bill', id: row.id, title: row.name, href: BILL_HREF });
      }
    }
  }
  if (loaded.ready.subscriptions) {
    for (const row of loaded.subscriptions) {
      if (contains(row.name, needle)) {
        take(rows, { app: 'finance', kind: 'bill', id: row.id, title: row.name, href: BILL_HREF });
      }
    }
  }
  return rows;
}

/**
 * Resolve persisted `{kind, id}` refs from ready streams.
 * A ref is missing only when every stream that could hold it has been published
 * and none contains the id. Locked or unloaded streams are not pruned.
 */
export function resolveLoadedFinanceRecents(
  loaded: FinanceLoadedNames,
  refs: readonly { kind: string; id: number }[],
): { names: FinanceSearchName[]; missing: { kind: string; id: number }[] } {
  const names: FinanceSearchName[] = [];
  const missing: { kind: string; id: number }[] = [];
  for (const ref of refs) {
    if (ref.kind === 'account') {
      const asset = loaded.ready.assets ? loaded.assets.find(row => row.id === ref.id && row.name.trim()) : undefined;
      const liability = !asset && loaded.ready.liabilities
        ? loaded.liabilities.find(row => row.id === ref.id && row.name.trim())
        : undefined;
      const found = asset ?? liability;
      if (found) names.push({ app: 'finance', kind: 'account', id: found.id, title: found.name, href: ACCOUNT_HREF });
      else if (loaded.ready.assets && loaded.ready.liabilities) missing.push({ kind: ref.kind, id: ref.id });
    } else if (ref.kind === 'holding' && loaded.ready.holdings) {
      const found = loaded.holdings.find(row => row.id === ref.id && (row.name?.trim() || row.symbol.trim()));
      if (found) {
        names.push({
          app: 'finance',
          kind: 'holding',
          id: found.id,
          title: found.name?.trim() || found.symbol,
          href: HOLDING_HREF,
        });
      } else missing.push({ kind: ref.kind, id: ref.id });
    } else if (ref.kind === 'bill') {
      const fixed = loaded.ready.fixedExpenses
        ? loaded.fixedExpenses.find(row => row.id === ref.id && row.name.trim())
        : undefined;
      const subscription = !fixed && loaded.ready.subscriptions
        ? loaded.subscriptions.find(row => row.id === ref.id && row.name.trim())
        : undefined;
      const found = fixed ?? subscription;
      if (found) names.push({ app: 'finance', kind: 'bill', id: found.id, title: found.name, href: BILL_HREF });
      else if (loaded.ready.fixedExpenses && loaded.ready.subscriptions) missing.push({ kind: ref.kind, id: ref.id });
    }
  }
  return { names, missing };
}

async function readLoaded(injector: Injector): Promise<
  | { status: 'none' | 'locked' | 'unloaded' }
  | { status: 'ready'; loaded: FinanceLoadedNames }
> {
  if (!financeVaultPresent()) return { status: 'none' };
  let vault: VaultService;
  try {
    vault = injector.get(VaultService);
    await vault.whenReady();
  } catch {
    return { status: 'locked' };
  }
  if (!vault.isUnlocked || !hasDek()) return { status: 'locked' };
  const loaded = injector.get(FinanceService).peekLoadedNames();
  if (!loaded) return { status: 'locked' };
  const { ready } = loaded;
  if (!ready.assets && !ready.liabilities && !ready.holdings && !ready.fixedExpenses && !ready.subscriptions) {
    return { status: 'unloaded' };
  }
  return { status: 'ready', loaded };
}

/** Lazy name search. Reads peekLoadedNames only — never loadDashboard or a provider. */
export async function searchFinanceNames(injector: Injector, query: string): Promise<FinanceSearchQuery> {
  const read = await readLoaded(injector);
  if (read.status !== 'ready') return read;
  return { status: 'ready', names: matchLoadedFinanceNames(read.loaded, query) };
}

export async function resolveFinanceSearchRecents(
  injector: Injector,
  refs: readonly { kind: string; id: number }[],
): Promise<FinanceSearchRecents> {
  const read = await readLoaded(injector);
  if (read.status !== 'ready') return { status: read.status, names: [], missing: [] };
  return { status: 'ready', ...resolveLoadedFinanceRecents(read.loaded, refs) };
}
