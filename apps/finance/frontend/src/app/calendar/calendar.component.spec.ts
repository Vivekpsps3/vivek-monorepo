import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { CalendarComponent } from './calendar.component';
import { FinanceService } from '../services/finance.service';
import { JobIncome } from '../models/transaction.model';
import { todayIsoDate } from '@vivek/browser';

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

describe('Calendar layout (F13)', () => {
  const stripJoiner = (text: string | null) => (text || '').replace(/\u2060/g, '');

  async function makeFixture(opts: { withActivity?: boolean } = {}) {
    const withActivity = opts.withActivity !== false;
    const job = {
      id: 1, employer: 'Northwind', pay_frequency: 'annual', base_pay: 60000,
      annual_bonus: 0, annual_equity: 0, annual_other: 0, annual_taxes: 0, annual_deductions: 0,
      effective_date: '2026-01-01', is_active: true, payday_frequency: 'monthly', first_pay_date: '2026-10-01',
    } as unknown as JobIncome;
    const finance = {
      transactions$: new BehaviorSubject(withActivity ? [{
        id: 1, date: '2026-10-20', type: 'expense', category: 'Groceries',
        description: 'Corner market', merchant: 'Corner market', amount: 45.67, kind: 'purchase',
      }] : []),
      jobIncomes$: new BehaviorSubject([job]),
      fixedExpenses$: new BehaviorSubject([]),
      // $40, not $45: a bill within $1 of the day's $45.67 purchase would be
      // matched as already posted by unmatchedScheduledExpenses and vanish.
      subscriptions$: new BehaviorSubject(withActivity ? [{
        id: 1, name: 'Streaming', category: 'Entertainment', amount: 40, frequency: 'monthly',
        next_bill_date: '2026-10-20', is_active: true,
      }] : []),
      getTransactions: jasmine.createSpy('getTransactions').and.returnValue(of([])),
    } as unknown as FinanceService;
    await TestBed.configureTestingModule({
      imports: [CalendarComponent],
      providers: [{ provide: FinanceService, useValue: finance }, provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(CalendarComponent);
    fixture.componentInstance.currentDate = new Date(2026, 9, 1);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function cell(fixture: ComponentFixture<CalendarComponent>, iso: string): HTMLButtonElement {
    return fixture.nativeElement.querySelector(`button[data-date="${iso}"]`) as HTMLButtonElement;
  }

  it('labels a spend day exactly and shows the whole-dollar net plus a scheduled dot', async () => {
    const fixture = await makeFixture();
    const day = cell(fixture, '2026-10-20');
    expect(day.getAttribute('aria-label')).toBe('Tuesday, Oct 20: spent $45.67, 1 scheduled bill');
    expect(stripJoiner(day.textContent)).toContain('−$46');
    expect(day.querySelector('.cal-scheduled-dot')).not.toBeNull();
    fixture.destroy();
  });

  it('labels income and quiet days exactly', async () => {
    const fixture = await makeFixture();
    expect(cell(fixture, '2026-10-01').getAttribute('aria-label')).toBe('Thursday, Oct 1: income $5,000.00');
    expect(cell(fixture, '2026-10-02').getAttribute('aria-label')).toBe('Friday, Oct 2: no activity');
    fixture.destroy();
  });

  it('marks today as selected with aria-current when it is chosen', async () => {
    const fixture = await makeFixture();
    fixture.componentInstance.currentDate = new Date();
    fixture.componentInstance.generateCalendar();
    fixture.detectChanges();
    const day = cell(fixture, todayIsoDate());
    expect(day.classList.contains('today')).toBeTrue();
    day.click();
    fixture.detectChanges();
    expect(day.classList.contains('selected')).toBeTrue();
    expect(day.getAttribute('aria-current')).toBe('date');
    expect(day.getAttribute('aria-selected')).toBe('true');
    fixture.destroy();
  });

  it('wraps header and weeks in rows and keeps exactly one tab stop', async () => {
    const fixture = await makeFixture();
    const rows = fixture.nativeElement.querySelectorAll('[role="row"]');
    expect(rows.length).toBe(1 + fixture.componentInstance.weeks.length);
    fixture.nativeElement.querySelectorAll('[role="gridcell"]').forEach((el: Element) => {
      expect(el.closest('[role="row"]')).not.toBeNull();
    });
    const stops = fixture.nativeElement.querySelectorAll('.day-btn[tabindex="0"]');
    expect(stops.length).toBe(1);
    fixture.destroy();
  });

  it('moves by date with the arrow keys and clamps at the month edges', async () => {
    const fixture = await makeFixture();
    const press = (iso: string, key: string) => {
      cell(fixture, iso).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      fixture.detectChanges();
    };
    fixture.componentInstance.focusDate('2026-10-01');
    fixture.detectChanges();
    press('2026-10-01', 'ArrowRight');
    expect(document.activeElement).toBe(cell(fixture, '2026-10-02'));
    fixture.componentInstance.focusDate('2026-10-01');
    press('2026-10-01', 'ArrowDown');
    expect(document.activeElement).toBe(cell(fixture, '2026-10-08'));
    fixture.componentInstance.focusDate('2026-10-01');
    press('2026-10-01', 'ArrowLeft');
    expect(document.activeElement).toBe(cell(fixture, '2026-10-01'));
    press('2026-10-01', 'End');
    expect(document.activeElement).toBe(cell(fixture, '2026-10-03'));
    fixture.componentInstance.focusDate('2026-10-08');
    press('2026-10-08', 'Home');
    expect(document.activeElement).toBe(cell(fixture, '2026-10-04'));
    fixture.destroy();
  });

  it('shows Posted then Scheduled in the day detail with Not posted badges', async () => {
    const fixture = await makeFixture();
    cell(fixture, '2026-10-20').click();
    fixture.detectChanges();
    const detail = fixture.nativeElement.querySelector('.day-detail') as HTMLElement;
    expect(detail.querySelector('#day-detail-heading')?.textContent?.trim()).toBe('Tuesday, Oct 20');
    const sections = Array.from(detail.querySelectorAll('.day-detail__section')).map(el => el.textContent?.trim());
    expect(sections).toEqual(['Posted', 'Scheduled']);
    expect(detail.textContent).toContain('Not posted');
    expect(detail.textContent).not.toContain('Source net for day');
    fixture.destroy();
  });

  it('gives an empty day its dated empty copy and CTA', async () => {
    const fixture = await makeFixture();
    cell(fixture, '2026-10-02').click();
    fixture.detectChanges();
    const detail = fixture.nativeElement.querySelector('.day-detail') as HTMLElement;
    expect(detail.querySelector('.day-detail__empty')?.textContent?.trim()).toBe('Nothing on Oct 2.');
    const cta = Array.from(detail.querySelectorAll('a')).find(a => a.textContent?.includes('Add transaction'));
    expect(cta?.textContent?.trim()).toBe('Add transaction on Oct 2');
    fixture.destroy();
  });

  it('moves focus to the detail heading below desktop widths only', async () => {
    const fixture = await makeFixture();
    const scrollSpy = spyOn(HTMLElement.prototype, 'scrollIntoView');
    const day = fixture.componentInstance.daysInMonth.find(d => d.date === '2026-10-20')!;
    spyOn(window, 'matchMedia').and.callFake((query: string) => ({
      matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {},
    }) as unknown as MediaQueryList);
    fixture.componentInstance.selectDay(day);
    fixture.detectChanges();
    expect(document.activeElement?.id).toBe('day-detail-heading');
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    (window.matchMedia as jasmine.Spy).and.callFake((query: string) => ({
      matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {},
    }) as unknown as MediaQueryList);
    scrollSpy.calls.reset();
    fixture.componentInstance.selectDay(day);
    fixture.detectChanges();
    expect(document.activeElement?.id).not.toBe('day-detail-heading');
    expect(scrollSpy).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('moves the undated-estimate note below the grid in sentence copy', async () => {
    const fixture = await makeFixture();
    fixture.componentInstance.cashflowSummary = {
      income_occurrences: [{ date: null, kind: 'estimate', amount: 1200 }],
    } as unknown as typeof fixture.componentInstance.cashflowSummary;
    fixture.detectChanges();
    const note = fixture.nativeElement.querySelector('.calendar-undated-note') as HTMLElement;
    expect(note?.textContent?.trim()).toBe("$1,200.00 of estimated pay has no date, so it isn't on the calendar.");
    const grid = fixture.nativeElement.querySelector('.calendar-grid') as HTMLElement;
    expect(grid.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(fixture.nativeElement.textContent).not.toContain('Undated job estimates');
    fixture.destroy();
  });

  it('names the month in the empty highest-purchases state', async () => {
    const fixture = await makeFixture({ withActivity: false });
    expect(fixture.nativeElement.textContent).toContain('No purchases in October.');
    fixture.destroy();
  });
});
