import { ChangeDetectionStrategy, Component, ViewChild, inject, input, signal } from '@angular/core';
import { Router, RouterLink, UrlTree } from '@angular/router';
import { todayIsoDate } from '@vivek/browser';
import { UiButtonComponent, UiDialogComponent, UiMenuComponent, UiMenuItemDirective, vaultUnlockHref } from '@vivek/ui';
import { financeVaultPresent } from '../../../../finance/frontend/src/public-api';
import { SessionService } from '../platform/session.service';

@Component({
  selector: 'app-quick-add',
  standalone: true,
  imports: [RouterLink, UiMenuComponent, UiMenuItemDirective, UiDialogComponent, UiButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-menu label="Quick add" icon="plus">
      <a uiMenuItem routerLink="/travel/trips/new">Plan a trip</a>
      <a uiMenuItem routerLink="/media/search">Add media</a>
      <a uiMenuItem [routerLink]="transactionHref()">Add transaction</a>
    </ui-menu>
    <button class="help" type="button" aria-label="Keyboard shortcuts" aria-keyshortcuts="?" (click)="help.set(true)">?</button>
    <ui-dialog [open]="help()" labelledBy="workspace-shortcuts-title" (closed)="help.set(false)">
      <h2 id="workspace-shortcuts-title">Keyboard shortcuts</h2>
      <dl><dt>N</dt><dd>Quick add</dd><dt>?</dt><dd>Show keyboard shortcuts</dd><dt>Ctrl/⌘ K</dt><dd>Search</dd></dl>
      <ui-button (clicked)="help.set(false)">Close</ui-button>
    </ui-dialog>
  `,
  styles: [`
    :host { display: flex; align-items: center; gap: var(--space-2); }
    .help { min-width: 44px; min-height: 44px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--card-bg); color: var(--text); font: inherit; cursor: pointer; }
    dl { display: grid; grid-template-columns: auto 1fr; gap: var(--space-3); }
    dd { margin: 0; }
  `],
})
export class QuickAddComponent {
  readonly locked = input(true);
  readonly help = signal(false);
  private readonly session = inject(SessionService);
  @ViewChild(UiMenuComponent) private menu?: UiMenuComponent;

  private readonly router = inject(Router);

  transactionHref(): UrlTree {
    const next = `/finance/spending?t=activity&date=${todayIsoDate()}&add=1`;
    return this.router.parseUrl(this.locked() && financeVaultPresent()
      ? vaultUnlockHref(next) : next);
  }

  onWorkspaceShortcut(event: KeyboardEvent): void {
    if (!this.session.currentUser || this.help() || this.menu?.open()) return;
    if (event.key.toLowerCase() === 'n') {
      event.preventDefault();
      this.menu?.onTriggerKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    } else if (event.key === '?') {
      event.preventDefault();
      this.help.set(true);
    }
  }
}
