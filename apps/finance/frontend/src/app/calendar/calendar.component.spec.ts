import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { CalendarComponent } from './calendar.component';
import { FinanceService } from '../services/finance.service';
import { JobIncome } from '../models/transaction.model';

describe('CalendarComponent Activity handoff', () => {
  it('opens the selected transaction with its month, date, account, category, merchant, and edit id', () => {
    const component = new CalendarComponent({} as any, { markForCheck: () => {} } as any);
    component.currentDate = new Date(2026, 5, 1);
    component.transactions = [{
      id: 5, date: '2026-06-03', type: 'expense', category: ' Groceries ', amount: 18,
      merchant: ' Green Market ', bank_account_key: 'account-1', kind: 'purchase',
    } as any];

    expect(component.transactionActivityQuery(5)).toEqual({
      t: 'activity', v: 'all', month: '2026-06', date: '2026-06-03', account: 'account-1',
      category: 'groceries', merchant: 'green market', edit: 5,
    });
    component.ngOnDestroy();
  });

  it('keeps unassigned accounts explicit for exact calendar transaction edits', () => {
    const component = new CalendarComponent({} as any, { markForCheck: () => {} } as any);
    component.currentDate = new Date(2026, 5, 1);
    component.transactions = [{
      id: 6, date: '2026-06-04', type: 'expense', category: 'Food', amount: 9,
      merchant: '', bank_account_key: null, kind: 'purchase',
    } as any];
    expect(component.transactionActivityQuery(6)).toEqual(jasmine.objectContaining({
      account: '__unassigned_account__', category: 'food', merchant: 'unassigned merchant', edit: 6,
    }));
    component.ngOnDestroy();
  });

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
    const payday = fixture.nativeElement.querySelector('button[aria-label^="2026-01-08"]') as HTMLButtonElement;
    expect(payday.classList.contains('has-tx')).toBeTrue();
    expect(payday.textContent).toContain('1,000');
    payday.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Projected paycheck');
    expect(fixture.nativeElement.textContent).toContain('Northwind');
    fixture.destroy();
  });
});
