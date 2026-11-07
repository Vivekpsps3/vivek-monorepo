import { Injectable, Injector, NgZone, OnDestroy, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { lockFinance } from '../crypto/lock-finance';
import { VaultService } from '../crypto/vault.service';

export type AutoLockSetting = 'off' | 5 | 15 | 60;

export const AUTO_LOCK_STORAGE_KEY = 'finance-auto-lock';
export const LAST_ACTIVITY_STORAGE_KEY = 'finance-last-activity';

const CHECK_INTERVAL_MS = 15_000;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

function readAutoLockSetting(): AutoLockSetting {
  try {
    const raw = localStorage.getItem(AUTO_LOCK_STORAGE_KEY);
    if (raw === 'off') return 'off';
    const value = raw === null ? NaN : Number(raw);
    return value === 5 || value === 15 || value === 60 ? value : 15;
  } catch {
    return 15;
  }
}

/**
 * F5 lock + auto-lock. `lockNow` is the one lock path (menu, Settings,
 * remote lock, idle timer): it runs the existing lock sequence
 * (cross-tab broadcast, session-state clear, market session end, vault
 * lock — see `lockFinance`) and then returns the user to the unlock
 * screen with `next` pointing at the screen they were on.
 *
 * Idle tracking follows `vault.unlocked$`: while unlocked it listens on
 * the document (outside Angular) and shares activity across tabs through
 * the `finance-last-activity` localStorage timestamp, so activity in any
 * tab keeps every tab unlocked.
 */
@Injectable({ providedIn: 'root' })
export class FinanceLockService implements OnDestroy {
  private readonly injector = inject(Injector);
  private readonly router = inject(Router);
  private readonly vault = inject(VaultService);
  private readonly zone = inject(NgZone);

  private readonly autoLockSignal = signal<AutoLockSetting>(readAutoLockSetting());
  readonly autoLock = this.autoLockSignal.asReadonly();

  private readonly lastLockReasonSignal = signal<{ kind: 'auto'; minutes: number } | null>(null);
  readonly lastLockReason = this.lastLockReasonSignal.asReadonly();

  private listening = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastLocalActivity = 0;
  private lastActivityWrite = 0;

  private readonly subscription = this.vault.unlocked$?.subscribe(unlocked => {
    if (unlocked) this.startWatching();
    else this.stopWatching();
  });

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    this.stopWatching();
  }

  get watching(): boolean {
    return this.listening;
  }

  setAutoLock(value: AutoLockSetting): void {
    this.autoLockSignal.set(value);
    try {
      localStorage.setItem(AUTO_LOCK_STORAGE_KEY, String(value));
    } catch {
      /* storage unavailable; the signal still applies for this page load */
    }
  }

  clearLockReason(): void {
    this.lastLockReasonSignal.set(null);
  }

  async lockNow(opts: { navigate?: boolean; reason?: 'auto' } = {}): Promise<void> {
    if (opts.reason === 'auto') {
      const setting = this.autoLockSignal();
      this.lastLockReasonSignal.set({ kind: 'auto', minutes: typeof setting === 'number' ? setting : 15 });
    }
    this.stopWatching();
    await lockFinance(this.injector);
    if (opts.navigate === false) return;
    const url = this.router.url || '';
    if (url.startsWith('/finance/vault/')) {
      await this.router.navigateByUrl('/finance/vault/unlock');
    } else {
      await this.router.navigateByUrl(`/finance/vault/unlock?next=${encodeURIComponent(url)}`);
    }
  }

  private startWatching(): void {
    if (this.listening || typeof document === 'undefined') return;
    this.listening = true;
    this.lastLocalActivity = Date.now();
    this.zone.runOutsideAngular(() => {
      for (const event of ACTIVITY_EVENTS) {
        document.addEventListener(event, this.onActivity, { capture: true, passive: true });
      }
      document.addEventListener('visibilitychange', this.onVisibility);
      this.timer = setInterval(() => this.checkIdle(), CHECK_INTERVAL_MS);
    });
  }

  private stopWatching(): void {
    if (!this.listening) return;
    this.listening = false;
    if (typeof document !== 'undefined') {
      for (const event of ACTIVITY_EVENTS) {
        document.removeEventListener(event, this.onActivity, { capture: true });
      }
      document.removeEventListener('visibilitychange', this.onVisibility);
    }
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private readonly onActivity = (): void => {
    const now = Date.now();
    this.lastLocalActivity = now;
    if (now - this.lastActivityWrite < 5_000) return;
    this.lastActivityWrite = now;
    try {
      localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(now));
    } catch {
      /* private mode: same-tab activity only */
    }
  };

  private readonly onVisibility = (): void => {
    if (document.visibilityState === 'visible') this.checkIdle();
  };

  private checkIdle(): void {
    const setting = this.autoLockSignal();
    if (setting === 'off') return;
    if (!this.vault.isUnlocked) return;
    let shared = 0;
    try {
      shared = Number(localStorage.getItem(LAST_ACTIVITY_STORAGE_KEY)) || 0;
    } catch {
      shared = 0;
    }
    const idleFor = Date.now() - Math.max(this.lastLocalActivity, shared);
    if (idleFor < setting * 60_000) return;
    const url = this.router.url || '';
    const onFinanceRoute = url.startsWith('/finance/') && !url.startsWith('/finance/vault/');
    this.zone.run(() => {
      void this.lockNow({ navigate: onFinanceRoute, reason: 'auto' });
    });
  }
}
