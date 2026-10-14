import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PlanningComponent } from '../planning/planning.component';
import { InvestmentInsightsComponent } from '../investment-insights/investment-insights.component';
import { StockLabComponent } from '../stock-lab/stock-lab.component';
import { PlanningToolId } from '../models/planning.model';

@Component({
  selector: 'app-planning-hub',
  standalone: true,
  imports: [RouterLink, PlanningComponent, InvestmentInsightsComponent, StockLabComponent],
  template: `
    <div class="page">
      <h1>Planning</h1>
      <nav class="hub-tabs" aria-label="Planning">
        <a [routerLink]="[]" [queryParams]="{ t: 'path' }" [class.on]="tab === 'path'">Retirement &amp; goals</a>
        <a [routerLink]="[]" [queryParams]="{ t: 'growth' }" [class.on]="tab === 'growth'">Portfolio projection</a>
        <a [routerLink]="[]" [queryParams]="{ t: 'stocks' }" [class.on]="tab === 'stocks'">Stock research</a>
      </nav>
      @switch (tab) {
        @case ('growth') { <app-investment-insights [embedded]="true" /> }
        @case ('stocks') { <app-stock-lab [embedded]="true" /> }
        @default { <app-planning [embedded]="true" [tool]="planningTool" (toolChange)="setPlanningTool($event)" /> }
      }
    </div>
  `,
  styles: [`
    :host { display: block; min-width: 0; max-width: 100%; }
    .page { min-width: 0; max-width: 100%; }
    h1 { overflow-wrap: anywhere; }
    app-planning, app-investment-insights, app-stock-lab {
      display: block;
      min-width: 0;
      max-width: 100%;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanningHubComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);
  tab = 'path';
  planningTool: PlanningToolId = 'overview';

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const requested = params.get('t');
      if (requested === 'compensation') {
        const queryParams: Record<string, string> = {};
        params.keys.forEach(key => { const value = params.get(key); if (value !== null) queryParams[key] = value; });
        queryParams['t'] = 'pay';
        queryParams['history'] = '1';
        void this.router.navigate(['/recurring'], { queryParams, replaceUrl: true });
        return;
      }
      this.tab = requested === 'growth' || requested === 'stocks' ? requested : 'path';
      const tool = params.get('tool');
      this.planningTool = tool === 'simulation' || tool === 'retirement-target' || tool === 'savings-goal' || tool === 'debt-payoff'
        ? tool
        : 'overview';
      this.cdr.markForCheck();
    });
  }

  setPlanningTool(tool: PlanningToolId): void {
    this.planningTool = tool;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tool: tool === 'overview' ? null : tool },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
