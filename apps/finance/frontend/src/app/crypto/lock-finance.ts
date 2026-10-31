import type { Injector } from '@angular/core';

/**
 * Same lock as Finance's Lock vault, without changing route.
 * Settings and the vault button both call this. Navigation stays with the caller.
 */
export async function lockFinance(injector: Injector): Promise<void> {
  const { VaultService } = await import('./vault.service');
  const { FinanceService } = await import('../services/finance.service');
  const { MarketRefreshCoordinatorService } = await import('../services/market-refresh-coordinator.service');
  const market = injector.get(MarketRefreshCoordinatorService);
  market.broadcastLock();
  market.endSession();
  injector.get(FinanceService).clearSessionState();
  injector.get(VaultService).lock();
}
