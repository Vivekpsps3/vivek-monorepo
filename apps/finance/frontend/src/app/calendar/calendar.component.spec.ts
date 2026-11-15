import { ComponentFixture,TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject,of } from 'rxjs';
import { JobIncome } from '../models/transaction.model';
import { FinanceService } from '../services/finance.service';
import { CalendarComponent } from './calendar.component';

describe('CalendarComponent Activity handoff', () => {

  it('renders a configured paycheck on its date and lists it in the selected day sources', async () => {
    const job: JobIncome = {
      id: 1,
      employer: 'Northwind',
      pay_frequency: 'annual',
      base_pay: 52000,
      annual_bonus: 0,
      annual_equity: 0,
      annual_other: 0,
      annual_taxes: 0,
      annual_deductions: 0,
      effective_date: '2026-01-01',
      is_active: true,
      payday_frequency: 'weekly',
      first_pay_date: '2026-01-08',
    } as JobIncome;
    const finance = {
      transactions$: new BehaviorSubject([]),
      jobIncomes$: new BehaviorSubject([job]),
      fixedExpenses$: new BehaviorSubject([]),
      subscriptions$: new BehaviorSubject([]),
      getTransactions: jasmine.createSpy('getTransactions').and.returnValue(of([])),
    } as unknown as FinanceService;
    await TestBed.configureTestingModule({
      imports: [CalendarComponent],
      providers: [{ provide: FinanceService, useValue: finance }, provideRouter([])],
    }).compileComponents();
    const fixture: ComponentFixture<CalendarComponent> = TestBed.createComponent(CalendarComponent);
    fixture.componentInstance.currentDate = new Date(2026, 0, 1);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Income sources contributing to this month');
    const payday = fixture.nativeElement.querySelector('button[data-date="2026-01-08"]') as HTMLButtonElement;
    expect(payday.classList.contains('has-tx')).toBeTrue();
    // The money pipe puts a word joiner after the sign; strip it to read the amount.
    expect((payday.textContent || '').replace(/\u2060/g, '')).toContain('+$1,000');
    payday.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Projected paycheck');
    expect(fixture.nativeElement.textContent).toContain('Northwind');
    fixture.destroy();
  });
});
