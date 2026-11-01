import { Injector } from '@angular/core';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SESSION_CONTEXT, ToastService, type SessionPort } from '@vivek/ui';
import { FinanceService } from '../services/finance.service';
import { MarketRefreshCoordinatorService } from '../services/market-refresh-coordinator.service';
import { hasDek, holdDek } from './dek-holder';
import { LOCK_SIGNAL, VAULT_PRESENCE } from './dek-store';
import { lockFinance, lockLoad } from './lock-finance';
import { VaultService } from './vault.service';
const realLoad = lockLoad.modules;

describe('lockFinance', () => {
  afterEach(() => {
    localStorage.removeItem('finance-dek');
    localStorage.removeItem(VAULT_PRESENCE);
    localStorage.removeItem(LOCK_SIGNAL);
    lockLoad.modules = realLoad;
    TestBed.resetTestingModule();
  });

  it('broadcasts, ends refresh, clears caches, then locks storage and memory', async () => {
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
            broadcastLock: () => order.push('broadcast'),
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
    expect(order).toEqual(['caches', 'broadcast', 'end', 'lock']);
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
    expect(toast.error).toHaveBeenCalledWith(jasmine.any(String), jasmine.objectContaining({ label: 'Try again' }));
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
});
