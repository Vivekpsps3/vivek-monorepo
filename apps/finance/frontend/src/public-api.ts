import type { Injector } from '@angular/core';
import type { Routes } from '@angular/router';
import { loadFinanceBudgetKeptDaysGuarded, loadFinanceBudgetKeptGuarded } from './app/budget/budget-kept-import';
import type { VaultRecordCapability } from './app/crypto/vault-record-capability';
export { DEK_STORE, LOCK_SIGNAL, VAULT_PRESENCE, financeVaultPresent, clearFinanceSessionStorage } from './app/crypto/dek-store';
export { bindLockSnapshots, lockFinance } from './app/crypto/lock-finance';
export { acceptLockNotice, bindLockNotices, storageLocksVault, VAULT_SYNC_CHANNEL, type LockSessionNotice } from './app/crypto/lock-notice';
export { financeTabId } from './app/crypto/dek-holder';
export async function loadMarketRefreshCoordinatorService() { return (await import('./app/services/market-refresh-coordinator.service')).MarketRefreshCoordinatorService; }
export { FinanceLockService, type AutoLockSetting } from './app/core/finance-lock.service';
export type { NetWorth } from './app/models/transaction.model';
export type { PortfolioAccount, PositionHighlight } from './app/hub/finance-hub-snapshot';
export async function loadFinanceRoutes(): Promise<Routes> { return (await import('./app/app.routes')).routes; }
export async function createFinanceVaultMaterial(passphrase: string) { return (await import('./app/crypto/vault-crypto')).createVaultMaterial(passphrase); }
/** Settings, search, and auth still open the Finance vault. Health uses openVaultRecords. */
export async function openFinanceVault(injector: Injector) { return injector.get((await import('./app/crypto/vault.service')).VaultService); }
export type {
  VaultRecordCapability,
  VaultRecordDelete,
  VaultRecordEnvelope,
  VaultRecordRequestOptions,
  VaultRecordUpsert,
} from './app/crypto/vault-record-capability';
export async function openVaultRecords(injector: Injector): Promise<VaultRecordCapability> {
  return (await import('./app/crypto/vault-record-capability')).openVaultRecords(injector);
}
export async function loadFinanceHubSnapshot(injector: Injector, signal: AbortSignal, deadlineMs?: number) {
  return (await import('./app/hub/finance-hub-facade')).loadFinanceHubSnapshot(injector, signal, deadlineMs);
}
export type { FinanceHubResult } from './app/hub/finance-hub-facade';
export function loadFinanceBudgetKept(
  injector: Injector,
  signal: AbortSignal,
  opts: { today: string; weeks: number; includeCurrentWeek?: boolean; deadlineMs?: number },
) {
  return loadFinanceBudgetKeptGuarded(injector, signal, opts);
}
export function loadFinanceBudgetKeptDays(
  injector: Injector,
  signal: AbortSignal,
  opts: { from: string; to: string; deadlineMs?: number },
) {
  return loadFinanceBudgetKeptDaysGuarded(injector, signal, opts);
}
export type { BudgetKeptWeek, BudgetKeptResult, BudgetKeptDay, BudgetKeptDaysResult } from './app/budget/budget-kept';
