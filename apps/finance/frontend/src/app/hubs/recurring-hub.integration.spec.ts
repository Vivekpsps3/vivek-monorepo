import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BehaviorSubject, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { RecurringHubComponent } from './recurring-hub.component';
import { FinanceService } from '../services/finance.service';
import { ConfirmService } from '@vivek/ui';
import { ToastService } from '@vivek/ui';
import { FixedExpense, Subscription } from '../models/transaction.model';

describe('RecurringHubComponent editor handoff', () => {
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
      'getFixedExpenses', 'getSubscriptions', 'addFixedExpense', 'updateFixedExpense', 'deleteFixedExpense',
      'addSubscription', 'updateSubscription', 'deleteSubscription',
    ], {
      fixedExpenses$: bills.asObservable(),
      subscriptions$: subscriptions.asObservable(),
    });
    finance.getFixedExpenses.and.returnValue(of([bill]).pipe(tap(rows => bills.next(rows))));
    finance.getSubscriptions.and.returnValue(of([subscription]).pipe(tap(rows => subscriptions.next(rows))));
    finance.addFixedExpense.and.returnValue(of(bill));
    finance.updateFixedExpense.and.returnValue(of(bill));
    finance.deleteFixedExpense.and.returnValue(of({ ok: true }));
    finance.addSubscription.and.returnValue(of(subscription));
    finance.updateSubscription.and.returnValue(of(subscription));
    finance.deleteSubscription.and.returnValue(of({ ok: true }));

    await TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'recurring', component: RecurringHubComponent }]),
        { provide: FinanceService, useValue: finance },
        { provide: ConfirmService, useValue: { ask: () => Promise.resolve(true) } },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error']) },
      ],
    }).compileComponents();
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/recurring?t=spend', RecurringHubComponent);
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
    const row = Array.from(root.querySelectorAll('tr, .commitment-card'))
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

  it('opens the real subscription form from Add and the selected row Edit action', async () => {
    await click('Add subscription');
    expect(dialog('Add subscription').querySelector('input[name="name"]')).not.toBeNull();
    await click('Cancel');
    await clickRowAction('Internet', 'Edit');
    expect(dialog('Edit subscription').querySelector<HTMLInputElement>('input[name="name"]')?.value).toBe('Internet');
    expect(finance.getSubscriptions).toHaveBeenCalled();
  });
});
