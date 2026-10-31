import type { Injector } from '@angular/core';
import { wipeDek } from './dek-holder';
export const lockLoad = { modules: () => Promise.all([
  import('./vault.service'),
  import('../services/finance.service'),
  import('../services/market-refresh-coordinator.service'),
] as const) };
export async function lockFinance(injector: Injector, originTabId?: string): Promise<void> {
  wipeDek();
  const [{ VaultService }, { FinanceService }, { MarketRefreshCoordinatorService }] = await lockLoad.modules();
  const market = injector.get(MarketRefreshCoordinatorService);
  market.broadcastLock(originTabId);
  market.endSession();
  injector.get(FinanceService).clearSessionState();
  injector.get(VaultService).lock();
}
