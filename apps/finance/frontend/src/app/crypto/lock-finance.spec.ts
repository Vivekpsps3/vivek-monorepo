import { Injector } from '@angular/core';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
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
      return lock.call(vault);
    });
    await lockFinance(TestBed.inject(Injector));
    expect(order).toEqual(['broadcast', 'end', 'caches', 'lock']);
    vault['unlockedSubject'].next(true);
    expect(localStorage.getItem('finance-dek')).toBeNull();
    expect(hasDek()).toBeFalse();
  });
  it('wipes memory and storage when the import rejects or never resolves', async () => {
    TestBed.configureTestingModule({});
    const injector = TestBed.inject(Injector);
    const run = async (load: typeof lockLoad.modules, wait: boolean) => {
      holdDek({} as CryptoKey);
      localStorage.setItem('finance-dek', 'raw-key-bytes');
      lockLoad.modules = load;
      const pending = lockFinance(injector);
      if (wait) await expectAsync(pending).toBeRejected();
      expect([hasDek(), localStorage.getItem('finance-dek')]).toEqual([false, null]);
    };
    await run((() => new Promise(() => undefined)) as typeof lockLoad.modules, false);
    await run((() => Promise.reject(new Error('chunk'))) as typeof lockLoad.modules, true);
  });
});
