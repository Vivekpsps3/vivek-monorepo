import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/**
 * Per-user price preferences in plain localStorage (never in the vault):
 * whether prices are checked automatically on unlock, and whether the
 * one-time ticker-privacy notice has been seen. A storage failure (private
 * mode, quota) falls back to the defaults: automatic check on, notice unseen.
 * Home and the account menu both write through these methods.
 */
@Injectable({ providedIn: 'root' })
export class FinancePricePrefsService {
  private readonly changes = new Subject<void>();
  /** Fires after a preference write attempt so every control re-reads this store. */
  readonly changes$ = this.changes.asObservable();

  autoCheck(userId: number): boolean {
    try {
      return localStorage.getItem(`finance-auto-price-check:${userId}`) !== 'off';
    } catch {
      return true;
    }
  }

  setAutoCheck(userId: number, on: boolean): void {
    try {
      localStorage.setItem(`finance-auto-price-check:${userId}`, on ? 'on' : 'off');
    } catch {
      // Preference stays at its default for this browser.
    }
    this.changes.next();
  }

  noticeSeen(userId: number): boolean {
    try {
      return localStorage.getItem(`finance-price-notice-seen:${userId}`) === '1';
    } catch {
      return false;
    }
  }

  markNoticeSeen(userId: number): void {
    try {
      localStorage.setItem(`finance-price-notice-seen:${userId}`, '1');
    } catch {
      // The notice may show again next session; nothing else depends on it.
    }
  }
}

/** Copy for the one-time Home notice and the About price checks disclosure. */
export function automaticPriceNotice(symbols: readonly string[]): string {
  const unique = [...new Set(symbols.map(symbol => symbol.trim().toUpperCase()).filter(symbol => symbol.length > 0))].sort();
  if (unique.length === 0) return 'Prices checked automatically. No ticker symbols were sent.';
  const noun = unique.length === 1 ? 'ticker symbol' : 'ticker symbols';
  return `Prices checked automatically for ${unique.length} ${noun} (${unique.join(', ')}). Only ticker symbols are sent.`;
}
