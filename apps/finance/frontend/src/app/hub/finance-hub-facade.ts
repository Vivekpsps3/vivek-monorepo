import { todayIsoDate, parseDateOnly, isoDateInZone, browserTimeZone } from '@vivek/browser';
import { HttpErrorResponse } from '@angular/common/http';
import { Injector } from '@angular/core';
import { Observable, combineLatest, firstValueFrom, take, takeUntil, timeout } from 'rxjs';
import { VaultService } from '../crypto/vault.service';
import { FinanceService } from '../services/finance.service';
import { buildFinanceHubSnapshot, FinanceHubSnapshot } from './finance-hub-snapshot';

export type FinanceHubResult =
  | { status: 'locked' }
  | { status: 'ready'; snapshot: FinanceHubSnapshot; billsDueThisWeek: number }
  | { status: 'unavailable' }
  | { status: 'expired' }
  | { status: 'cancelled' };

function abort$(signal: AbortSignal): Observable<void> {
  return new Observable(subscriber => {
    if (signal.aborted) {
      subscriber.next();
      subscriber.complete();
      return;
    }
    const onAbort = () => {
      subscriber.next();
      subscriber.complete();
    };
    signal.addEventListener('abort', onAbort, { once: true });
    return () => signal.removeEventListener('abort', onAbort);
  });
}

/** Reads the local vault. Callers import this module only after the vault key is present. */
export async function loadFinanceHubSnapshot(
  injector: Injector,
  signal: AbortSignal,
  deadlineMs = 5_000,
): Promise<FinanceHubResult> {
  if (signal.aborted) return { status: 'cancelled' };
  const vault = injector.get(VaultService);
  try {
    await vault.whenReady();
  } catch {
    return signal.aborted ? { status: 'cancelled' } : { status: 'unavailable' };
  }
  if (signal.aborted) return { status: 'cancelled' };
  if (!vault.isUnlocked) return { status: 'locked' };
  const finance = injector.get(FinanceService);
  try {
    await firstValueFrom(
      finance.loadDashboard().pipe(takeUntil(abort$(signal)), timeout(deadlineMs)),
    );
  } catch (err) {
    if (signal.aborted) return { status: 'cancelled' };
    if (err instanceof HttpErrorResponse && err.status === 401) return { status: 'expired' };
    return { status: 'unavailable' };
  }
  if (signal.aborted) return { status: 'cancelled' };
  if (!vault.isUnlocked) return { status: 'locked' };
  const [assets, liabilities, holdings, bills, subscriptions] = await firstValueFrom(
    combineLatest([finance.assets$, finance.liabilities$, finance.holdings$, finance.fixedExpenses$, finance.subscriptions$]).pipe(take(1)),
  );
  if (signal.aborted || !vault.isUnlocked) return signal.aborted ? { status: 'cancelled' } : { status: 'locked' };
  const today = todayIsoDate();
  const last = parseDateOnly(today)!;
  last.setDate(last.getDate() + 6);
  const end = isoDateInZone(last, browserTimeZone());
  const billsDueThisWeek = [...bills, ...subscriptions].filter(row =>
    row.is_active === true && row.next_due_date != null && /^\d{4}-\d{2}-\d{2}$/.test(row.next_due_date) && parseDateOnly(row.next_due_date) != null
    && row.next_due_date >= today && row.next_due_date <= end,
  ).length;
  return { status: 'ready', snapshot: buildFinanceHubSnapshot(assets, liabilities, holdings), billsDueThisWeek };
}
