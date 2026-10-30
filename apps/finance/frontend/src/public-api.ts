import type { Injector } from '@angular/core';
import type { Routes } from '@angular/router';
export { financeVaultPresent, clearFinanceSessionStorage } from './app/crypto/dek-store';
export type { NetWorth } from './app/models/transaction.model';
export type { PortfolioAccount, PositionHighlight } from './app/hub/finance-hub-snapshot';
export async function loadFinanceRoutes(): Promise<Routes> { return (await import('./app/app.routes')).routes; }
export async function createFinanceVaultMaterial(passphrase: string) { return (await import('./app/crypto/vault-crypto')).createVaultMaterial(passphrase); }
export async function openFinanceVault(injector: Injector) { return injector.get((await import('./app/crypto/vault.service')).VaultService); }
export async function loadFinanceHubSnapshot(injector: Injector, signal: AbortSignal, deadlineMs?: number) {
  return (await import('./app/hub/finance-hub-facade')).loadFinanceHubSnapshot(injector, signal, deadlineMs);
}
export type { FinanceHubResult } from './app/hub/finance-hub-facade';
export async function loadFinanceBudgetKept(
  injector: Injector,
  signal: AbortSignal,
  opts: { today: string; weeks: number; includeCurrentWeek?: boolean; deadlineMs?: number },
) {
  return (await import('./app/budget/budget-kept')).loadFinanceBudgetKept(injector, signal, opts);
}
export type { BudgetKeptWeek, BudgetKeptResult } from './app/budget/budget-kept';
