import { HttpErrorResponse } from '@angular/common/http';
import { Injector } from '@angular/core';
import { NEVER, of, Subject, throwError } from 'rxjs';
import { VaultService } from '../crypto/vault.service';
import { Asset, Liability } from '../models/transaction.model';
import { FinanceService } from '../services/finance.service';
import { loadFinanceHubSnapshot } from './finance-hub-facade';

function injectorFor(vault: unknown, finance: unknown): Injector {
  return {
    get(token: unknown) {
      if (token === VaultService) return vault;
      if (token === FinanceService) return finance;
      throw new Error('unexpected token');
    },
  } as Injector;
}

describe('finance hub facade', () => {
  const asset = { id: 1, name: 'Savings', category: 'cash', current_value: 500, as_of_date: '2026-10-15' } as Asset;
  const liability = { id: 1, name: 'Card', category: 'credit', balance_owed: 25, as_of_date: '2026-10-15' } as Liability;

  it('does not read the dashboard while the vault is locked', async () => {
    const loadDashboard = jasmine.createSpy('loadDashboard');
    const result = await loadFinanceHubSnapshot(injectorFor(
      { whenReady: () => Promise.resolve(), isUnlocked: false },
      { loadDashboard },
    ), new AbortController().signal, 1000);
    expect(result).toEqual({ status: 'locked' });
    expect(loadDashboard).not.toHaveBeenCalled();
  });

  it('builds a snapshot only after unlock', async () => {
    const result = await loadFinanceHubSnapshot(injectorFor(
      { whenReady: () => Promise.resolve(), isUnlocked: true },
      {
        loadDashboard: () => of(null),
        assets$: of([asset]),
        liabilities$: of([liability]),
        holdings$: of([]),
      },
    ), new AbortController().signal, 1000);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.snapshot.netWorth.total).toBe(475);
    expect(result.snapshot.cashOverlap).toBeFalse();
  });

  it('ends locked with no numbers when the vault locks during the dashboard load', async () => {
    let unlocked = true;
    const gate = new Subject<null>();
    const pending = loadFinanceHubSnapshot(injectorFor(
      {
        whenReady: () => Promise.resolve(),
        get isUnlocked() { return unlocked; },
      },
      {
        loadDashboard: () => gate.asObservable(),
        assets$: of([asset]),
        liabilities$: of([liability]),
        holdings$: of([]),
      },
    ), new AbortController().signal, 5000);
    for (let i = 0; i < 20 && !gate.observed; i += 1) await new Promise(resolve => setTimeout(resolve, 0));
    expect(gate.observed).toBeTrue();
    unlocked = false;
    gate.next(null);
    gate.complete();
    const result = await pending;
    expect(result).toEqual({ status: 'locked' });
    expect(JSON.stringify(result)).not.toContain('500');
    expect(JSON.stringify(result)).not.toContain('Savings');
  });

  it('turns a finance failure into an unavailable card instead of a sign-out', async () => {
    const result = await loadFinanceHubSnapshot(injectorFor(
      { whenReady: () => Promise.resolve(), isUnlocked: true },
      { loadDashboard: () => throwError(() => new Error('down')) },
    ), new AbortController().signal, 1000);
    expect(result).toEqual({ status: 'unavailable' });
  });

  it('distinguishes an expired finance session from a provider failure', async () => {
    const result = await loadFinanceHubSnapshot(injectorFor(
      { whenReady: () => Promise.resolve(), isUnlocked: true },
      { loadDashboard: () => throwError(() => new HttpErrorResponse({ status: 401 })) },
    ), new AbortController().signal, 1000);
    expect(result).toEqual({ status: 'expired' });
  });

  it('times out and cancels without publishing a snapshot', async () => {
    const timedOut = await loadFinanceHubSnapshot(injectorFor(
      { whenReady: () => Promise.resolve(), isUnlocked: true },
      { loadDashboard: () => NEVER },
    ), new AbortController().signal, 20);
    expect(timedOut).toEqual({ status: 'unavailable' });

    const ctrl = new AbortController();
    const pending = loadFinanceHubSnapshot(injectorFor(
      { whenReady: () => Promise.resolve(), isUnlocked: true },
      { loadDashboard: () => NEVER },
    ), ctrl.signal, 5000);
    ctrl.abort();
    await expectAsync(pending).toBeResolvedTo({ status: 'cancelled' });
  });
});
