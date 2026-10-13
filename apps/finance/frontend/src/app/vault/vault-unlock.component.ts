import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { afterAuthUrl } from '../auth/after-auth';
import { AuthService } from '../auth/auth.service';
import { VaultService } from '../crypto/vault.service';
import { UiButtonComponent, UiCardComponent, UiPageHeaderComponent } from '../shared/ui';

@Component({
  selector: 'app-vault-unlock',
  standalone: true,
  imports: [CommonModule, FormsModule, UiPageHeaderComponent, UiCardComponent, UiButtonComponent],
  template: `
    <div class="page vault-page">
      <ui-page-header
        [title]="'Unlock vault'"
        subtitle="Decrypt your finance data in this browser session. Nothing sensitive is sent to the server." />
      <ui-card [title]="'Vault passphrase'">
        <label>
          Vault passphrase
          <input type="password" [(ngModel)]="passphrase" autocomplete="current-password" />
        </label>
        <p class="muted">
          Signed in as <strong>{{ username || '…' }}</strong>. Remember this username for other browsers.
          If you forget your passphrase, encrypted data cannot be recovered.
        </p>
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
        max-width: 40rem;
      }
      label {
        display: grid;
        gap: 0.4rem;
        margin: 1rem 0;
      }
      .error {
        color: var(--danger);
      }
      .muted {
        color: var(--text-secondary);
        font-size: 0.9rem;
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
      await this.router.navigateByUrl(afterAuthUrl());
    }
  }

  async unlock(): Promise<void> {
    this.error = '';
    this.busy = true;
    try {
      await this.vault.unlock(this.passphrase);
      await this.vault.refreshStatus();
      await this.router.navigateByUrl(afterAuthUrl());
    } catch (e: any) {
      this.error = e?.error?.detail || e?.message || 'Unlock failed';
    } finally {
      this.busy = false;
    }
  }
}
