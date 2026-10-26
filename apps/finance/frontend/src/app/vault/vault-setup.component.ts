import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { VaultService } from '../crypto/vault.service';
import { UiButtonComponent, UiCardComponent, UiInputComponent, UiPageHeaderComponent } from '@vivek/ui';
import { SuiteHubLinkComponent } from '../core/layout/suite-hub-link.component';

@Component({
  selector: 'app-vault-setup',
  standalone: true,
  imports: [UiPageHeaderComponent, UiCardComponent, UiButtonComponent, UiInputComponent, SuiteHubLinkComponent],
  template: `
    <app-suite-hub />
    <div class="page vault-page">
      <ui-page-header [title]="'Create your vault'" />
      <ui-card [title]="'Vault passphrase'">
        <p class="muted">
          Choose a strong vault passphrase (12+). It unlocks encrypted finance data on this browser.
          If you lose the passphrase, your data cannot be recovered—administrators cannot reset vault access.
        </p>
        <form (submit)="submit($event)">
          <ui-input
            label="Vault passphrase"
            type="password"
            [showPasswordToggle]="true"
            autocomplete="new-password"
            [required]="true"
            [invalid]="error.length > 0"
            [describedBy]="error ? 'vault-setup-error' : undefined"
            [(value)]="passphrase" />
          <ui-input
            label="Confirm passphrase"
            type="password"
            [showPasswordToggle]="true"
            autocomplete="new-password"
            [required]="true"
            [invalid]="error.length > 0"
            [describedBy]="error ? 'vault-setup-error' : undefined"
            [(value)]="confirm" />
          @if (error) {
            <p class="error" id="vault-setup-error" role="alert">{{ error }}</p>
          }
          <div class="form-actions">
            <ui-button type="submit" [disabled]="busy">{{ busy ? 'Creating vault…' : 'Create vault' }}</ui-button>
          </div>
        </form>
      </ui-card>
    </div>
  `,
  styleUrl: './vault-page.css',
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

  submit(event: Event): void {
    event.preventDefault();
    void this.setup();
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
