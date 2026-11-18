import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { VaultService } from '../crypto/vault.service';
import {
  ReturnContext, SESSION_CONTEXT, UiButtonComponent, UiCardComponent, UiInputComponent, UiPageHeaderComponent,
  currentVaultReturn, vaultReturnQuery,
} from '@vivek/ui';

@Component({
  selector: 'app-vault-setup',
  standalone: true,
  imports: [UiPageHeaderComponent, UiCardComponent, UiButtonComponent, UiInputComponent],
  template: `

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
  private readonly destroy = inject(DestroyRef);
  private readonly session = inject(SESSION_CONTEXT);
  private readonly source = inject(ReturnContext);
  private readonly owner = this.session.currentUser?.id;
  private readonly revision = this.session.revision;

  constructor(
    private vault: VaultService,
    private router: Router
  ) {
    const clear = () => {
      this.passphrase = '';
      this.confirm = '';
      this.error = '';
    };
    this.destroy.onDestroy(clear);
    this.session.cleared$.pipe(takeUntilDestroyed(this.destroy)).subscribe(clear);
  }

  private get active(): boolean {
    return !this.destroy.destroyed && this.revision === this.session.revision
      && this.owner === this.session.currentUser?.id;
  }

  async ngOnInit(): Promise<void> {
    const status = await this.vault.refreshStatus();
    if (this.active && status.exists) {
      const next = currentVaultReturn() ?? '';
      await this.router.navigate(['/finance/vault/unlock'], {
        queryParams: vaultReturnQuery(next),
        state: this.source.sourceState(next),
        replaceUrl: true,
      });
    }
  }

  submit(event: Event): void {
    event.preventDefault();
    void this.setup();
  }

  async setup(): Promise<void> {
    if (!this.active || this.busy) return;
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
      if (!this.active) return;
      if (!this.vault.isUnlocked) {
        this.error = 'Vault did not open. Try again.';
        return;
      }
      this.passphrase = '';
      this.confirm = '';
      await this.source.finishVault();
    } catch (e: any) {
      if (this.active) this.error = e?.error?.detail || e?.message || 'Vault setup failed';
    } finally {
      this.busy = false;
    }
  }
}
