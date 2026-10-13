import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UiButtonComponent, UiCardComponent, UiPageHeaderComponent } from '../shared/ui';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink, UiButtonComponent, UiCardComponent, UiPageHeaderComponent],
  template: `
    <div class="page not-found-page">
      <ui-page-header [title]="'Page not found'" subtitle="This location is not available in your finance workspace." />
      <ui-card>
        <p>Return to Home to see current balances, activity, and scheduled cashflow.</p>
        <ui-button routerLink="/">Go to dashboard</ui-button>
      </ui-card>
    </div>
  `,
  styles: [`.not-found-page { max-width: 42rem; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundComponent {}
