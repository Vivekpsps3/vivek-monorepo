import { DestroyRef, Injectable, Injector, inject } from '@angular/core';
import { LOCK_SIGNAL, financeVaultPresent, loadFinanceBudgetKept } from '../../../../../finance/frontend/src/public-api';
import { SessionService } from '../../platform/session.service';
import { WorldApi } from './world-api';
import { WorldController } from './world-controller';

/** Angular wrapper. The plain WorldController stays free of Finance imports. */
@Injectable({ providedIn: 'root' })
export class WorldControllerService {
  readonly controller: WorldController;

  constructor() {
    const api = inject(WorldApi);
    const session = inject(SessionService);
    const injector = inject(Injector);
    const destroy = inject(DestroyRef);
    const controller = new WorldController({
      api,
      seedUserId: () => session.currentUser?.id ?? 0,
      vaultPresent: financeVaultPresent,
      loadBudget: (signal, opts) => loadFinanceBudgetKept(injector, signal, opts),
      matchMedia: typeof matchMedia === 'function' ? (query) => matchMedia(query) : undefined,
    });
    const subscription = session.cleared$.subscribe(() => controller.clearFinance());
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || (event.key === LOCK_SIGNAL && event.newValue !== null)) controller.clearFinance();
    };
    if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
    destroy.onDestroy(() => {
      subscription.unsubscribe();
      if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
      controller.dispose();
    });
    this.controller = controller;
  }
}
