import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { continueAfterAuth } from '../auth/after-auth';
import { AuthService } from '../auth/auth.service';
import { VaultService } from '../crypto/vault.service';
import { UiButtonComponent, UiCardComponent, UiPageHeaderComponent } from '@vivek/ui';
import { InfoTipComponent } from '../shared/info-tip.component';

@Component({
  selector: 'app-vault-unlock',
  standalone: true,
  imports: [CommonModule, FormsModule, UiPageHeaderComponent, UiCardComponent, UiButtonComponent, InfoTipComponent],
  template: `
    <div class="page vault-page">
      <ui-page-header [title]="'Unlock vault'">
        <app-info-tip
          uiPageActions
          align="end"
          label="Where decryption happens"
          text="Decrypt your finance data in this browser session. Nothing sensitive is sent to the server." />
      </ui-page-header>
      <ui-card [title]="'Vault passphrase'">
        <p class="muted">
          Signed in as <strong>{{ username || '…' }}</strong>. Remember this username for other browsers.
          A lost passphrase cannot be reset, and encrypted data cannot be recovered.
        </p>
        <label>
          Vault passphrase
          <input type="password" [(ngModel)]="passphrase" autocomplete="current-password" />
        </label>
        @if (error) {
          <p class="error" role="alert">{{ error }}</p>
        }
        <div class="form-actions">
          <ui-button [disabled]="busy" (clicked)="unlock()">Unlock</ui-button>
        </div>
      </ui-card>
    </div>
  `,
  styles: [
    `
      .vault-page {
        box-sizing: border-box;
        width: min(100%, 26.5rem);
        max-width: 26.5rem;
        min-height: 100dvh;
        justify-content: center;
        justify-content: safe center;
        margin-inline: auto;
        padding: max(var(--space-6), env(safe-area-inset-top)) max(var(--space-4), env(safe-area-inset-right))
          max(var(--space-6), env(safe-area-inset-bottom)) max(var(--space-4), env(safe-area-inset-left));
      }
      label {
        display: grid;
        gap: var(--space-2);
        margin: var(--space-4) 0;
        color: var(--text-secondary);
        font-size: var(--text-sm);
        font-weight: 600;
      }
      input {
        box-sizing: border-box;
        width: 100%;
        max-width: 100%;
        min-height: 44px;
        padding: var(--space-3) var(--space-4);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        background: var(--card-bg);
        color: var(--text);
        font: inherit;
        font-size: 1rem;
      }
      input:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }
      .error {
        color: var(--danger);
        font-size: var(--text-sm);
      }
      .muted {
        margin: 0;
        color: var(--text-secondary);
        font-size: var(--text-sm);
        line-height: 1.55;
      }
      .form-actions {
        display: flex;
        margin-top: var(--space-4);
      }
      .form-actions ::ng-deep .ui-btn {
        width: 100%;
        min-height: 44px;
      }
    `,
  ],
})
export class VaultUnlockComponent implements OnInit {
  passphrase = '';
  username = '';
  error = '';
  busy = false;

  constructor(
    private vault: VaultService,
    private auth: AuthService,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    this.username = this.auth.currentUser?.username || this.auth.currentUser?.email || '';
    const status = await this.vault.refreshStatus();
    if (!status.exists) {
      await this.router.navigateByUrl('/vault/setup');
      return;
    }
    if (this.vault.isUnlocked) {
      await continueAfterAuth(this.router);
    }
  }

  async unlock(): Promise<void> {
    this.error = '';
    this.busy = true;
    try {
      await this.vault.unlock(this.passphrase);
      await this.vault.refreshStatus();
      await continueAfterAuth(this.router);
    } catch (e: any) {
      this.error = e?.error?.detail || e?.message || 'Unlock failed';
    } finally {
      this.busy = false;
    }
  }
}
