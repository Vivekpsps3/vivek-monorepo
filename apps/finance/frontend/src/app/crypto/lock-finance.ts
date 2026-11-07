import type { Injector } from '@angular/core';
import { SESSION_CONTEXT, ToastService } from '@vivek/ui';
import { financeTabId, wipeDek } from './dek-holder';

export const lockLoad = { modules: () => Promise.all([
  import('./vault.service'),
  import('../services/finance.service'),
  import('../services/market-refresh-coordinator.service'),
] as const) };

const VAULT_CHANNEL = 'finance-vault-sync-v1';
let dropSnapshots = () => undefined as void;
export function bindLockSnapshots(drop: () => void): () => void {
  dropSnapshots = drop;
  return () => { if (dropSnapshots === drop) dropSnapshots = () => undefined as void; };
}

function postLock(userId: number, originTabId?: string): boolean {
  if (typeof BroadcastChannel === 'undefined') return false;
  const channel = new BroadcastChannel(VAULT_CHANNEL);
  try { channel.postMessage({ version: 1, userId, kind: 'lock', tabId: originTabId ?? financeTabId() }); }
  finally { channel.close(); }
  return true;
}

export async function lockFinance(injector: Injector, originTabId?: string): Promise<void> {
  wipeDek();
  try {
    dropSnapshots();
    const load = lockLoad.modules, userId = injector.get(SESSION_CONTEXT, null, { optional: true })?.currentUser?.id;
    // No coordinator fallback when postLock cannot post: the coordinator's
    // channel is open under exactly the same conditions (a signed-in user and
    // BroadcastChannel support), so the fallback could never reach a tab that
    // postLock missed (B0F2).
    if (typeof userId === 'number') postLock(userId, originTabId);
    await import('../services/finance.service').then(m => injector.get(m.FinanceService).clearSessionState()).catch(() => undefined);
    const [{ VaultService }, , { MarketRefreshCoordinatorService }] = await load();
    const market = injector.get(MarketRefreshCoordinatorService);
    market.endSession();
    await injector.get(VaultService).lock();
  } catch {
    try { injector.get((await import('../services/finance.service')).FinanceService).clearSessionState(); }
    catch { /* store module failed; the key is already wiped */ }
    try { await injector.get((await import('./vault.service')).VaultService).lock(); }
    catch { /* the key is already wiped */ }
    // wipeDek() already ran, so this tab is locked even when a later step
    // failed; only the other tabs may still be open (B0F2 P1).
    injector.get(ToastService).error('Locked here, but other tabs may still be open.', {
      label: 'Try again', run: () => { void lockFinance(injector, originTabId); },
    });
  }
}
