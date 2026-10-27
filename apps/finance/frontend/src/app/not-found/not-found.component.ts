import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UiButtonComponent, UiCardComponent, UiPageHeaderComponent } from '@vivek/ui';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink, UiButtonComponent, UiCardComponent, UiPageHeaderComponent],
  template: `
    <div class="page not-found-page">
      <ui-page-header [title]="'Page not found'" subtitle="This location is not available in your finance workspace." />
      <ui-card>
        <p>Return to Home to see current balances and this month's cashflow.</p>
        <ui-button routerLink="/finance/">Go to dashboard</ui-button>
      </ui-card>
    </div>
  `,
  styles: [`
    .not-found-page {
      box-sizing: border-box;
      width: min(100%, 26.5rem);
      max-width: 26.5rem;
    }
    .not-found-page p {
      margin: 0 0 var(--space-4);
      color: var(--text-secondary);
    }
    .not-found-page ::ng-deep .ui-btn {
      min-height: 44px;
      max-width: 100%;
    }
    @media (max-width: 768px) {
      .not-found-page ::ng-deep .ui-btn { width: 100%; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundComponent {}
