import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { FinanceService } from '../services/finance.service';
import { JobIncome } from '../models/transaction.model';
import { compensationByEmployer, EmployerCompensation, isValidIsoDate } from '../utils/job-compensation.util';
import { todayIsoDate } from '@vivek/browser';
import { UiCardComponent, UiDataTableComponent, UiEmptyStateComponent } from '@vivek/ui';
import { MoneyPipe } from '@vivek/ui';

@Component({
  selector: 'app-compensation-report',
  standalone: true,
  imports: [
    MoneyPipe, CommonModule, FormsModule, UiCardComponent, UiDataTableComponent, UiEmptyStateComponent],
  template: `
    <ui-card [headingLevel]="2" title="Total compensation by employer">

      <p class="muted">Gross pay and compensation from job records. Share sale proceeds and remaining value are shown separately from gross compensation.</p>
      <div class="form-row">
        <label class="form-group">
          <span>Calendar year</span>
          <select name="compensation_year" [(ngModel)]="selectedYear" (ngModelChange)="selectYear($event)">
            <option value="all">All history</option>
            @for (year of yearOptions; track year) {
              <option [value]="year">{{ year }}</option>
            }
            @if (selectedYear === 'custom') {
              <option value="custom">Custom dates</option>
            } @else if (selectedYear !== 'all' && !yearOptions.includes(selectedYear)) {
              <option [value]="selectedYear">{{ selectedYear }}</option>
            }
          </select>
        </label>
        <label class="form-group">
          <span>From</span>
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
        <p class="stat-display money">{{ total | money }}</p>
        <p class="muted">{{ start || 'All recorded history' }} → {{ end }}{{ isProjection ? ' · Includes projected pay' : '' }}</p>
        <ui-data-table ariaLabel="Total compensation by employer" [compact]="true">
          <thead><tr><th>Employer</th><th>Base pay</th><th>Cash bonuses</th><th>Equity</th><th>Stock comp this range</th><th>Other</th><th>Employee ESPP contributions</th><th>Sale cash through date</th><th>Unsold stock value at date</th><th>Total compensation</th></tr></thead>
          <tbody>
            @for (row of rows; track row.employer) {
              <tr>
                <td><strong>{{ row.employer }}</strong><span class="muted job-count">{{ row.jobs }} {{ row.jobs === 1 ? 'job' : 'jobs' }}</span></td>
                <td class="money">{{ row.base | money }}</td>
                <td class="money">{{ row.bonus | money }}</td>
                <td class="money">{{ row.equity | money }}</td>
                <td class="money">{{ row.stock_compensation | money }}</td>
                <td class="money">{{ row.other | money }}</td>
                <td class="money">{{ row.stockEmployeeContributions | money }}</td>
                <td class="money">{{ row.stockCashProceeds | money }}</td>
                <td class="money">{{ row.stockRemainingValue | money }}</td>
                <td class="money"><strong>{{ row.gross | money }}</strong></td>
              </tr>
            }
          </tbody>
        </ui-data-table>
      } @else {
        <ui-empty-state message="Add or edit a job above to include it in compensation history." />
      }
    </ui-card>
  `,
  styles: [`
    :host { display: block; min-width: 0; max-width: 100%; }
    :host ::ng-deep .ui-card,
    :host ::ng-deep .ui-data-table { min-width: 0; max-width: 100%; }
    :host ::ng-deep .ui-data-table td { overflow-wrap: anywhere; }
    p, .stat-display { overflow-wrap: anywhere; max-width: 100%; }
    .job-count { display: block; }
    .stat-display { margin-bottom: 0; }
    .form-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr)); gap: var(--space-4); min-width: 0; }
    .form-group, input, select { min-width: 0; max-width: 100%; box-sizing: border-box; }
    .form-group { display: flex; flex-direction: column; gap: 0.35rem; }
    input, select { min-height: 44px; }
    @media (max-width: 768px) {
      .form-row { grid-template-columns: 1fr; }
      :host ::ng-deep .ui-data-table tbody td { grid-column: 1 / -1 !important; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompensationReportComponent implements OnInit, OnDestroy {
  private finance = inject(FinanceService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
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
    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const year = params.get('year');
      const start = params.get('start') ?? params.get('compensation_start');
      const end = params.get('end') ?? params.get('compensation_end');
      if (year && /^(?!0000)\d{4}$/.test(year) && !start && !end) {
        this.applyYear(year);
        this.selectedYear = year;
      } else {
        this.selectedYear = year === 'all' || year === 'custom' ? year : (start || end ? 'custom' : 'all');
        this.start = start || '';
        this.end = end || todayIsoDate();
      }
      this.refresh();
    });
  }

  selectYear(value: string): void {
    this.selectedYear = value;
    if (value !== 'custom') this.applyYear(value);
    this.refresh();
    this.syncRangeToUrl();
  }

  customRangeChanged(): void {
    this.selectedYear = 'custom';
    this.refresh();
    this.syncRangeToUrl();
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

  private applyYear(year: string): void {
    const today = todayIsoDate();
    this.start = year === 'all' ? '' : `${year}-01-01`;
    this.end = year === 'all' || year === today.slice(0, 4) ? today : `${year}-12-31`;
  }

  private syncRangeToUrl(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        year: this.selectedYear === 'all' ? null : this.selectedYear,
        start: this.selectedYear === 'custom' ? this.start || null : null,
        end: this.selectedYear === 'custom' ? this.end : null,
        compensation_start: null,
        compensation_end: null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
