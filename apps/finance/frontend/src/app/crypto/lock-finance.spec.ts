import { Injector } from '@angular/core';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FinanceService } from '../services/finance.service';
import { MarketRefreshCoordinatorService } from '../services/market-refresh-coordinator.service';
import { lockFinance } from './lock-finance';
import { VaultService } from './vault.service';

describe('lockFinance', () => {
  afterEach(() => localStorage.removeItem('finance-dek'));

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
    const memoryKey = {} as CryptoKey;
    vault['dek'] = memoryKey;
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
    expect(vault['dek']).toBeNull();
    expect(vault['dek']).not.toBe(memoryKey);
  });
});
