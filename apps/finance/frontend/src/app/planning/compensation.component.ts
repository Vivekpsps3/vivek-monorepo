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
          <span>From (blank for all history)</span>
          <input name="compensation_start" type="date" [(ngModel)]="start" (ngModelChange)="refresh()" />
        </label>
        <label class="form-group">
          <span>Through</span>
          <input name="compensation_end" type="date" [(ngModel)]="end" (ngModelChange)="refresh()" required />
        </label>
      </div>
      @if (rangeError) {
        <p role="alert">{{ rangeError }}</p>
      } @else if (rows.length) {
        <p class="stat-display money">{{ total | currency:'USD':'symbol':'1.2-2' }}</p>
        <p class="muted">{{ start || 'All recorded history' }} → {{ end }}{{ isProjection ? ' · Includes projected pay' : '' }}. Estimated gross compensation; not a payroll ledger.</p>
        <ui-data-table ariaLabel="Total compensation by employer">
          <thead><tr><th>Employer</th><th>Base pay</th><th>Bonuses</th><th>Equity</th><th>Other</th><th>Total compensation</th></tr></thead>
          <tbody>
            @for (row of rows; track row.employer) {
              <tr>
                <td><strong>{{ row.employer }}</strong><span class="muted job-count">{{ row.jobs }} {{ row.jobs === 1 ? 'job' : 'jobs' }}</span></td>
                <td class="money">{{ row.base | currency:'USD':'symbol':'1.2-2' }}</td>
                <td class="money">{{ row.bonus | currency:'USD':'symbol':'1.2-2' }}</td>
                <td class="money">{{ row.equity | currency:'USD':'symbol':'1.2-2' }}</td>
                <td class="money">{{ row.other | currency:'USD':'symbol':'1.2-2' }}</td>
                <td class="money"><strong>{{ row.gross | currency:'USD':'symbol':'1.2-2' }}</strong></td>
              </tr>
            }
          </tbody>
        </ui-data-table>
      } @else {
        <ui-empty-state message="Add a job below to track compensation by employer." />
      }
      <p class="muted">Annual pay is divided by 365.25 days, matching cashflow estimates. Dated payments should be additional to annual estimates. Totals include inactive jobs and combine employer names ignoring case and surrounding spaces. This does not change net worth.</p>
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
  get isProjection(): boolean { return this.end > todayIsoDate(); }

  ngOnInit(): void {
    this.finance.jobIncomes$.pipe(takeUntil(this.destroy$)).subscribe(rows => {
      this.incomes = rows;
      this.refresh();
    });
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

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
