import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CompensationReportComponent } from '../income/compensation-report.component';
import { IncomeComponent } from '../income/income.component';
import { RecurringHubComponent } from './recurring-hub.component';

describe('RecurringHubComponent', () => {
  it('keeps Pay and legacy compensation links with their chosen report range', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'finance/recurring', component: RecurringHubComponent }])],
    });
    TestBed.overrideComponent(RecurringHubComponent, {
      remove: { imports: [IncomeComponent, CompensationReportComponent] },
      add: { schemas: [NO_ERRORS_SCHEMA] },
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/finance/recurring', RecurringHubComponent);
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelector('h1')?.textContent?.trim()).toBe('Pay');
    expect(harness.routeNativeElement!.querySelector('app-income')).not.toBeNull();
    expect(harness.routeNativeElement!.querySelector('details')?.open).toBeFalse();

    await harness.navigateByUrl('/finance/recurring?t=compensation&year=2025&start=2025-02-01&end=2025-09-30');
    await harness.fixture.whenStable();
    harness.detectChanges();
    const url = TestBed.inject(Router).parseUrl(TestBed.inject(Router).url);
    expect(url.queryParams).toEqual({ t: 'pay', year: '2025', start: '2025-02-01', end: '2025-09-30', history: '1' });
    expect(harness.routeNativeElement!.querySelector('details')?.open).toBeTrue();
  });
});
