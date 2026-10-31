import { Injector } from '@angular/core';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SESSION_CONTEXT, ToastService, type SessionPort } from '@vivek/ui';
import { FinanceService } from '../services/finance.service';
import { MarketRefreshCoordinatorService } from '../services/market-refresh-coordinator.service';
import { hasDek, holdDek } from './dek-holder';
import { lockFinance, lockLoad } from './lock-finance';
import { VaultService } from './vault.service';
const realLoad = lockLoad.modules;

describe('lockFinance', () => {
  afterEach(() => {
    localStorage.removeItem('finance-dek');
    lockLoad.modules = realLoad;
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
      lock.call(vault);
    });
    await lockFinance(TestBed.inject(Injector));
    expect(order).toEqual(['broadcast', 'end', 'caches', 'lock']);
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
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [{ provide: SESSION_CONTEXT, useValue: { currentUser: { id: 7 } } as unknown as SessionPort }],
    });
    const injector = TestBed.inject(Injector);
    const vault = TestBed.inject(VaultService);
    await vault.whenReady();
    holdDek({} as CryptoKey);
    vault['unlockedSubject'].next(true);
    localStorage.setItem('finance-dek', 'raw-key-bytes');
    const toast = TestBed.inject(ToastService);
    spyOn(toast, 'error');
    const heard: unknown[] = [];
    const other = new BroadcastChannel('finance-vault-sync-v1');
    other.onmessage = event => heard.push(event.data);
    lockLoad.modules = (() => Promise.reject(new Error('chunk'))) as typeof lockLoad.modules;
    await expectAsync(lockFinance(injector)).toBeResolved();
    await new Promise(resolve => setTimeout(resolve, 0));
    other.close();
    expect([hasDek(), localStorage.getItem('finance-dek'), vault.isUnlocked]).toEqual([false, null, false]);
    expect(toast.error).toHaveBeenCalled();
    expect(heard).toContain(jasmine.objectContaining({ version: 1, userId: 7, kind: 'lock' }));
  });
});
