import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { TransactionsComponent } from '../transactions/transactions.component';
import { CalendarComponent } from '../calendar/calendar.component';

export type SpendingTab = 'activity' | 'calendar';
export type SpendingActivityView = 'all' | 'spending' | 'income';

export interface SpendingHubRouteState {
  tab: SpendingTab;
  activityView: SpendingActivityView;
  receiptsOpen: boolean;
  queryParams: Record<string, string | null> | null;
}

const obsoleteReviewParams = ['review', 'periodStart', 'periodEnd', 'priorStart', 'priorEnd', 'group', 'dimension'];

export function normalizeSpendingHubRoute(params: ParamMap): SpendingHubRouteState {
  const requested = params.get('t') || '';
  const legacyView = requested === 'pay' ? 'income' : requested === 'spend' ? 'spending' : null;
  const isReviewLink = requested === 'review';
  const isImportsLink = requested === 'imports';
  const view = params.get('v');
  const activityView: SpendingActivityView = legacyView || (view === 'income' || view === 'spending' ? view : 'all');
  const tab: SpendingTab = requested === 'calendar' ? 'calendar' : 'activity';
  const receiptsOpen = params.get('receipts') === '1' || isImportsLink;
  const hasObsoleteReviewParams = obsoleteReviewParams.some(key => params.has(key));
  const shouldNormalize = isReviewLink || !!legacyView || hasObsoleteReviewParams || isImportsLink;

  if (!shouldNormalize) return { tab, activityView, receiptsOpen, queryParams: null };

  const queryParams: Record<string, string | null> = {};
  if (isReviewLink || legacyView) {
    queryParams['t'] = 'activity';
    queryParams['v'] = legacyView || activityView;
  }
  if (isImportsLink) {
    queryParams['t'] = 'activity';
    queryParams['receipts'] = '1';
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
  return { tab, activityView, receiptsOpen, queryParams };
}

@Component({
  selector: 'app-spending-hub',
  standalone: true,
  imports: [RouterLink, TransactionsComponent, CalendarComponent],
  template: `
    <div class="page">
      <nav class="hub-tabs" aria-label="Spending sections">
        <a [routerLink]="[]" [queryParams]="{ t: 'activity', v: activityView }" [class.on]="tab === 'activity'">Activity</a>
        <a [routerLink]="[]" [queryParams]="{ t: 'calendar' }" [class.on]="tab === 'calendar'">Calendar</a>
      </nav>
      @switch (tab) {
        @case ('calendar') { <app-calendar [embedded]="true" /> }
        @case ('activity') {
          <app-transactions [embedded]="true" [typeFilter]="activityTypeFilter" [receiptsOpen]="receiptsOpen" />
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
  receiptsOpen = false;

  get activityTypeFilter(): 'all' | 'income' | 'expense' {
    return this.activityView === 'income' ? 'income' : this.activityView === 'spending' ? 'expense' : 'all';
  }

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const state = normalizeSpendingHubRoute(params);
      this.tab = state.tab;
      this.activityView = state.activityView;
      this.receiptsOpen = state.receiptsOpen;
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
