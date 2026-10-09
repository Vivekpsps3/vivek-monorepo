import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
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
        <a [routerLink]="[]" [queryParams]="{ t: 'path' }" [class.on]="tab === 'path'">Path</a>
        <a [routerLink]="[]" [queryParams]="{ t: 'compensation' }" [class.on]="tab === 'compensation'">Compensation</a>
        <a [routerLink]="[]" [queryParams]="{ t: 'growth' }" [class.on]="tab === 'growth'">Growth</a>
        <a [routerLink]="[]" [queryParams]="{ t: 'stocks' }" [class.on]="tab === 'stocks'">Stocks</a>
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
  tab = 'path';

  ngOnInit(): void {
    this.route.queryParamMap.subscribe(params => {
      const requested = params.get('t');
      this.tab = requested === 'compensation' || requested === 'growth' || requested === 'stocks' ? requested : 'path';
      this.cdr.markForCheck();
    });
  }
}
