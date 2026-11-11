import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { FinanceTripSpendRegistry, ToastService } from '@vivek/ui';
import { holdDek, wipeDek } from '../crypto/dek-holder';
import { VAULT_PRESENCE } from '../crypto/dek-store';
import { lockFinance } from '../crypto/lock-finance';
import { VAULT_SYNC_CHANNEL } from '../crypto/lock-notice';
import type { Transaction } from '../models/transaction.model';
import { MarketRefreshCoordinatorService } from './market-refresh-coordinator.service';
import { FinanceService, type FinanceDataChange } from './finance.service';
import { attachFinanceTripSpend } from './trip-spend-producer';
import { VaultService } from '../crypto/vault.service';

function row(id: number, amount: number, tripId: number, kind: Transaction['kind'] = 'purchase'): Transaction {
  return {
    id,
    date: '2026-06-01',
    type: kind === 'income' ? 'income' : 'expense',
    category: 'Travel',
    amount,
    kind,
    trip_id: tripId,
  };
}

describe('Finance trip-spend producer', () => {
  let dataChanges$: Subject<FinanceDataChange>;
  let ledger: Promise<Transaction[] | null>;
  let reads: number;
  let subscriptions: number;
  let unlocked$: BehaviorSubject<boolean>;
  let ready: Promise<void>;
  let releaseReady: () => void;
  let stop: (() => void) | null;

  beforeEach(() => {
    dataChanges$ = new Subject<FinanceDataChange>();
    ledger = Promise.resolve([]);
    reads = 0;
    subscriptions = 0;
    unlocked$ = new BehaviorSubject(true);
    ready = new Promise<void>(resolve => { releaseReady = resolve; });
    holdDek({} as CryptoKey);
    localStorage.setItem(VAULT_PRESENCE, '4');
    const finance = {
      dataChanges$: new Observable<FinanceDataChange>(subscriber => {
        subscriptions += 1;
        const subscription = dataChanges$.subscribe(subscriber);
        return () => subscription.unsubscribe();
      }),
      readTripSpendLedger: () => {
        reads += 1;
        return ledger;
      },
      clearSessionState: () => undefined,
    };
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        { provide: FinanceService, useValue: finance },
        { provide: VaultService, useValue: { whenReady: () => ready, unlocked$, lock: async () => { wipeDek(); unlocked$.next(false); } } },
        { provide: MarketRefreshCoordinatorService, useValue: { endSession: () => undefined } },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['error', 'success']) },
      ],
    });
    stop = null;
  });

  afterEach(() => {
    stop?.();
    stop = null;
    wipeDek();
    localStorage.removeItem(VAULT_PRESENCE);
    TestBed.inject(HttpTestingController).verify();
  });

  async function settle(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }

  it('publishes one shared total and one ledger subscription, then replaces it when transactions change', async () => {
    ledger = Promise.resolve([
      row(1, 10, 7),
      row(2, 3.25, 7, 'refund'),
      row(3, 80, 7, 'income'),
      row(4, 4, 8),
    ]);
    const registry = TestBed.inject(FinanceTripSpendRegistry);
    const register = spyOn(registry, 'register').and.callThrough();
    const channelMessages: unknown[] = [];
    const channel = new BroadcastChannel(VAULT_SYNC_CHANNEL);
    channel.onmessage = event => channelMessages.push(event.data);
    const storageEvents: StorageEvent[] = [];
    const onStorage = (event: StorageEvent) => storageEvents.push(event);
    window.addEventListener('storage', onStorage);
    const writes: string[] = [];
    const setItem = spyOn(Storage.prototype, 'setItem').and.callFake(() => writes.push('write'));

    stop = attachFinanceTripSpend(TestBed.inject(Injector), () => true);
    const duplicate = attachFinanceTripSpend(TestBed.inject(Injector), () => true);
    expect(duplicate).toBe(stop);
    releaseReady();
    await settle();

    expect(reads).toBe(1);
    expect(subscriptions).toBe(1);
    expect(register).toHaveBeenCalledTimes(1);
    expect(registry.lookup()?.(7)).toEqual([{ currency: 'USD', cents: 675, count: 2 }]);
    expect(TestBed.inject(HttpTestingController).match(() => true)).toEqual([]);
    expect(channelMessages).toEqual([]);
    expect(storageEvents).toEqual([]);
    expect(writes).toEqual([]);

    ledger = Promise.resolve([row(1, 20, 7)]);
    dataChanges$.next({ collections: ['transactions'], source: 'local' });
    await settle();

    expect(reads).toBe(2);
    expect(subscriptions).toBe(1);
    expect(register).toHaveBeenCalledTimes(2);
    expect(registry.lookup()?.(7)).toEqual([{ currency: 'USD', cents: 2000, count: 1 }]);
    setItem.and.callThrough();
    channel.close();
    window.removeEventListener('storage', onStorage);
  });

  it('clears a held ledger on lock and never republishes it', async () => {
    let releaseLedger!: (rows: Transaction[]) => void;
    ledger = new Promise(resolve => { releaseLedger = resolve; });
    const registry = TestBed.inject(FinanceTripSpendRegistry);
    stop = attachFinanceTripSpend(TestBed.inject(Injector), () => true);
    releaseReady();
    await settle();
    expect(reads).toBe(1);
    expect(registry.lookup()).toBeNull();

    const locking = lockFinance(TestBed.inject(Injector)).catch(() => undefined);
    expect(registry.lookup()).toBeNull();
    releaseLedger([row(1, 10, 7)]);
    await settle();
    expect(registry.lookup()).toBeNull();
    await locking;
    expect(registry.lookup()).toBeNull();
  });
});
