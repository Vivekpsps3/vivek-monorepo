import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ConfirmService,ToastService } from '@vivek/ui';
import { BehaviorSubject, EMPTY, of, Subject, throwError } from 'rxjs';
import { tap } from 'rxjs/operators';
import { FixedExpense,Subscription } from '../models/transaction.model';
import { FinanceService } from '../services/finance.service';
import { isoAddDays } from '../utils/home-summary';
import { BillsComponent } from './bills.component';

describe('BillsComponent editor handoff and source states', () => {
  let harness: RouterTestingHarness;
  let finance: jasmine.SpyObj<FinanceService>;
  let bills: BehaviorSubject<FixedExpense[]>;
  let subscriptions: BehaviorSubject<Subscription[]>;

  const bill: FixedExpense = {
    id: 41, name: 'Rent', category: 'Rent', amount: 1200, frequency: 'monthly',
    start_date: '2026-01-01', due_day: 1, autopay: true, payment_account: 'Checking',
    is_active: true, next_due_date: '2026-11-01', monthly_amount: 1200,
    annual_amount: 14400, created_at: '', updated_at: '',
  };
  const subscription: Subscription = {
    id: 52, name: 'Internet', category: 'Utilities', amount: 60, frequency: 'monthly',
    next_bill_date: '2026-11-15', payment_account: 'Visa', is_active: true,
    next_due_date: '2026-11-15', monthly_amount: 60, annual_amount: 720,
    created_at: '', updated_at: '',
  };

  beforeEach(async () => {
    bills = new BehaviorSubject([bill]);
    subscriptions = new BehaviorSubject([subscription]);
    finance = jasmine.createSpyObj('FinanceService', [
      'getFixedExpenses', 'getSubscriptions', 'getAllTransactions', 'addFixedExpense', 'updateFixedExpense', 'deleteFixedExpense',
      'addSubscription', 'updateSubscription', 'deleteSubscription',
    ], {
      fixedExpenses$: bills.asObservable(),
      subscriptions$: subscriptions.asObservable(),
      dataChanges$: EMPTY,
      sessionToken: 0,
    });
    finance.getFixedExpenses.and.returnValue(of([bill]).pipe(tap(rows => bills.next(rows))));
    finance.getSubscriptions.and.returnValue(of([subscription]).pipe(tap(rows => subscriptions.next(rows))));
    finance.getAllTransactions.and.returnValue(of([]));
    finance.addFixedExpense.and.returnValue(of(bill));
    finance.updateFixedExpense.and.returnValue(of(bill));
    finance.deleteFixedExpense.and.returnValue(of({ ok: true }));
    finance.addSubscription.and.returnValue(of(subscription));
    finance.updateSubscription.and.returnValue(of(subscription));
    finance.deleteSubscription.and.returnValue(of({ ok: true }));

    await TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'finance/bills', component: BillsComponent }]),
        { provide: FinanceService, useValue: finance },
        { provide: ConfirmService, useValue: { ask: () => Promise.resolve(true) } },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error']) },
      ],
    }).compileComponents();
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/finance/bills', BillsComponent);
    await harness.fixture.whenStable();
    harness.detectChanges();
  });

  const click = async (label: string): Promise<void> => {
    const root = harness.routeNativeElement!;
    const button = Array.from(root.querySelectorAll('button'))
      .find(node => (node.textContent || '').trim() === label) as HTMLButtonElement | undefined;
    if (!button) throw new Error(`Expected a rendered “${label}” button.`);
    button.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
  };

  const clickRowAction = async (recordName: string, action: string): Promise<void> => {
    const root = harness.routeNativeElement!;
    const row = Array.from(root.querySelectorAll('tbody tr'))
      .find(node => (node.textContent || '').includes(recordName));
    if (!row) throw new Error(`Expected the “${recordName}” commitment row.`);
    const button = Array.from(row.querySelectorAll('button'))
      .find(node => (node.textContent || '').trim() === action) as HTMLButtonElement | undefined;
    if (!button) throw new Error(`Expected “${action}” in the “${recordName}” row.`);
    button.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
  };

  const dialog = (name: string): HTMLElement => {
    const result = Array.from(harness.routeNativeElement!.querySelectorAll<HTMLElement>('[role="dialog"]'))
      .find(node => node.textContent?.includes(name));
    if (!result) throw new Error(`Expected the “${name}” dialog to be rendered.`);
    return result;
  };

  it('opens the real bill form from Add and the selected row Edit action', async () => {
    await click('Add bill');
    expect(dialog('Add bill').querySelector('input[name="name"]')).not.toBeNull();
    await click('Cancel');
    await clickRowAction('Rent', 'Edit');
    expect(dialog('Edit bill').querySelector<HTMLInputElement>('input[name="name"]')?.value).toBe('Rent');
    expect(finance.getFixedExpenses).toHaveBeenCalled();
  });

  it('keeps an undated inactive commitment visible and preserves sort when filtering', async () => {
    const workspace = harness.routeDebugElement!.componentInstance as BillsComponent;
    const soon = isoAddDays(workspace.today, 2);
    const later = isoAddDays(workspace.today, 4);
    bills.next([
      { ...bill, start_date: soon, next_due_date: soon },
      {
        ...bill, id: 44, name: 'Retired boiler service', is_active: false, next_due_date: null,
        amount: 45, monthly_amount: 45, annual_amount: 540,
      },
    ]);
    subscriptions.next([{ ...subscription, next_bill_date: later, next_due_date: later }]);
    harness.detectChanges();
    const screen = harness.routeNativeElement!;
    const names = () => Array.from(screen.querySelectorAll('tbody th'), row => row.textContent?.replace(/\s+/g, ' ').trim());
    const select = async (name: string, value: string) => {
      const input = screen.querySelector<HTMLSelectElement>(`select[name="${name}"]`)!;
      input.value = value;
      input.dispatchEvent(new Event('change'));
      await harness.fixture.whenStable();
      harness.detectChanges();
    };

    expect(names()).toEqual(['Rent Bill · Rent', 'Internet Subscription · Utilities', 'Retired boiler service Bill · Rent']);
    expect(screen.querySelector('tbody tr:last-child')?.textContent).toContain('Inactive');
    expect(screen.querySelector('.commitment-totals')?.textContent).toContain('1,260.00');

    await select('commitment_order', 'latest');
    await select('commitment_status', 'inactive');
    expect(names()).toEqual(['Retired boiler service Bill · Rent']);

    await select('commitment_type', 'subscription');
    expect(screen.textContent).toContain('Nothing matches these filters');
    await click('Show all');
    expect(names()).toEqual(['Internet Subscription · Utilities', 'Rent Bill · Rent', 'Retired boiler service Bill · Rent']);
    expect(screen.querySelector<HTMLSelectElement>('[name="commitment_order"]')?.value).toBe('latest');
  });

  it('keeps the existing list usable when the ledger fails and ignores the losing read after retry', async () => {
    const losingRead = new Subject<never[]>();
    finance.getAllTransactions.and.returnValues(losingRead, throwError(() => new Error('unavailable')), of([]));
    const workspace = harness.routeDebugElement!.componentInstance as BillsComponent;
    workspace.loadCommitments();
    workspace.loadCommitments();
    losingRead.next([]);
    losingRead.complete();
    harness.detectChanges();

    const screen = harness.routeNativeElement!;
    expect(screen.querySelector('[role="alert"]')?.textContent).toContain('Could not check the ledger');
    expect(screen.querySelector('table')?.textContent).toContain('Rent');
    expect(screen.querySelector('table')?.textContent).not.toContain('Possibly overdue');
    await click('Retry');
    expect(screen.querySelector('[role="alert"]')).toBeNull();
  });
});
