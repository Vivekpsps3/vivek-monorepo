import { Inject, Component, OnInit, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { continueAfterAuth, safeNextPath } from '@vivek/ui';
import { SESSION_CONTEXT, type SessionPort } from '@vivek/ui';
import { VaultService } from '../crypto/vault.service';
import { FinanceLockService } from '../core/finance-lock.service';
import { UiButtonComponent, UiCardComponent, UiInputComponent, UiPageHeaderComponent } from '@vivek/ui';

export const EMPTY_PASSPHRASE_MESSAGE = 'Enter your vault passphrase.';
export const WRONG_PASSPHRASE_MESSAGE = "That passphrase didn't unlock your vault. Check it and try again.";
export const NETWORK_MESSAGE = "Can't reach Finance. Check your connection and try again.";

@Component({
  selector: 'app-vault-unlock',
  standalone: true,
  imports: [UiPageHeaderComponent, UiCardComponent, UiButtonComponent, UiInputComponent],
  template: `
    <div class="page vault-page">
      <ui-page-header title="Unlock your vault" />
      <ui-card>
        @if (username) {
          <p class="vault-unlock__who">Signed in as <strong>{{ username }}</strong>. <button type="button" class="vault-unlock__link" (click)="signOut()">Not you? Sign out</button></p>
        }
        @if (lockNotice) { <p class="vault-unlock__notice" role="status">{{ lockNotice }}</p> }
        <form (submit)="submit($event)" novalidate>
          <ui-input
            inputId="vault-passphrase"
            label="Vault passphrase"
            type="password"
            [showPasswordToggle]="true"
            autocomplete="current-password"
            [required]="true"
            [invalid]="error.length > 0"
            describedBy="vault-unlock-help vault-unlock-error"
            [(value)]="passphrase" />
          <p class="vault-unlock__error" id="vault-unlock-error" role="alert">{{ error }}</p>
          <p class="vault-unlock__help" id="vault-unlock-help">Your passphrase decrypts your data in this browser. It's never sent to the server.</p>
          <div class="form-actions">
            <ui-button type="submit" [disabled]="busy">{{ busy ? (slow ? 'Unlocking… this can take a few seconds on a phone.' : 'Unlocking…') : 'Unlock' }}</ui-button>
          </div>
        </form>
        <p class="vault-unlock__recovery">Forgot it? A lost passphrase can't be reset. Your encrypted data can't be recovered.</p>
      </ui-card>
    </div>
  `,
  styleUrl: './vault-page.css',
})
export class VaultUnlockComponent implements OnInit {
  passphrase = '';
  username = '';
  error = '';
  busy = false;
  slow = false;
  lockNotice = '';
  private slowTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly financeLock = inject(FinanceLockService);

  constructor(
    private vault: VaultService,
    @Inject(SESSION_CONTEXT) private auth: SessionPort,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    this.username = this.auth.currentUser?.username || this.auth.currentUser?.email || '';
    const reason = this.financeLock.lastLockReason();
    if (reason?.kind === 'auto') {
      this.lockNotice = `Finance locked after ${reason.minutes} minutes without activity.`;
    }
    this.financeLock.clearLockReason();
    const status = await this.vault.refreshStatus();
    if (!status.exists) {
      await this.router.navigateByUrl('/finance/vault/setup');
      return;
    }
    if (this.vault.isUnlocked) {
      await this.continueAfterUnlock();
    }
  }

  signOut(): void {
    this.auth.logout();
  }

  /** Where a successful unlock lands: a valid next, else Finance Home (or the embed). */
  private continueAfterUnlock(): Promise<boolean> {
    if (safeNextPath()) return continueAfterAuth(this.router);
    return this.router.navigateByUrl(window.self === window.top ? '/finance' : '/finance/embed');
  }

  submit(event: Event): void {
    event.preventDefault();
    void this.unlock();
  }

  async unlock(): Promise<void> {
    if (!this.passphrase) {
      this.error = EMPTY_PASSPHRASE_MESSAGE;
      return;
    }
    this.error = '';
    this.slow = false;
    this.busy = true;
    this.slowTimer = setTimeout(() => {
      this.slow = true;
    }, 1500);
    try {
      const opened = await this.vault.unlock(this.passphrase);
      if (!opened || !this.vault.isUnlocked) {
        this.error = 'Vault was locked, try again';
        this.focusPassphrase();
        return;
      }
      // A long-lived session never went through loginWithVault, so this is the upgrade path.
      // Do not await it: the rewrap must not hold the unlock screen.
      void this.vault.upgradeKdfIfNeeded(this.passphrase);
      await this.continueAfterUnlock();
    } catch (e: any) {
      if (e?.message === 'Vault is not set up') {
        const next = safeNextPath();
        await this.router.navigate(['/finance/vault/setup'], { queryParams: { next: next ?? undefined } });
        return;
      }
      this.error = unlockErrorMessage(e);
      this.focusPassphrase();
    } finally {
      if (this.slowTimer !== null) clearTimeout(this.slowTimer);
      this.slowTimer = null;
      this.slow = false;
      this.busy = false;
    }
  }

  private focusPassphrase(): void {
    setTimeout(() => document.getElementById('vault-passphrase')?.focus());
  }
}

/** §4.7 classification: raw WebCrypto/server text never reaches the screen. */
export function unlockErrorMessage(e: any): string {
  if (e instanceof HttpErrorResponse && (e.status === 0 || e.status >= 500)) return NETWORK_MESSAGE;
  return WRONG_PASSPHRASE_MESSAGE;
}
