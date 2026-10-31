import { Inject, Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { continueAfterAuth } from '@vivek/ui';
import { SESSION_CONTEXT, type SessionPort } from '@vivek/ui';
import { VaultService } from '../crypto/vault.service';
import { UiButtonComponent, UiCardComponent, UiInputComponent, UiPageHeaderComponent } from '@vivek/ui';

@Component({
  selector: 'app-vault-unlock',
  standalone: true,
  imports: [UiPageHeaderComponent, UiCardComponent, UiButtonComponent, UiInputComponent],
  template: `

    <div class="page vault-page">
      <ui-page-header [title]="'Unlock vault'" />
      <ui-card [title]="'Vault passphrase'">
        <p class="muted">
          @if (username) { <span>Signed in as {{ username }}. </span> }
          Remember this username for other browsers.
          A lost passphrase cannot be reset, and encrypted data cannot be recovered.
        </p>
        <form (submit)="submit($event)">
          <ui-input
            label="Vault passphrase"
            type="password"
            [showPasswordToggle]="true"
            autocomplete="current-password"
            [required]="true"
            [invalid]="error.length > 0"
            [describedBy]="error ? 'vault-unlock-error' : undefined"
            [(value)]="passphrase" />
          @if (error) {
            <p class="error" id="vault-unlock-error" role="alert">{{ error }}</p>
          }
          <div class="form-actions">
            <ui-button type="submit" [disabled]="busy">{{ busy ? 'Unlocking…' : 'Unlock' }}</ui-button>
          </div>
        </form>
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

  constructor(
    private vault: VaultService,
    @Inject(SESSION_CONTEXT) private auth: SessionPort,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    this.username = this.auth.currentUser?.username || this.auth.currentUser?.email || '';
    const status = await this.vault.refreshStatus();
    if (!status.exists) {
      await this.router.navigateByUrl('/finance/vault/setup');
      return;
    }
    if (this.vault.isUnlocked) {
      await continueAfterAuth(this.router);
    }
  }

  submit(event: Event): void {
    event.preventDefault();
    void this.unlock();
  }

  async unlock(): Promise<void> {
    this.error = '';
    this.busy = true;
    try {
      const opened = await this.vault.unlock(this.passphrase);
      if (!opened || !this.vault.isUnlocked) return;
      // A long-lived session never went through loginWithVault, so this is the upgrade path.
      // Do not await it: the rewrap must not hold the unlock screen.
      void this.vault.upgradeKdfIfNeeded(this.passphrase);
      await continueAfterAuth(this.router);
    } catch (e: any) {
      this.error = e?.error?.detail || e?.message || 'Unlock failed';
    } finally {
      this.busy = false;
    }
  }
}
