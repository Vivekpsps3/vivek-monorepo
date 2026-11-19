import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { AssetsLiabilitiesComponent } from '../assets-liabilities/assets-liabilities.component';
import { PortfolioComponent } from '../portfolio/portfolio.component';
import { UiPageHeaderComponent } from '@vivek/ui';

@Component({
  selector: 'app-have-hub',
  standalone: true,
  imports: [AssetsLiabilitiesComponent, PortfolioComponent, UiPageHeaderComponent],
  template: `
    <div class="page">
      @if (tab === 'holdings') {
        <ui-page-header title="Holdings" [concealTitle]="true" />
        <app-portfolio [embedded]="true" />
      } @else {
        <app-assets-liabilities />
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
  private destroy = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);
  tab = 'assets';

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroy)).subscribe(params => {
      this.tab = params.get('t') === 'holdings' ? 'holdings' : 'assets';
      this.cdr.markForCheck();
    });
  }
}
