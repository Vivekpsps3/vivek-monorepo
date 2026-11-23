import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { AccountsHallComponent } from '../accounts-hall/accounts-hall.component';
import { AssetsLiabilitiesComponent } from '../assets-liabilities/assets-liabilities.component';
import { PortfolioComponent } from '../portfolio/portfolio.component';
import { TreasuryGalleryComponent } from '../treasury-gallery/treasury-gallery.component';
import { UiPageHeaderComponent } from '@vivek/ui';

@Component({
  selector: 'app-have-hub',
  standalone: true,
  imports: [AssetsLiabilitiesComponent, AccountsHallComponent, PortfolioComponent, TreasuryGalleryComponent, UiPageHeaderComponent],
  template: `
    <div class="page">
      @if (tab === 'holdings') {
        <ui-page-header title="Holdings" [concealTitle]="true" />
        <app-portfolio [embedded]="true" />
      } @else if (tab === 'hall') {
        <app-accounts-hall />
      } @else if (tab === 'gallery') {
        <app-treasury-gallery />
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
    app-accounts-hall,
    app-portfolio,
    app-treasury-gallery {
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
      const requested = params.get('t');
      const tab = requested === 'holdings' || requested === 'hall' || requested === 'gallery' ? requested : 'assets';
      this.tab = tab;
      this.cdr.markForCheck();
    });
  }
}
