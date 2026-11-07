import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { VaultService } from '../crypto/vault.service';
import {
  AUTO_LOCK_STORAGE_KEY,
  FinanceLockService,
  LAST_ACTIVITY_STORAGE_KEY,
} from './finance-lock.service';

describe('FinanceLockService (F5)', () => {
  let unlocked$: BehaviorSubject<boolean>;
  let vaultLock: jasmine.Spy;
  let router: { url: string; navigateByUrl: jasmine.Spy; navigate: jasmine.Spy };

  function setup(url = '/finance/have'): FinanceLockService {
    unlocked$ = new BehaviorSubject<boolean>(false);
    vaultLock = jasmine.createSpy('lock').and.resolveTo();
    router = {
      url,
      navigateByUrl: jasmine.createSpy('navigateByUrl').and.resolveTo(true),
      navigate: jasmine.createSpy('navigate').and.resolveTo(true),
    };
    TestBed.configureTestingModule({
      providers: [
        {
          provide: VaultService,
          useValue: {
            unlocked$,
            get isUnlocked() {
              return unlocked$.value;
            },
            lock: vaultLock,
          },
        },
        { provide: Router, useValue: router },
      ],
    });
    return TestBed.inject(FinanceLockService);
  }

  beforeEach(() => {
    localStorage.removeItem(AUTO_LOCK_STORAGE_KEY);
    localStorage.removeItem(LAST_ACTIVITY_STORAGE_KEY);
  });

  afterEach(() => {
    localStorage.removeItem(AUTO_LOCK_STORAGE_KEY);
    localStorage.removeItem(LAST_ACTIVITY_STORAGE_KEY);
  });

  it('defaults to 15 minutes and ignores bad stored values', () => {
    expect(setup().autoLock()).toBe(15);
    TestBed.resetTestingModule();
    localStorage.setItem(AUTO_LOCK_STORAGE_KEY, 'banana');
    expect(setup().autoLock()).toBe(15);
    TestBed.resetTestingModule();
    localStorage.setItem(AUTO_LOCK_STORAGE_KEY, '7');
    expect(setup().autoLock()).toBe(15);
    TestBed.resetTestingModule();
    localStorage.setItem(AUTO_LOCK_STORAGE_KEY, '60');
    expect(setup().autoLock()).toBe(60);
    TestBed.resetTestingModule();
    localStorage.setItem(AUTO_LOCK_STORAGE_KEY, 'off');
    expect(setup().autoLock()).toBe('off');
  });

  it('locks after the idle limit', fakeAsync(() => {
    const service = setup();
    unlocked$.next(true);
    expect(service.watching).toBe(true);
    tick(15 * 60_000);
    flushMicrotasks();
    expect(service.lastLockReason()).toEqual({ kind: 'auto', minutes: 15 });
    expect(service.watching).toBe(false);
    expect(vaultLock).toHaveBeenCalled();
  }));

  it('does not lock when another tab wrote recent activity', fakeAsync(() => {
    const service = setup();
    unlocked$.next(true);
    tick(10 * 60_000);
    // Another tab is active right now; the shared timestamp keeps us unlocked.
    localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(Date.now()));
    tick(10 * 60_000);
    flushMicrotasks();
    expect(service.lastLockReason()).toBeNull();
    tick(6 * 60_000);
    flushMicrotasks();
    expect(service.lastLockReason()).toEqual({ kind: 'auto', minutes: 15 });
  }));

  it('off never locks', fakeAsync(() => {
    const service = setup();
    service.setAutoLock('off');
    unlocked$.next(true);
    tick(120 * 60_000);
    flushMicrotasks();
    expect(service.lastLockReason()).toBeNull();
    expect(vaultLock).not.toHaveBeenCalled();
  }));

  it('lockNow navigates with next and skips next on vault routes', async () => {
    const service = setup('/finance/have');
    await service.lockNow();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/finance/vault/unlock?next=%2Ffinance%2Fhave');
    router.navigateByUrl.calls.reset();
    router.url = '/finance/vault/unlock';
    await service.lockNow();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/finance/vault/unlock');
  });

  it('lockNow({navigate:false}) does not navigate', async () => {
    const service = setup();
    await service.lockNow({ navigate: false });
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(vaultLock).toHaveBeenCalled();
  });

  it('stops listening after lock', async () => {
    const service = setup();
    unlocked$.next(true);
    expect(service.watching).toBe(true);
    await service.lockNow({ navigate: false });
    expect(service.watching).toBe(false);
  });
});
