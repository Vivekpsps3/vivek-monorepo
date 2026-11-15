import { ComponentFixture,TestBed } from '@angular/core/testing';
import { ActivatedRoute,convertToParamMap,Router } from '@angular/router';
import { BehaviorSubject,of } from 'rxjs';
import { enrichJobIncome } from '../crypto/client-finance';
import { JobIncome } from '../models/transaction.model';
import { FinanceService } from '../services/finance.service';
import { CompensationReportComponent } from './compensation-report.component';

describe('CompensationReportComponent', () => {
  let fixture: ComponentFixture<CompensationReportComponent>;
  let queryParams: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let finance: jasmine.SpyObj<FinanceService>;
  let router: jasmine.SpyObj<Router>;
  const job = enrichJobIncome({
    id: 1, employer: 'Acme', base_pay: 36525, pay_frequency: 'annual',
    effective_date: '2026-01-01', end_date: '2026-01-20', is_active: false,
    promotions: [{ date: '2026-01-11', annual_base_pay: 73050 }],
    compensation_payments: [{ date: '2026-01-31', kind: 'bonus', amount: 500 }],
  } as JobIncome);

  beforeEach(async () => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date('2026-10-09T12:00:00Z'));
    queryParams = new BehaviorSubject(convertToParamMap({ start: '2026-01-01', end: '2026-01-31' }));
    finance = jasmine.createSpyObj('FinanceService', ['getJobIncomes'], { jobIncomes$: new BehaviorSubject<JobIncome[]>([job]).asObservable() });
    finance.getJobIncomes.and.returnValue(of([job]));
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    await TestBed.configureTestingModule({
      imports: [CompensationReportComponent],
      providers: [
        { provide: FinanceService, useValue: finance },
        { provide: ActivatedRoute, useValue: { queryParamMap: queryParams.asObservable() } },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(CompensationReportComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => jasmine.clock().uninstall());

  it('reads and validates year and custom range parameters from the route', () => {
    queryParams.next(convertToParamMap({ year: '2025', start: '', end: '' }));
    fixture.detectChanges();
    expect(fixture.componentInstance.selectedYear).toBe('2025');
    expect(fixture.componentInstance.start).toBe('2025-01-01');
    expect(fixture.componentInstance.end).toBe('2025-12-31');

    queryParams.next(convertToParamMap({ start: '2026-02-01', end: '2026-01-31' }));
    fixture.detectChanges();
    expect(fixture.componentInstance.rangeError).toContain('Through date');
    expect(fixture.componentInstance.rows).toEqual([]);
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('Through date');
  });

});
