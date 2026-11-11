import { Injector } from '@angular/core';
import { FinanceTripSpendRegistry, type TripSpendLookup } from '@vivek/ui';
import type { Subscription } from 'rxjs';
import { hasDek } from '../crypto/dek-holder';
import { bindLockSnapshots } from '../crypto/lock-finance';
import { VaultService } from '../crypto/vault.service';
import type { Transaction } from '../models/transaction.model';
import { FinanceService } from './finance.service';
import { financeTripSpendLookup } from './trip-spend';

let activeStop: (() => void) | null = null;

/**
 * One unlocked producer for FinanceTripSpendRegistry.
 * A second attach returns the live producer instead of subscribing again.
 */
export function attachFinanceTripSpend(injector: Injector, alive: () => boolean): () => void {
  if (activeStop) return activeStop;
  const finance = injector.get(FinanceService);
  const registry = injector.get(FinanceTripSpendRegistry);
  const vault = injector.get(VaultService);
  let unregister: (() => void) | null = null;
  let ledgerSub: Subscription | null = null;
  let unlockSub: Subscription | null = null;
  let generation = 0;
  let reading = false;
  let again = false;
  let closed = false;

  const clearPublished = () => {
    generation += 1;
    again = false;
    const previous = unregister;
    unregister = null;
    previous?.();
  };

  const publish = (rows: Transaction[]) => {
    if (closed || !alive() || !hasDek()) {
      clearPublished();
      return;
    }
    const lookup: TripSpendLookup = financeTripSpendLookup(rows);
    const previous = unregister;
    unregister = registry.register(lookup);
    previous?.();
  };

  const schedule = () => {
    if (closed || !alive() || !hasDek()) {
      clearPublished();
      return;
    }
    if (reading) {
      again = true;
      return;
    }
    reading = true;
    const token = ++generation;
    void finance.readTripSpendLedger().then(rows => {
      reading = false;
      const followUp = again;
      again = false;
      if (token !== generation) {
        if (followUp && !closed && alive() && hasDek()) schedule();
        return;
      }
      if (closed || !alive() || !hasDek() || rows == null) {
        clearPublished();
        return;
      }
      publish(rows);
      if (followUp) schedule();
    });
  };

  const ensureLedger = () => {
    if (ledgerSub) return;
    ledgerSub = finance.dataChanges$.subscribe(change => {
      if (!change.collections.includes('transactions')) return;
      schedule();
    });
  };

  const stop = () => {
    if (activeStop !== stop) return;
    activeStop = null;
    closed = true;
    clearPublished();
    ledgerSub?.unsubscribe();
    ledgerSub = null;
    unlockSub?.unsubscribe();
    unlockSub = null;
    releaseLock();
  };

  const releaseLock = bindLockSnapshots(() => {
    clearPublished();
  });

  void vault.whenReady().then(() => {
    if (closed || !alive()) return;
    unlockSub = vault.unlocked$.subscribe(open => {
      if (closed || !alive()) {
        clearPublished();
        return;
      }
      if (!open || !hasDek()) {
        clearPublished();
        return;
      }
      ensureLedger();
      schedule();
    });
  }).catch(() => undefined);

  activeStop = stop;
  return stop;
}
