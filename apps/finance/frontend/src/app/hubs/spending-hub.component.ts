import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { TransactionsComponent } from '../transactions/transactions.component';
import { CalendarComponent } from '../calendar/calendar.component';
import { UiPageHeaderComponent, isReturnDate } from '@vivek/ui';

export type SpendingTab = 'activity' | 'calendar';
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
  const tab: SpendingTab = requested === 'calendar' ? 'calendar' : 'activity';
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
  imports: [TransactionsComponent, CalendarComponent, UiPageHeaderComponent],
  template: `
    <div class="page">
      <ui-page-header
        [title]="tab === 'calendar' ? 'Calendar' : 'Activity'"
        [concealTitle]="true"
        backLabel="Back to Pixels day"
        [backLink]="tab === 'activity' ? pixelsSource : undefined"
        [backSource]="pixelsSource"
      />
      @switch (tab) {
        @case ('calendar') { <app-calendar [embedded]="true" /> }
        @case ('activity') {
          <app-transactions [embedded]="true" [typeFilter]="activityTypeFilter" />
        }
      }
    </div>
  `,
  styles: [`
    :host { display: block; min-width: 0; max-width: 100%; }
    h1 { margin: 0; }
    app-transactions, app-calendar { display: block; min-width: 0; max-width: 100%; }
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
  pixelsSource: string | undefined;

  get activityTypeFilter(): 'all' | 'income' | 'expense' {
    return this.activityView === 'income' ? 'income' : this.activityView === 'spending' ? 'expense' : 'all';
  }

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const state = normalizeSpendingHubRoute(params);
      this.tab = state.tab;
      this.activityView = state.activityView;
      const day = params.get('pixelsDay') || '';
      this.pixelsSource = isReturnDate(day) ? `/pixels?year=${day.slice(0, 4)}&day=${day}` : undefined;
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
}
