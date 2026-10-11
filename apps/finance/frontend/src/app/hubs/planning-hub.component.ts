import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CompensationComponent } from '../planning/compensation.component';
import { PlanningComponent } from '../planning/planning.component';
import { InvestmentInsightsComponent } from '../investment-insights/investment-insights.component';
import { StockLabComponent } from '../stock-lab/stock-lab.component';

@Component({
  selector: 'app-planning-hub',
  standalone: true,
  imports: [RouterLink, PlanningComponent, InvestmentInsightsComponent, StockLabComponent, CompensationComponent],
  template: `
    <div class="page">
      <h1>Planning</h1>
      <nav class="hub-tabs" aria-label="Planning">
        <a [routerLink]="[]" [queryParams]="{ t: 'path' }" [class.on]="tab === 'path'">Retirement simulation</a>
        <a [routerLink]="[]" [queryParams]="{ t: 'compensation' }" [class.on]="tab === 'compensation'">Compensation</a>
        <a [routerLink]="[]" [queryParams]="{ t: 'growth' }" [class.on]="tab === 'growth'">Portfolio projection</a>
        <a [routerLink]="[]" [queryParams]="{ t: 'stocks' }" [class.on]="tab === 'stocks'">Stock research</a>
      </nav>
      @switch (tab) {
        @case ('compensation') { <app-compensation /> }
        @case ('growth') { <app-investment-insights [embedded]="true" /> }
        @case ('stocks') { <app-stock-lab [embedded]="true" /> }
        @default { <app-planning [embedded]="true" /> }
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanningHubComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);
  tab = 'path';

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const requested = params.get('t');
      this.tab = requested === 'compensation' || requested === 'growth' || requested === 'stocks' ? requested : 'path';
      this.cdr.markForCheck();
    });
  }
}
