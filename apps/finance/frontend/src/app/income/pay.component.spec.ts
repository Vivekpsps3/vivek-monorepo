import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { SESSION_CONTEXT } from '@vivek/ui';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { computeCashflowSummary } from '../crypto/client-finance';
import { FinanceService } from '../services/finance.service';
import { CompensationReportComponent } from './compensation-report.component';
import { IncomeComponent } from './income.component';
import { PayComponent } from './pay.component';

describe('Pay monthly income', () => {
  it('ignores a losing month response, retries an error, and clears on session invalidation', () => {
    const params = new BehaviorSubject(convertToParamMap({ month: '2026-01' }));
    const cleared = new Subject<void>();
    const january = new Subject<ReturnType<typeof computeCashflowSummary>>();
    const february = new Subject<ReturnType<typeof computeCashflowSummary>>();
    const retry = new Subject<ReturnType<typeof computeCashflowSummary>>();
    const finance = {
      getJobIncomes: () => of([]),
      dataChanges$: new Subject(),
      readIncomeSummary: jasmine.createSpy('readIncomeSummary').and.returnValues(january, february, retry),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: FinanceService, useValue: finance },
        { provide: ActivatedRoute, useValue: { queryParamMap: params } },
        { provide: Router, useValue: {} },
        { provide: SESSION_CONTEXT, useValue: { cleared$: cleared } },
      ],
    });
    TestBed.overrideComponent(PayComponent, {
      remove: { imports: [IncomeComponent, CompensationReportComponent] },
      add: { schemas: [NO_ERRORS_SCHEMA] },
    });
    const fixture = TestBed.createComponent(PayComponent);
    fixture.detectChanges();

    params.next(convertToParamMap({ month: '2026-02' }));
    january.next(computeCashflowSummary('2026-01-01', '2026-01-31', [], [], [], []));
    expect(fixture.componentInstance.summary()).toBeNull();
    expect(finance.readIncomeSummary.calls.allArgs()).toEqual([
      ['2026-01-01', '2026-01-31'],
      ['2026-02-01', '2026-02-28'],
    ]);

    february.error(new Error('Synthetic vault read failed'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Monthly income is unavailable');
    fixture.nativeElement.querySelector('ui-button button').click();
    expect(finance.readIncomeSummary.calls.mostRecent().args).toEqual(['2026-02-01', '2026-02-28']);
    const summary = computeCashflowSummary('2026-02-01', '2026-02-28', [], [], [], []);
    retry.next(summary);
    expect(fixture.componentInstance.summary()).toBe(summary);

    cleared.next();
    retry.next(summary);
    fixture.detectChanges();
    expect(fixture.componentInstance.summary()).toBeNull();
    expect(fixture.nativeElement.querySelector('.income-totals')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-income')).toBeNull();
  });
});
