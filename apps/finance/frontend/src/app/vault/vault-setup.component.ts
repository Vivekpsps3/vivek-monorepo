import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { VaultService } from '../crypto/vault.service';
import { UiButtonComponent, UiCardComponent, UiPageHeaderComponent } from '@vivek/ui';

@Component({
  selector: 'app-vault-setup',
  standalone: true,
  imports: [CommonModule, FormsModule, UiPageHeaderComponent, UiCardComponent, UiButtonComponent],
  template: `
    <div class="page vault-page">
      <ui-page-header [title]="'Create your vault'">

      </ui-page-header>
      <ui-card [title]="'Vault passphrase'">
        <p class="muted">
          Choose a strong vault passphrase (12+). It unlocks encrypted finance data on this browser.
          If you lose the passphrase, your data cannot be recovered—administrators cannot reset vault access.
        </p>
        <label>
          Vault passphrase
          <input type="password" [(ngModel)]="passphrase" autocomplete="new-password" minlength="12" />
        </label>
        <label>
          Confirm passphrase
          <input type="password" [(ngModel)]="confirm" autocomplete="new-password" minlength="12" />
        </label>
        @if (error) {
          <p class="error" role="alert">{{ error }}</p>
        }
        <div class="form-actions">
          <ui-button [disabled]="busy" (clicked)="setup()">Create vault</ui-button>
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
        outline: 2px solid var(--focus-ring);
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
export class VaultSetupComponent implements OnInit {
  passphrase = '';
  confirm = '';
  error = '';
  busy = false;

  constructor(
    private vault: VaultService,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    const status = await this.vault.refreshStatus();
    if (status.exists) {
      await this.router.navigateByUrl('/vault/unlock');
    }
  }

  async setup(): Promise<void> {
    this.error = '';
    if (this.passphrase.length < 12) {
      this.error = 'Passphrase must be at least 12 characters.';
      return;
    }
    if (this.passphrase !== this.confirm) {
      this.error = 'Passphrases do not match.';
      return;
    }
    this.busy = true;
    try {
      await this.vault.setup(this.passphrase);
      await this.router.navigateByUrl('/');
    } catch (e: any) {
      this.error = e?.error?.detail || e?.message || 'Vault setup failed';
    } finally {
      this.busy = false;
    }
  }
}
