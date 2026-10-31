import type { Injector } from '@angular/core';
import { SESSION_CONTEXT, ToastService, failureCopy } from '@vivek/ui';
import { financeTabId, wipeDek } from './dek-holder';

export const lockLoad = { modules: () => Promise.all([
  import('./vault.service'),
  import('../services/finance.service'),
  import('../services/market-refresh-coordinator.service'),
] as const) };

const VAULT_CHANNEL = 'finance-vault-sync-v1';

/** Crypto-free. Other tabs drop their key even when the coordinator chunk never loads. */
function postLock(userId: number, originTabId?: string): void {
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel(VAULT_CHANNEL);
  try {
    channel.postMessage({ version: 1, userId, kind: 'lock', tabId: originTabId ?? financeTabId() });
  } finally {
    channel.close();
  }
}

export async function lockFinance(injector: Injector, originTabId?: string): Promise<void> {
  wipeDek();
  const userId = injector.get(SESSION_CONTEXT, null, { optional: true })?.currentUser?.id;
  if (typeof userId === 'number') postLock(userId, originTabId);
  try {
    const [{ VaultService }, { FinanceService }, { MarketRefreshCoordinatorService }] = await lockLoad.modules();
    const market = injector.get(MarketRefreshCoordinatorService);
    market.broadcastLock(originTabId);
    market.endSession();
    injector.get(FinanceService).clearSessionState();
    injector.get(VaultService).lock();
  } catch {
    try {
      injector.get((await import('./vault.service')).VaultService).lock();
    } catch { /* the key is already wiped */ }
    injector.get(ToastService).error(failureCopy('lock', 'this vault'), {
      label: 'Try again',
      run: () => { void lockFinance(injector, originTabId); },
    });
  }
}
