import { Injectable } from '@angular/core';

/**
 * Per-user price preferences in plain localStorage (never in the vault):
 * whether prices are checked automatically on unlock, and whether the
 * one-time ticker-privacy notice has been seen. A storage failure (private
 * mode, quota) falls back to the defaults: automatic check on, notice unseen.
 */
@Injectable({ providedIn: 'root' })
export class FinancePricePrefsService {
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
