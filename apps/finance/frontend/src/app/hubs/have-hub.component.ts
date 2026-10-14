import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AssetsLiabilitiesComponent } from '../assets-liabilities/assets-liabilities.component';
import { PortfolioComponent } from '../portfolio/portfolio.component';

@Component({
  selector: 'app-have-hub',
  standalone: true,
  imports: [RouterLink, AssetsLiabilitiesComponent, PortfolioComponent],
  template: `
    <div class="page">
      <h1>What you have</h1>
      <nav class="hub-tabs" aria-label="What you have">
        <a [routerLink]="[]" [queryParams]="{ t: 'assets' }" [class.on]="tab === 'assets'">Assets and debts</a>
        <a [routerLink]="[]" [queryParams]="{ t: 'holdings' }" [class.on]="tab === 'holdings'">Holdings</a>
      </nav>
      @if (tab === 'holdings') {
        <app-portfolio [embedded]="true" />
      } @else {
        <app-assets-liabilities [embedded]="true" />
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      min-width: 0;
      max-width: 100%;
    }

    .page {
      min-width: 0;
    }

    h1 {
      margin: 0;
      letter-spacing: -0.03em;
    }

    app-assets-liabilities,
    app-portfolio {
      display: block;
      min-width: 0;
      max-width: 100%;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HaveHubComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);
  tab = 'assets';

  ngOnInit(): void {
    this.route.queryParamMap.subscribe(params => {
      this.tab = params.get('t') === 'holdings' ? 'holdings' : 'assets';
      this.cdr.markForCheck();
    });
  }
}
