import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, catchError, combineLatest, distinctUntilChanged, filter, map, merge, of, startWith, switchMap, takeUntil } from 'rxjs';
import { todayIsoDate } from '@vivek/browser';
import { AppDatePipe, MoneyPipe, SESSION_CONTEXT, UiButtonComponent, UiCardComponent, UiDataTableComponent, UiPageHeaderComponent, isReturnDate } from '@vivek/ui';
import { monthEnd } from '../crypto/client-finance';
import { bindLockSnapshots } from '../crypto/lock-finance';
import type { CashflowSummary } from '../models/transaction.model';
import { FinanceService } from '../services/finance.service';
import { incomeRowSubtitle, incomeRowTitle } from '../utils/income-row-copy';
import { CompensationReportComponent } from './compensation-report.component';
import { IncomeComponent } from './income.component';

@Component({
  selector: 'app-pay',
  standalone: true,
  imports: [
    AppDatePipe, MoneyPipe, UiButtonComponent, UiCardComponent, UiDataTableComponent,
    UiPageHeaderComponent, CompensationReportComponent, IncomeComponent,
  ],
  templateUrl: './pay.component.html',
  styleUrl: './pay.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PayComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly finance = inject(FinanceService);
  private readonly destroy = inject(DestroyRef);
  private readonly session = inject(SESSION_CONTEXT, { optional: true });
  private readonly retry$ = new Subject<void>();
  private readonly retryJobs$ = new Subject<void>();
  private readonly invalidated$ = new Subject<void>();
  private readonly currentMonth = todayIsoDate().slice(0, 7);

  readonly active = signal(true);
  readonly month = signal(this.currentMonth);
  readonly summary = signal<CashflowSummary | null>(null);
  readonly incomeError = signal(false);
  readonly jobsState = signal<'loading' | 'ready' | 'error'>('loading');
  readonly historyOpen = signal(false);
  readonly sourceTitle = incomeRowTitle;
  readonly sourceDetail = incomeRowSubtitle;

  ngOnInit(): void {
    this.destroy.onDestroy(bindLockSnapshots(() => this.invalidate()));
    this.session?.cleared$?.pipe(takeUntilDestroyed(this.destroy)).subscribe(() => this.invalidate());
    const month$ = this.route.queryParamMap.pipe(
      map(params => {
        const month = params.get('month');
        return month && isReturnDate(month + '-01') ? month : this.currentMonth;
      }),
      distinctUntilChanged(),
    );
    const changes$ = this.finance.dataChanges$.pipe(
      filter(change => change.collections.includes('transactions') || change.collections.includes('job_incomes')),
    );
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroy)).subscribe(params => {
      this.historyOpen.set(params.get('history') === '1');
    });
    this.retryJobs$.pipe(
      startWith(undefined),
      switchMap(() => {
        this.jobsState.set('loading');
        return this.finance.getJobIncomes().pipe(
          map(() => 'ready' as const),
          catchError(() => of('error' as const)),
        );
      }),
      takeUntil(this.invalidated$),
      takeUntilDestroyed(this.destroy),
    ).subscribe(state => this.jobsState.set(state));
    combineLatest([month$, merge(this.retry$, changes$).pipe(startWith(undefined))]).pipe(
      switchMap(([month]) => {
        this.month.set(month);
        this.summary.set(null);
        this.incomeError.set(false);
        return this.finance.readIncomeSummary(month + '-01', monthEnd(month)).pipe(
          catchError(() => {
            this.incomeError.set(true);
            return of(null);
          }),
        );
      }),
      takeUntil(this.invalidated$),
      takeUntilDestroyed(this.destroy),
    ).subscribe(summary => this.summary.set(summary));
  }

  changeMonth(input: HTMLInputElement): void {
    const value = input.value;
    if (!isReturnDate(value + '-01')) {
      input.value = this.month();
      return;
    }
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { month: value === this.currentMonth ? null : value },
      queryParamsHandling: 'merge',
    });
  }

  retry(): void {
    this.retry$.next();
  }

  retryJobs(): void {
    this.retryJobs$.next();
  }

  historyToggled(open: boolean): void {
    if (!this.active() || open === this.historyOpen()) return;
    this.historyOpen.set(open);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { history: open ? '1' : null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private invalidate(): void {
    this.active.set(false);
    this.summary.set(null);
    this.invalidated$.next();
  }
}
