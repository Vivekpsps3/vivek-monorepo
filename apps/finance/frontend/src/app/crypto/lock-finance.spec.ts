import { Injector } from '@angular/core';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SESSION_CONTEXT, ToastService, type SessionPort } from '@vivek/ui';
import { FinanceService } from '../services/finance.service';
import { MarketRefreshCoordinatorService } from '../services/market-refresh-coordinator.service';
import { hasDek, holdDek } from './dek-holder';
import { LOCK_SIGNAL, VAULT_PRESENCE } from './dek-store';
import { bindLockSnapshots, lockFinance, lockLoad } from './lock-finance';
import { VaultService } from './vault.service';
const realLoad = lockLoad.modules;

describe('lockFinance', () => {
  const releases: Array<() => void> = [];

  afterEach(() => {
    while (releases.length) releases.pop()?.();
    localStorage.removeItem('finance-dek');
    localStorage.removeItem(VAULT_PRESENCE);
    localStorage.removeItem(LOCK_SIGNAL);
    lockLoad.modules = realLoad;
    TestBed.resetTestingModule();
  });

  function track(drop: () => void): () => void {
    const release = bindLockSnapshots(drop);
    releases.push(release);
    return release;
  }

  async function readyLock(userId?: number): Promise<void> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        ...(userId == null ? [] : [{ provide: SESSION_CONTEXT, useValue: { currentUser: { id: userId } } as unknown as SessionPort }]),
        { provide: FinanceService, useValue: { clearSessionState: () => undefined } },
        { provide: MarketRefreshCoordinatorService, useValue: { endSession: () => undefined } },
      ],
    });
    const vault = TestBed.inject(VaultService);
    await vault.whenReady();
    holdDek({} as CryptoKey);
    vault['unlockedSubject'].next(true);
    localStorage.setItem('finance-dek', 'raw-key-bytes');
  }

  it('ends refresh, clears caches, then locks storage and memory', async () => {
    const order: string[] = [];
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        {
          provide: FinanceService,
          useValue: { clearSessionState: () => order.push('caches') },
        },
        {
          provide: MarketRefreshCoordinatorService,
          useValue: {
            endSession: () => order.push('end'),
          },
        },
      ],
    });
    const vault = TestBed.inject(VaultService);
    await vault.whenReady();
    holdDek({} as CryptoKey);
    vault['unlockedSubject'].next(true);
    localStorage.setItem('finance-dek', 'raw-key-bytes');
    const lock = VaultService.prototype.lock;
    spyOn(vault, 'lock').and.callFake(() => {
      order.push('lock');
      return lock.call(vault);
    });
    await lockFinance(TestBed.inject(Injector));
    expect(order).toEqual(['caches', 'end', 'lock']);
    vault['unlockedSubject'].next(true);
    expect(localStorage.getItem('finance-dek')).toBeNull();
    expect(hasDek()).toBeFalse();
  });
  it('wipes memory and storage when the import never resolves', () => {
    TestBed.configureTestingModule({});
    holdDek({} as CryptoKey);
    localStorage.setItem('finance-dek', 'raw-key-bytes');
    lockLoad.modules = (() => new Promise(() => undefined)) as typeof lockLoad.modules;
    void lockFinance(TestBed.inject(Injector));
    expect([hasDek(), localStorage.getItem('finance-dek')]).toEqual([false, null]);
  });

  it('broadcasts the lock, toasts, and stays locked when the import rejects', async () => {
    const cleared = jasmine.createSpy('clearSessionState');
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule], providers: [
      { provide: SESSION_CONTEXT, useValue: { currentUser: { id: 7 } } as unknown as SessionPort },
      { provide: FinanceService, useValue: { clearSessionState: cleared } },
    ] });
    const vault = TestBed.inject(VaultService); await vault.whenReady(); holdDek({} as CryptoKey);
    vault['unlockedSubject'].next(true); localStorage.setItem('finance-dek', 'raw-key-bytes');
    const toast = TestBed.inject(ToastService); spyOn(toast, 'error'); const unlocked: boolean[] = [];
    vault.unlocked$.subscribe(value => unlocked.push(value));
    const other = new BroadcastChannel('finance-vault-sync-v1');
    const heard = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no lock broadcast')), 1000);
      other.onmessage = (event: MessageEvent) => { if ((event.data as { kind?: string } | null)?.kind === 'lock') { clearTimeout(timer); resolve(event.data); } };
    });
    lockLoad.modules = (() => Promise.reject(new Error('chunk'))) as typeof lockLoad.modules;
    try { await expectAsync(lockFinance(TestBed.inject(Injector))).toBeResolved(); expect(await heard).toEqual(jasmine.objectContaining({ version: 1, userId: 7, kind: 'lock' })); }
    finally { other.close(); }
    expect([hasDek(), localStorage.getItem('finance-dek'), vault.isUnlocked, unlocked.at(-1)]).toEqual([false, null, false, false]);
    // B0F2 P1: this tab is already locked when a later lock step fails.
    expect(toast.error).toHaveBeenCalledWith('Locked here, but other tabs may still be open.', jasmine.objectContaining({ label: 'Try again' }));
    expect(cleared).toHaveBeenCalled();
    const before = cleared.calls.count();
    (toast.error as jasmine.Spy).calls.mostRecent().args[1].run();
    // The retry awaits the IndexedDB delete before it toasts again.
    const started = Date.now();
    while ((toast.error as jasmine.Spy).calls.count() < 2 && Date.now() - started < 5000) {
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    expect(cleared.calls.count()).toBeGreaterThan(before);
    expect((toast.error as jasmine.Spy).calls.count()).toBe(2);
  });

  it('toasts and stays locked when BroadcastChannel throws', async () => {
    const cleared = jasmine.createSpy('clearSessionState');
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule], providers: [
      { provide: SESSION_CONTEXT, useValue: { currentUser: { id: 3 } } as unknown as SessionPort },
      { provide: FinanceService, useValue: { clearSessionState: cleared } },
    ] });
    const vault = TestBed.inject(VaultService); await vault.whenReady(); holdDek({} as CryptoKey);
    vault['unlockedSubject'].next(true); localStorage.setItem('finance-dek', 'raw-key-bytes');
    const lock = spyOn(vault, 'lock').and.callThrough();
    spyOn(TestBed.inject(ToastService), 'error');
    const Real = globalThis.BroadcastChannel;
    globalThis.BroadcastChannel = function BroadcastChannel() { throw new Error('down'); } as unknown as typeof BroadcastChannel;
    try { await expectAsync(lockFinance(TestBed.inject(Injector))).toBeResolved(); }
    finally { globalThis.BroadcastChannel = Real; }
    expect(TestBed.inject(ToastService).error).toHaveBeenCalled();
    expect(hasDek()).toBeFalse();
    expect(cleared).toHaveBeenCalled();
    expect(lock).toHaveBeenCalled();
  });

  it('broadcasts a local lock once when postLock reaches the other tab', async () => {
    const messages: unknown[] = [];
    const other = new BroadcastChannel('finance-vault-sync-v1');
    other.onmessage = (event: MessageEvent) => {
      if ((event.data as { kind?: string } | null)?.kind === 'lock') messages.push(event.data);
    };
    const broadcast = jasmine.createSpy('broadcastLock').and.callFake(() => {
      const channel = new BroadcastChannel('finance-vault-sync-v1');
      try { channel.postMessage({ version: 1, userId: 7, kind: 'lock', tabId: 'coordinator' }); }
      finally { channel.close(); }
    });
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        { provide: SESSION_CONTEXT, useValue: { currentUser: { id: 7 } } as unknown as SessionPort },
        { provide: FinanceService, useValue: { clearSessionState: () => undefined } },
        { provide: MarketRefreshCoordinatorService, useValue: { broadcastLock: broadcast, endSession: () => undefined } },
      ],
    });
    const vault = TestBed.inject(VaultService);
    await vault.whenReady();
    holdDek({} as CryptoKey);
    vault['unlockedSubject'].next(true);
    try {
      await lockFinance(TestBed.inject(Injector));
      await new Promise(resolve => setTimeout(resolve, 30));
      expect(messages.length).toBe(1);
      expect(broadcast).not.toHaveBeenCalled();
    } finally { other.close(); }
  });

  async function expectBothOrders(first: 'Finance' | 'Pixels', second: 'Finance' | 'Pixels'): Promise<void> {
    await readyLock();
    const hits: string[] = [];
    const releaseFirst = track(() => hits.push(first));
    const releaseSecond = track(() => hits.push(second));
    await lockFinance(TestBed.inject(Injector));
    expect(hits).toEqual([first, second]);
    hits.length = 0;
    await lockFinance(TestBed.inject(Injector));
    expect(hits).toEqual([first, second]);
    releaseFirst();
    releaseSecond();
  }

  it('clears Finance and Pixels once per lock in either registration order (LOCAL1)', async () => {
    await expectBothOrders('Finance', 'Pixels');
    await expectBothOrders('Pixels', 'Finance');
  });

  it('keeps the remaining listener after the other is disposed twice (LOCAL2)', async () => {
    await readyLock();
    const hits: string[] = [];
    const releaseFinance = track(() => hits.push('Finance'));
    const releasePixels = track(() => hits.push('Pixels'));
    releasePixels();
    releasePixels();
    await lockFinance(TestBed.inject(Injector));
    expect(hits).toEqual(['Finance']);
    hits.length = 0;
    releaseFinance();
    releaseFinance();
    await lockFinance(TestBed.inject(Injector));
    expect(hits).toEqual([]);

    const again: string[] = [];
    const releasePixelsAgain = track(() => again.push('Pixels'));
    const releaseFinanceAgain = track(() => again.push('Finance'));
    releasePixelsAgain();
    releasePixelsAgain();
    await lockFinance(TestBed.inject(Injector));
    expect(again).toEqual(['Finance']);
    releaseFinanceAgain();
    releaseFinanceAgain();
  });

  it('unbind drops only that binding when the same callback is registered twice (LOCAL2)', async () => {
    await readyLock();
    let calls = 0;
    const drop = () => { calls += 1; };
    const first = track(drop);
    const second = track(drop);
    first();
    first();
    await lockFinance(TestBed.inject(Injector));
    expect(calls).toBe(1);
    second();
    second();
    calls = 0;
    await lockFinance(TestBed.inject(Injector));
    expect(calls).toBe(0);
  });

  it('snapshots dispatch membership and defers listeners added during the pass', async () => {
    await readyLock();
    const hits: string[] = [];
    let releasePixels: () => void = () => undefined;
    const releaseFinance = track(() => {
      hits.push('Finance');
      releasePixels();
      releases.push(bindLockSnapshots(() => hits.push('Late')));
    });
    releasePixels = track(() => hits.push('Pixels'));
    await lockFinance(TestBed.inject(Injector));
    expect(hits).toEqual(['Finance']);
    hits.length = 0;
    await lockFinance(TestBed.inject(Injector));
    expect(hits).toEqual(['Finance', 'Late']);
    releaseFinance();
  });

  it('wipes the key and clears the other listeners before module load when one throws and BroadcastChannel is unavailable (LOCAL3)', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: SESSION_CONTEXT, useValue: { currentUser: { id: 4 } } as unknown as SessionPort },
      ],
    });
    holdDek({} as CryptoKey);
    localStorage.setItem('finance-dek', 'raw-key-bytes');
    const hits: string[] = [];
    track(() => hits.push('Finance'));
    track(() => { hits.push('Throw'); throw new Error('listener failed'); });
    track(() => hits.push('Pixels'));
    const realChannel = globalThis.BroadcastChannel;
    globalThis.BroadcastChannel = undefined as unknown as typeof BroadcastChannel;
    lockLoad.modules = (() => {
      hits.push('modules');
      return new Promise(() => undefined);
    }) as typeof lockLoad.modules;
    try {
      void lockFinance(TestBed.inject(Injector));
      expect(hits).toEqual(['Finance', 'Throw', 'Pixels']);
      hits.length = 0;
      void lockFinance(TestBed.inject(Injector));
      expect(hits).toEqual(['Finance', 'Throw', 'Pixels']);
      expect([hasDek(), localStorage.getItem('finance-dek')]).toEqual([false, null]);
    } finally {
      globalThis.BroadcastChannel = realChannel;
    }
  });
});
