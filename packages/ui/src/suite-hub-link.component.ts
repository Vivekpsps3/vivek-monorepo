import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'ui-suite-hub',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="suite-hub" routerLink="/hub">
      <svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M1 1h6v6H1zm8 0h6v6H9zM1 9h6v6H1zm8 0h6v6H9z"/></svg>
      Hub
    </a>
  `,
  styles: [`
    :host {
      display: inline-flex;
      flex: 0 0 auto;
      min-width: 0;
    }

    .suite-hub {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      flex: 0 0 auto;
      box-sizing: border-box;
      min-height: 44px;
      padding: 0 var(--space-3);
      border-radius: var(--radius-md);
      color: var(--text);
      font-size: var(--text-sm);
      font-weight: 650;
      line-height: 1;
      text-decoration: none;
      white-space: nowrap;
    }

    .suite-hub svg {
      width: 14px;
      height: 14px;
      flex: 0 0 auto;
    }

    .suite-hub:hover {
      background: var(--surface-hover);
    }

    .suite-hub:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 2px;
    }

    @media (max-width: 768px) {
      .suite-hub {
        gap: var(--space-1);
        padding-inline: var(--space-2);
      }
    }
  `],
})
export class SuiteHubLinkComponent {}
