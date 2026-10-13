import { ChangeDetectorRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { RecurringHubComponent, CommitmentRow } from './recurring-hub.component';
import { FinanceService } from '../services/finance.service';
import { FixedExpense, Subscription } from '../models/transaction.model';

describe('RecurringHubComponent', () => {
  let component: RecurringHubComponent;
  let params: BehaviorSubject<any>;
  let router: jasmine.SpyObj<Router>;
  let finance: jasmine.SpyObj<FinanceService>;

  const bill = (overrides: Partial<FixedExpense> = {}): FixedExpense => ({
    id: 1, name: 'Rent', category: 'Rent', amount: 1200, frequency: 'monthly',
    start_date: '2026-01-01', due_day: 1, autopay: true, payment_account: 'Checking',
    is_active: true, next_due_date: '2026-11-01', monthly_amount: 1200,
    annual_amount: 14400, created_at: '', updated_at: '', ...overrides,
  });
  const subscription = (overrides: Partial<Subscription> = {}): Subscription => ({
    id: 2, name: 'Internet', category: 'Utilities', amount: 60, frequency: 'monthly',
    next_bill_date: '2026-11-15', payment_account: 'Visa', is_active: true,
    next_due_date: '2026-11-15', monthly_amount: 60, annual_amount: 720,
    created_at: '', updated_at: '', ...overrides,
  });

  beforeEach(() => {
    params = new BehaviorSubject({ get: (key: string) => ({ t: 'spend' } as Record<string, string>)[key] ?? null, keys: ['t'] });
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    finance = jasmine.createSpyObj('FinanceService', ['getFixedExpenses', 'getSubscriptions'], {
      fixedExpenses$: new BehaviorSubject<FixedExpense[]>([]).asObservable(),
      subscriptions$: new BehaviorSubject<Subscription[]>([]).asObservable(),
    });
    finance.getFixedExpenses.and.returnValue(of([]));
    finance.getSubscriptions.and.returnValue(of([]));
    TestBed.configureTestingModule({
      providers: [
        { provide: ActivatedRoute, useValue: { queryParamMap: params.asObservable() } },
        { provide: Router, useValue: router },
        { provide: FinanceService, useValue: finance },
        { provide: ChangeDetectorRef, useValue: { markForCheck: jasmine.createSpy() } },
      ],
    });
    component = TestBed.runInInjectionContext(() => new RecurringHubComponent());
  });

  it('sorts dated obligations first and keeps undated and inactive records in the owner list', () => {
    component.fixedExpenses = [
      bill({ id: 1, name: 'Rent', next_due_date: '2026-11-10', amount: 1200, monthly_amount: 1200 }),
      bill({ id: 3, name: 'Old gym', is_active: false, next_due_date: null, amount: 20, monthly_amount: 20 }),
    ];
    component.subscriptions = [subscription({ id: 2, next_due_date: '2026-11-05', monthly_amount: 60 })];
    expect(component.rows.map(row => row.name)).toEqual(['Internet', 'Rent', 'Old gym']);
    expect(component.rows[2].date).toBeNull();
    expect(component.rows[0].autopay).toBeNull();
    expect(component.activeMonthlyTotal).toBe(1260);
    expect(component.activeAnnualTotal).toBe(15120);
  });

  it('filters by kind and status without hiding inactive records by default', () => {
    component.fixedExpenses = [bill(), bill({ id: 3, name: 'Old gym', is_active: false, next_due_date: null })];
    component.subscriptions = [subscription()];
    expect(component.filteredRows.length).toBe(3);
    component.typeFilter = 'subscription';
    expect(component.filteredRows.map(row => row.kind)).toEqual(['subscription']);
    component.typeFilter = 'all';
    component.statusFilter = 'inactive';
    expect(component.filteredRows.map(row => row.name)).toEqual(['Old gym']);
  });

  it('hands add, edit, and delete actions to the existing bill or subscription form', () => {
    const billEditor = { openAddModal: jasmine.createSpy(), openEditModal: jasmine.createSpy(), deleteExpense: jasmine.createSpy() };
    const subscriptionEditor = { openAddModal: jasmine.createSpy(), openEditModal: jasmine.createSpy(), deleteSubscription: jasmine.createSpy() };
    (component as any).billEditor = billEditor;
    (component as any).subscriptionEditor = subscriptionEditor;
    component.addBill();
    component.addSubscription();
    const billRow = { ...componentRow('bill', bill()) };
    const subscriptionRow = componentRow('subscription', subscription());
    component.edit(billRow);
    component.edit(subscriptionRow);
    component.remove(billRow);
    component.remove(subscriptionRow);
    expect(billEditor.openAddModal).toHaveBeenCalled();
    expect(subscriptionEditor.openAddModal).toHaveBeenCalled();
    expect(billEditor.openEditModal).toHaveBeenCalledWith(billRow.bill);
    expect(subscriptionEditor.openEditModal).toHaveBeenCalledWith(subscriptionRow.subscription);
    expect(billEditor.deleteExpense).toHaveBeenCalledWith(billRow.bill);
    expect(subscriptionEditor.deleteSubscription).toHaveBeenCalledWith(subscriptionRow.subscription);
  });

  it('redirects old compensation links and retains the selected report range', () => {
    params.next({
      get: (key: string) => ({ t: 'compensation', year: '2025', start: '2025-02-01', end: '2025-09-30' } as Record<string, string>)[key] ?? null,
      keys: ['t', 'year', 'start', 'end'],
    });
    component.ngOnInit();
    expect(router.navigate).toHaveBeenCalledWith(['/recurring'], {
      queryParams: { t: 'pay', year: '2025', start: '2025-02-01', end: '2025-09-30', history: '1' },
      replaceUrl: true,
    });
  });
});

function componentRow(kind: 'bill' | 'subscription', record: FixedExpense | Subscription): CommitmentRow {
  if (kind === 'bill') {
    const item = record as FixedExpense;
    return { id: item.id, kind, name: item.name, category: item.category, date: item.next_due_date, account: item.payment_account || null, autopay: item.autopay, frequency: item.frequency, amount: item.amount, monthlyAmount: item.monthly_amount, active: item.is_active, bill: item };
  }
  const item = record as Subscription;
  return { id: item.id, kind, name: item.name, category: item.category, date: item.next_due_date, account: item.payment_account || null, autopay: null, frequency: item.frequency, amount: item.amount, monthlyAmount: item.monthly_amount, active: item.is_active, subscription: item };
}
