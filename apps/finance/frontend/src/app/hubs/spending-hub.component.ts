import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { TransactionsComponent } from '../transactions/transactions.component';
import { CalendarComponent } from '../calendar/calendar.component';

export type SpendingTab = 'activity' | 'calendar' | 'imports';
export type SpendingActivityView = 'all' | 'spending' | 'income';

export interface SpendingHubRouteState {
  tab: SpendingTab;
  activityView: SpendingActivityView;
  queryParams: Record<string, string | null> | null;
}

const obsoleteReviewParams = ['review', 'periodStart', 'periodEnd', 'priorStart', 'priorEnd', 'group', 'dimension'];

export function normalizeSpendingHubRoute(params: ParamMap): SpendingHubRouteState {
  const requested = params.get('t') || '';
  const legacyView = requested === 'pay' ? 'income' : requested === 'spend' ? 'spending' : null;
  const isReviewLink = requested === 'review';
  const view = params.get('v');
  const activityView: SpendingActivityView = legacyView || (view === 'income' || view === 'spending' ? view : 'all');
  const tab: SpendingTab = requested === 'calendar' || requested === 'imports' ? requested : 'activity';
  const hasObsoleteReviewParams = obsoleteReviewParams.some(key => params.has(key));
  const shouldNormalize = isReviewLink || !!legacyView || hasObsoleteReviewParams;

  if (!shouldNormalize) return { tab, activityView, queryParams: null };

  const queryParams: Record<string, string | null> = {};
  if (isReviewLink || legacyView) {
    queryParams['t'] = 'activity';
    queryParams['v'] = legacyView || activityView;
  }
  if ((isReviewLink || requested === 'activity' || !!legacyView)
    && !/^\d{4}-\d{2}$/.test(params.get('month') || '')
    && !/^\d{4}-\d{2}-\d{2}$/.test(params.get('date') || '')
    && !/^\d{4}-\d{2}-\d{2}$/.test(params.get('from') || '')
    && !/^\d{4}-\d{2}-\d{2}$/.test(params.get('through') || '')) {
    const periodStart = params.get('periodStart') || '';
    const periodEnd = params.get('periodEnd') || '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(periodStart) && /^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) {
      queryParams['from'] = periodStart;
      queryParams['through'] = periodEnd;
      queryParams['month'] = null;
    }
  }
  for (const key of obsoleteReviewParams) queryParams[key] = null;
  return { tab, activityView, queryParams };
}

@Component({
  selector: 'app-spending-hub',
  standalone: true,
  imports: [RouterLink, TransactionsComponent, CalendarComponent],
  template: `
    <div class="page">
      <h1>Spending</h1>
      <nav class="hub-tabs" aria-label="Spending sections">
        <a [routerLink]="[]" [queryParams]="{ t: 'activity', v: activityView }" [class.on]="tab === 'activity'">Activity</a>
        <a [routerLink]="[]" [queryParams]="{ t: 'calendar' }" [class.on]="tab === 'calendar'">Calendar</a>
        <a [routerLink]="[]" [queryParams]="{ t: 'imports' }" [class.on]="tab === 'imports'">Imports</a>
      </nav>
      @switch (tab) {
        @case ('calendar') { <app-calendar [embedded]="true" /> }
        @case ('imports') { <app-transactions [embedded]="true" [importsOnly]="true" /> }
        @case ('activity') {
          <div class="activity-switch" role="group" aria-label="Activity filter">
            <button type="button" [attr.aria-pressed]="activityView === 'all'" (click)="setActivityView('all')">All</button>
            <button type="button" [attr.aria-pressed]="activityView === 'spending'" (click)="setActivityView('spending')">Spending</button>
            <button type="button" [attr.aria-pressed]="activityView === 'income'" (click)="setActivityView('income')">Income</button>
          </div>
          <app-transactions [embedded]="true" [typeFilter]="activityTypeFilter" />
        }
      }
    </div>
  `,
  styles: [`
    .activity-switch {
      display: inline-flex;
      gap: 2px;
      margin: 0 0 var(--space-3);
      padding: 3px;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: var(--surface-muted, var(--card-bg));
    }
    .activity-switch button {
      min-height: 2.25rem;
      padding: 0 var(--space-3);
      border: 0;
      border-radius: calc(var(--radius-md) - 3px);
      background: transparent;
      color: var(--text-secondary);
      font: inherit;
      font-size: var(--text-sm);
      font-weight: 600;
      cursor: pointer;
    }
    .activity-switch button[aria-pressed="true"] {
      background: var(--card-bg);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
    }
    .activity-switch button:hover { color: var(--text-primary); }
    .activity-switch button:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
      position: relative;
      z-index: 1;
    }
    @media (max-width: 420px) {
      .activity-switch { display: flex; width: 100%; }
      .activity-switch button { flex: 1; padding-inline: var(--space-2); }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpendingHubComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);
  tab: SpendingTab = 'activity';
  activityView: SpendingActivityView = 'all';

  get activityTypeFilter(): 'all' | 'income' | 'expense' {
    return this.activityView === 'income' ? 'income' : this.activityView === 'spending' ? 'expense' : 'all';
  }

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const state = normalizeSpendingHubRoute(params);
      this.tab = state.tab;
      this.activityView = state.activityView;
      if (state.queryParams) {
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: state.queryParams,
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      }
      this.cdr.markForCheck();
    });
  }

  setActivityView(view: 'all' | 'spending' | 'income'): void {
    this.activityView = view;
    void this.router.navigate([], { relativeTo: this.route, queryParams: { t: 'activity', v: view }, queryParamsHandling: 'merge' });
    this.cdr.markForCheck();
  }
}
