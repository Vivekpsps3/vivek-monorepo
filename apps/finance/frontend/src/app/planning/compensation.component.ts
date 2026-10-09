import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { FinanceService } from '../services/finance.service';
import { IncomeComponent } from '../income/income.component';
import { JobIncome } from '../models/transaction.model';
import { compensationByEmployer, EmployerCompensation, isValidIsoDate } from '../utils/job-compensation.util';
import { todayIsoDate } from '../utils/date.util';
import { UiCardComponent, UiDataTableComponent, UiEmptyStateComponent } from '../shared/ui';

@Component({
  selector: 'app-compensation',
  standalone: true,
  imports: [CommonModule, FormsModule, IncomeComponent, UiCardComponent, UiDataTableComponent, UiEmptyStateComponent],
  template: `
    <ui-card title="Total compensation by employer">
      <p>Gross compensation from your recorded jobs, including past employers. Base pay and recurring annual estimates are prorated by employment dates and promotions; dated payments count once on their dates.</p>
      <div class="form-row">
        <label class="form-group">
          <span>Calendar year</span>
          <select name="compensation_year" [(ngModel)]="selectedYear" (ngModelChange)="selectYear($event)">
            <option value="all">All history</option>
            @for (year of yearOptions; track year) {
              <option [value]="year">{{ year }}</option>
            }
            @if (selectedYear === 'custom') { <option value="custom">Custom dates</option> }
          </select>
        </label>
        <label class="form-group">
          <span>From (blank for all history)</span>
          <input name="compensation_start" type="date" [(ngModel)]="start" (ngModelChange)="customRangeChanged()" />
        </label>
        <label class="form-group">
          <span>Through</span>
          <input name="compensation_end" type="date" [(ngModel)]="end" (ngModelChange)="customRangeChanged()" required />
        </label>
      </div>
      @if (rangeError) {
        <p role="alert">{{ rangeError }}</p>
      } @else if (rows.length) {
        <p class="stat-display money">{{ total | currency:'USD':'symbol':'1.2-2' }}</p>
        <p class="muted">{{ start || 'All recorded history' }} → {{ end }}{{ isProjection ? ' · Includes projected pay' : '' }}. Estimated gross compensation; not a payroll ledger.</p>
        <ui-data-table ariaLabel="Total compensation by employer">
          <thead><tr><th>Employer</th><th>Base pay</th><th>Cash bonuses</th><th>Equity</th><th>Stock comp this range</th><th>Other</th><th>Sale cash through date</th><th>Unsold stock value at date</th><th>Total compensation</th></tr></thead>
          <tbody>
            @for (row of rows; track row.employer) {
              <tr>
                <td><strong>{{ row.employer }}</strong><span class="muted job-count">{{ row.jobs }} {{ row.jobs === 1 ? 'job' : 'jobs' }}</span></td>
                <td class="money">{{ row.base | currency:'USD':'symbol':'1.2-2' }}</td>
                <td class="money">{{ row.bonus | currency:'USD':'symbol':'1.2-2' }}</td>
                <td class="money">{{ row.equity | currency:'USD':'symbol':'1.2-2' }}</td>
                <td class="money">{{ row.stock_compensation | currency:'USD':'symbol':'1.2-2' }}</td>
                <td class="money">{{ row.other | currency:'USD':'symbol':'1.2-2' }}</td>
                <td class="money">{{ row.stockCashProceeds | currency:'USD':'symbol':'1.2-2' }}</td>
                <td class="money">{{ row.stockRemainingValue | currency:'USD':'symbol':'1.2-2' }}</td>
                <td class="money"><strong>{{ row.gross | currency:'USD':'symbol':'1.2-2' }}</strong></td>
              </tr>
            }
          </tbody>
        </ui-data-table>
      } @else {
        <ui-empty-state message="Add a job below to track compensation by employer." />
      }
      <p class="muted">Annual pay uses the same daily estimate as cashflow. Enter dated payments only when they are additional to annual estimates. Stock compensation includes grant value and gains in the grant year; later years count only gains or losses. Sold shares use recorded proceeds, while unsold shares use the latest manual price on or before the selected date (or grant price until then). The sale-cash and unsold-share columns show cumulative values through that date. Stock values do not change recurring pay, retirement income, or net worth.</p>
    </ui-card>
    <app-income [embedded]="true" [compensationTracking]="true" />
  `,
  styles: [`:host { display: grid; gap: var(--space-6); } .job-count { display: block; } .stat-display { margin-bottom: 0; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompensationComponent implements OnInit, OnDestroy {
  private finance = inject(FinanceService);
  private cdr = inject(ChangeDetectorRef);
  private destroy$ = new Subject<void>();
  incomes: JobIncome[] = [];
  start = '';
  end = todayIsoDate();
  rows: EmployerCompensation[] = [];
  rangeError = '';
  total = 0;
  selectedYear = 'all';
  yearOptions: string[] = [];
  get isProjection(): boolean { return this.end > todayIsoDate(); }

  ngOnInit(): void {
    this.finance.jobIncomes$.pipe(takeUntil(this.destroy$)).subscribe(rows => {
      this.incomes = rows;
      this.yearOptions = this.buildYearOptions(rows);
      this.refresh();
    });
  }

  selectYear(value: string): void {
    if (value === 'all') {
      this.start = '';
      this.end = todayIsoDate();
    } else if (value !== 'custom') {
      this.start = `${value}-01-01`;
      this.end = value === todayIsoDate().slice(0, 4) ? todayIsoDate() : `${value}-12-31`;
    }
    this.refresh();
  }

  customRangeChanged(): void {
    this.selectedYear = 'custom';
    this.refresh();
  }

  refresh(): void {
    this.rangeError = !isValidIsoDate(this.end) || (this.start && !isValidIsoDate(this.start))
      ? 'Choose valid dates.'
      : this.start && this.end < this.start ? 'Through date must be on or after From date.' : '';
    const earliest = this.incomes.map(row => row.effective_date).sort()[0] || this.end;
    this.rows = this.rangeError ? [] : compensationByEmployer(this.incomes, this.start || earliest, this.end);
    this.total = this.rows.reduce((sum, row) => sum + row.gross, 0);
    this.cdr.markForCheck();
  }

  private buildYearOptions(rows: JobIncome[]): string[] {
    const recordedDates = rows.flatMap(row => [
      row.effective_date,
      ...(row.stock_grants || []).map(grant => grant.date),
      ...(row.compensation_payments || []).map(payment => payment.date),
    ]).filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date));
    const firstYear = Math.min(Number(todayIsoDate().slice(0, 4)), ...recordedDates.map(date => Number(date.slice(0, 4))));
    const currentYear = Number(todayIsoDate().slice(0, 4));
    return Array.from({ length: Math.max(1, currentYear - firstYear + 1) }, (_, index) => String(currentYear - index));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
