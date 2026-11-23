import { Component, Input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { VaultService } from '../crypto/vault.service';
import { FixedExpensesComponent } from '../fixed-expenses/fixed-expenses.component';
import { IncomeComponent } from '../income/income.component';
import type { FixedExpense, JobIncome, NetWorth, Subscription, Transaction } from '../models/transaction.model';
import { MC_TOOL_ID } from '../models/planning.model';
import type { PlanningRun } from '../models/planning.model';
import { clearPlanningDrafts, readSimulationDraft, writeSimulationDraft } from '../planning/planning-session';
import { FinanceService } from '../services/finance.service';
import { PlanningService } from '../services/planning.service';
import { SubscriptionsComponent } from '../subscriptions/subscriptions.component';
import { PlanningStudyComponent } from './planning-study.component';

@Component({
  selector: 'app-fixed-expenses',
  standalone: true,
  template: `@if (open) { <div role="dialog" aria-label="Edit bill">Edit bill</div> }`,
})
class BillEditorStub {
  open = false;
  openEditModal(): void { this.open = true; }
  closeModal(): void { this.open = false; }
}

@Component({
  selector: 'app-subscriptions',
  standalone: true,
  template: `@if (open) { <div role="dialog" aria-label="Edit subscription">Edit subscription</div> }`,
})
class SubscriptionEditorStub {
  open = false;
  openEditModal(): void { this.open = true; }
  closeModal(): void { this.open = false; }
}

@Component({
  selector: 'app-income',
  standalone: true,
  template: `@if (open) { <div role="dialog" aria-label="Edit job">Edit job</div> }`,
})
class JobEditorStub {
  @Input() dialogOnly = false;
  open = false;
  openEditModal(): void { this.open = true; }
  closeModal(): void { this.open = false; }
}

describe('PlanningStudyComponent', () => {
  const rent = {
    id: 80, name: 'Harbor rent', category: 'Rent', amount: 1200, frequency: 'monthly',
    start_date: '2026-01-05', due_day: 5, autopay: true, is_active: true,
  } as FixedExpense;
  const gas = {
    id: 81, name: 'Pier gas', category: 'Utilities', amount: 55, frequency: 'monthly',
    start_date: '2026-01-12', due_day: 12, autopay: false, is_active: true,
  } as FixedExpense;
  const archive = {
    id: 80, name: 'Maritime archives', category: 'Subscriptions', amount: 90, frequency: 'quarterly',
    next_bill_date: '2026-10-17', is_active: true,
  } as Subscription;
  const northwind = {
    id: 66, employer: 'Northwind', pay_frequency: 'annual', base_pay: 60000,
    payday_frequency: 'monthly', first_pay_date: '2026-10-01', effective_date: '2026-01-01', is_active: true,
    annual_bonus: 0, annual_equity: 0, annual_other: 0, annual_taxes: 0, annual_deductions: 0,
    taxes_per_period: 0, deductions_per_period: 0,
  } as JobIncome;
  const posted = { id: 82, date: '2026-10-06', type: 'expense', amount: 1200 } as Transaction;
  const deposit = { id: 83, date: '2026-10-01', type: 'income', amount: 5000, category: 'Pay' } as Transaction;
  const worth = { other_assets: 1200, portfolio: 50, liabilities: 0, total_assets: 1250, total: 1250 } as NetWorth;

  afterEach(() => clearPlanningDrafts());

  async function setup(options?: { fail?: boolean }) {
    const fixedExpenses$ = new BehaviorSubject<FixedExpense[]>([rent, gas]);
    const subscriptions$ = new BehaviorSubject<Subscription[]>([archive]);
    const jobIncomes$ = new BehaviorSubject<JobIncome[]>([northwind]);
    const netWorth$ = new BehaviorSubject<NetWorth | null>(worth);
    const unlocked$ = new BehaviorSubject(true);
    const runs = new Subject<PlanningRun>();
    let unlocked = true;
    let session = 1;
    const fail = options?.fail ?? false;
    const planning = {
      createRun: jasmine.createSpy('createRun').and.returnValue(runs.asObservable()),
    };
    const finance = {
      fixedExpenses$,
      subscriptions$,
      jobIncomes$,
      netWorth$,
      get sessionToken() { return session; },
      getFixedExpenses: () => fail ? throwError(() => new Error('down')) : of([rent, gas]),
      getSubscriptions: () => of([archive]),
      getJobIncomes: () => of([northwind]),
      getNetWorth: () => of(worth),
      getAllTransactions: () => of([posted, deposit]),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'finance/have', component: PlanningStudyComponent }]),
        { provide: FinanceService, useValue: finance },
        { provide: PlanningService, useValue: planning },
        { provide: VaultService, useValue: { unlocked$, get isUnlocked() { return unlocked; } } },
      ],
    });
    TestBed.overrideComponent(PlanningStudyComponent, {
      remove: { imports: [FixedExpensesComponent, SubscriptionsComponent, IncomeComponent] },
      add: { imports: [BillEditorStub, SubscriptionEditorStub, JobEditorStub] },
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/finance/have?month=2026-10', PlanningStudyComponent);
    harness.detectChanges();
    return {
      harness,
      host: harness.routeNativeElement as HTMLElement,
      planning,
      runs,
      fixedExpenses$,
      lock: () => { unlocked = false; unlocked$.next(false); harness.detectChanges(); },
      changeOwner: () => { session = 2; },
    };
  }

  it('labels a due bill and opens the bill editor without showing other amounts', async () => {
    const { host, harness } = await setup();
    expect(host.textContent).toContain('Harbor rent');
    expect(host.textContent).toContain('Hidden');
    expect(host.textContent).not.toContain('$');
    expect(host.textContent).toContain('does not keep another ledger');

    (host.querySelector('[data-bill="bill:80:2026-10-05"]') as HTMLButtonElement).click();
    harness.detectChanges();
    const actual = host.querySelector('[data-bill-actual]');
    const projected = host.querySelector('[data-bill-projected]');
    expect(actual?.textContent).toContain('Actual');
    expect(actual?.textContent).toContain('Posted payment');
    expect(actual?.textContent).toContain('1,200.00');
    expect(projected?.textContent).toContain('Projected');
    expect(projected?.textContent).toContain('Scheduled commitment');
    expect(projected?.textContent).toContain('1,200.00');
    expect(host.textContent).toContain('Edit bill');
    expect(host.querySelector('[data-bill="bill:81:2026-10-12"]')?.textContent).toContain('Hidden');
    expect(host.querySelector('[data-bill="bill:81:2026-10-12"]')?.textContent).not.toContain('$');
    expect(host.querySelector('[data-pay="66"]')?.textContent).toContain('Hidden');
  });

  it('labels recorded deposits and the projected paycheck in the pay editor', async () => {
    const { host, harness } = await setup();
    (host.querySelector('[data-pay="66"]') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(host.querySelector('[data-pay-actual]')?.textContent).toContain('Actual');
    expect(host.querySelector('[data-pay-actual]')?.textContent).toContain('Recorded deposits');
    expect(host.querySelector('[data-pay-actual]')?.textContent).toContain('5,000.00');
    expect(host.querySelector('[data-pay-projected]')?.textContent).toContain('Projected');
    expect(host.querySelector('[data-pay-projected]')?.textContent).toContain('Scheduled paycheck');
    expect(host.querySelector('[data-pay-projected]')?.textContent).toContain('5,000.00');
    expect(host.textContent).toContain('Edit job');
    expect(host.querySelector('[data-bill-actual]')).toBeNull();
  });

  it('labels current net worth and the planning median from one run', async () => {
    const { host, harness, planning, runs } = await setup();
    (host.querySelector('[data-model="simulation"]') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(planning.createRun).toHaveBeenCalledOnceWith(jasmine.objectContaining({
      tool_id: MC_TOOL_ID, horizon_years: 30, n_paths: 500, seed: 1,
    }));
    expect(host.querySelector('[data-model-actual]')?.textContent).toContain('Actual');
    expect(host.querySelector('[data-model-actual]')?.textContent).toContain('1,250.00');
    expect(host.querySelector('[data-model-projected]')?.textContent).toContain('Running the planning model');
    expect(host.querySelector('[data-model-projected]')?.textContent).not.toContain('$');
    runs.next({ result_summary: { terminal_p50: 4000 } } as PlanningRun);
    harness.detectChanges();
    expect(host.querySelector('[data-model-projected]')?.textContent).toContain('Projected');
    expect(host.querySelector('[data-model-projected]')?.textContent).toContain('4,000.00');
    expect(host.querySelector('[data-model-projected]')?.textContent).toContain('does not change your current balances');
    expect(planning.createRun).toHaveBeenCalledTimes(1);
  });

  it('keeps the month when bills fail to load', async () => {
    const { host } = await setup({ fail: true });
    expect((host.querySelector('input[type="month"]') as HTMLInputElement).value).toBe('2026-10');
    expect(host.textContent).toContain("Couldn't load bills and pay.");
    expect(host.textContent).not.toContain('$');
  });

  it('keeps a simulation draft when the run fails', async () => {
    writeSimulationDraft({
      horizonYears: 18, nPaths: 400, seed: 7, spendingMode: 'manual', annualSpending: 1000,
    });
    const { host, harness, planning } = await setup();
    planning.createRun.and.returnValue(throwError(() => new Error('down')));
    (host.querySelector('[data-model="simulation"]') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(planning.createRun).toHaveBeenCalledWith(jasmine.objectContaining({
      horizon_years: 18, n_paths: 400, seed: 7,
      overrides: jasmine.objectContaining({ spending_mode: 'manual', annual_spending: 1000 }),
    }));
    expect(readSimulationDraft()?.horizonYears).toBe(18);
    expect(host.textContent).toContain("Couldn't project this model.");
    expect(host.querySelector('[data-model-projected]')?.textContent).not.toContain('$');
    expect((host.querySelector('input[type="month"]') as HTMLInputElement).value).toBe('2026-10');
  });

  it('drops a late projection after the vault locks', async () => {
    const { host, harness, runs, lock } = await setup();
    (host.querySelector('[data-model="simulation"]') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(host.textContent).toContain('Harbor rent');
    lock();
    runs.next({ result_summary: { terminal_p50: 888888.88 } } as PlanningRun);
    harness.detectChanges();
    expect(host.textContent).not.toContain('Harbor rent');
    expect(host.textContent).not.toContain('Northwind');
    expect(host.textContent).not.toContain('888,888.88');
    expect(host.textContent).not.toContain('$');
    expect(host.textContent).toContain('Finance is locked. Bills and pay stay hidden.');
  });

  it('drops a publication after the owner session changes', async () => {
    const { host, harness, fixedExpenses$, changeOwner } = await setup();
    expect(host.textContent).toContain('Harbor rent');
    changeOwner();
    fixedExpenses$.next([{ ...rent, name: 'Secret bill' }]);
    harness.detectChanges();
    expect(host.textContent).not.toContain('Secret bill');
    expect(host.textContent).not.toContain('Harbor rent');
    expect(host.textContent).toContain('Finance is locked. Bills and pay stay hidden.');
  });
});
