import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { ConfirmService, ToastService, failureCopy } from '@vivek/ui';
import { EncryptedStoreService } from '../crypto/encrypted-store.service';
import { FinanceService } from '../services/finance.service';
import { PlanningService } from '../services/planning.service';
import { PlanningComponent } from './planning.component';
import { dateWarnings, planningFactsCopy } from './planning-copy';

/**
 * Synthetic records only. Counts on screen are the preview contract:
 * the template does not scan the store again.
 */
describe('Planning current facts (FIN-03)', () => {
  let encStore: jasmine.SpyObj<EncryptedStoreService>;

  function shown(value: string | null | undefined): string {
    return (value ?? '').replaceAll('\u2060', '').replace(/\s+/g, ' ').trim();
  }

  beforeEach(async () => {
    encStore = jasmine.createSpyObj<EncryptedStoreService>('EncryptedStoreService', [
      'getNetWorth', 'getJobIncomes', 'getFixedExpenses', 'getSubscriptions',
      'getTransactions', 'getImportReceipts', 'getBankAccounts',
      'getAssets', 'getLiabilities', 'getHoldings',
      'listPlanningProfiles', 'savePlanningProfile', 'deletePlanningProfile',
    ]);
    encStore.getNetWorth.and.resolveTo({ total: 0, portfolio: 0, liabilities: 0 } as never);
    encStore.getJobIncomes.and.resolveTo([]);
    encStore.getFixedExpenses.and.resolveTo([]);
    encStore.getSubscriptions.and.resolveTo([]);
    encStore.getTransactions.and.resolveTo([]);
    encStore.getImportReceipts.and.resolveTo([]);
    encStore.getBankAccounts.and.resolveTo([]);
    encStore.getAssets.and.resolveTo([]);
    encStore.getLiabilities.and.resolveTo([]);
    encStore.getHoldings.and.resolveTo([]);
    encStore.listPlanningProfiles.and.resolveTo([]);

    await TestBed.configureTestingModule({
      imports: [PlanningComponent],
      providers: [
        provideRouter([]),
        PlanningService,
        { provide: EncryptedStoreService, useValue: encStore },
        { provide: FinanceService, useValue: { dataChanges$: new Subject() } },
        { provide: ConfirmService, useValue: { ask: () => Promise.resolve(true) } },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error', 'info']) },
      ],
    }).compileComponents();
  });

  async function open(): Promise<ComponentFixture<PlanningComponent>> {
    const fixture = TestBed.createComponent(PlanningComponent);
    fixture.componentRef.setInput('tool', 'simulation');
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function factsCard(fixture: ComponentFixture<PlanningComponent>): HTMLElement | null {
    const cards = fixture.nativeElement.querySelectorAll('ui-card');
    for (const card of Array.from(cards) as HTMLElement[]) {
      if (card.querySelector('.ui-card__title')?.textContent?.trim() === 'Your current facts') return card;
    }
    return null;
  }

  function expectFactsMatchPreview(fixture: ComponentFixture<PlanningComponent>): void {
    const card = factsCard(fixture);
    expect(card).not.toBeNull();
    const copy = planningFactsCopy(fixture.componentInstance.inputs);
    const lines = card!.querySelectorAll('.planning-facts-grid > div');
    expect(lines.length).toBe(4);
    expect(shown(lines[0].querySelector('span')?.textContent)).toBe(copy.netWorth.label);
    expect(shown(lines[0].querySelector('small')?.textContent)).toBe(copy.netWorth.small);
    expect(shown(lines[1].querySelector('small')?.textContent)).toBe(copy.portfolio.small);
    expect(shown(lines[2].querySelector('span')?.textContent)).toBe(copy.takeHome.label);
    expect(shown(lines[2].querySelector('strong')?.textContent)).toBe(shown(copy.takeHome.amount));
    expect(shown(lines[2].querySelector('small')?.textContent)).toBe(copy.takeHome.small);
    expect(shown(lines[3].querySelector('small')?.textContent)).toBe(copy.scheduled.small);
    const warnings = [...card!.querySelectorAll('.mc-help')].map(node => shown(node.textContent));
    for (const warning of dateWarnings(fixture.componentInstance.inputs)) {
      expect(warnings).toContain(`${warning.text} ${warning.linkText}`);
    }
    const page = shown(fixture.nativeElement.textContent);
    expect(page).not.toContain('balance-sheet');
    expect(page).not.toContain('active-job-income');
    expect(page).not.toContain('active-recurring-schedules');
    expect(page).not.toContain('income_is_net');
  }

  it('shows the empty state when no source record participates', async () => {
    const fixture = await open();
    expect(fixture.componentInstance.inputs?.asset_count).toBe(0);
    expect(fixture.componentInstance.inputs?.active_job_count).toBe(0);
    expect(fixture.componentInstance.inputs?.income_is_net).toBeFalse();
    expect(shown(fixture.nativeElement.textContent)).toContain('Planning uses your balances, pay and bills');
    expect(factsCard(fixture)).toBeNull();
    fixture.destroy();
  });

  it('shows a zero-value asset and ignores an inactive job paycheck', async () => {
    encStore.getAssets.and.resolveTo([{ id: 1, current_value: 0, as_of_date: '2020-01-01' }] as never);
    encStore.getJobIncomes.and.resolveTo([
      { monthly_net: 9000, annual_taxes: 1000, annual_deductions: 0, is_active: false, effective_date: '2000-01-01' },
    ] as never);
    const fixture = await open();
    expect(fixture.componentInstance.inputs?.asset_count).toBe(1);
    expect(fixture.componentInstance.inputs?.active_job_count).toBe(0);
    expect(fixture.componentInstance.inputs?.avg_monthly_income).toBe(0);
    expect(fixture.componentInstance.inputs?.income_is_net).toBeFalse();
    expectFactsMatchPreview(fixture);
    const page = shown(fixture.nativeElement.textContent);
    expect(page).toContain('(1 asset, 0 debts)');
    expect(page).toContain('(0 active jobs)');
    expect(page).toContain('$0.00 a year before taxes');
    expect(page).toContain('Take-home: not set');
    expect(page).not.toContain('$108,000.00');
    fixture.destroy();
  });

  it('pluralizes many source records, warns on undated prices, and keeps a saved-input failure in the card', async () => {
    encStore.getNetWorth.and.resolveTo({ total: 50, portfolio: 0, liabilities: 0 } as never);
    encStore.getAssets.and.resolveTo([
      { id: 1, current_value: 0, as_of_date: '2020-01-01' },
      { id: 2, current_value: 10, as_of_date: null },
    ] as never);
    encStore.getLiabilities.and.resolveTo([
      { id: 1, balance_owed: 0, as_of_date: '2020-01-01' },
      { id: 2, balance_owed: 5, as_of_date: null },
      { id: 3, balance_owed: 8, as_of_date: '2021-01-01' },
    ] as never);
    encStore.getHoldings.and.resolveTo([
      { id: 1, lifecycle_status: 'active', shares: 0, quote_date: null, position_as_of: null },
      { id: 2, lifecycle_status: 'active', shares: 1, quote_date: null, position_as_of: null },
      { id: 3, lifecycle_status: 'inactive', shares: 9, quote_date: null, position_as_of: null },
      { id: 4, lifecycle_status: 'staged', shares: 4, quote_date: '2020-01-01', position_as_of: '2020-01-01' },
    ] as never);
    encStore.getJobIncomes.and.resolveTo([
      { monthly_net: 0, annual_taxes: 0, annual_deductions: 0, is_active: true, effective_date: '2000-01-01' },
      { monthly_net: 1000, annual_taxes: 0, annual_deductions: 0, is_active: true, effective_date: '2000-01-01' },
      { monthly_net: 9000, annual_taxes: 1000, is_active: false, effective_date: '2000-01-01' },
    ] as never);
    encStore.getFixedExpenses.and.resolveTo([
      { annual_amount: 0, is_active: true },
      { annual_amount: 120, is_active: true },
      { annual_amount: 500, is_active: false },
    ] as never);
    encStore.getSubscriptions.and.resolveTo([
      { annual_amount: 0, is_active: true },
      { annual_amount: 15, is_active: true },
      { annual_amount: 20, is_active: true },
      { annual_amount: 99, is_active: false },
    ] as never);
    encStore.savePlanningProfile.and.rejectWith(new Error('balance-sheet'));

    const fixture = await open();
    expectFactsMatchPreview(fixture);
    const page = shown(fixture.nativeElement.textContent);
    expect(page).toContain('(2 assets, 3 debts)');
    expect(page).toContain('(2 holdings)');
    expect(page).toContain('(2 active jobs)');
    expect(page).toContain('(2 bills, 3 subscriptions)');
    expect(page).toContain('2 holdings have no price date.');
    expect(page).toContain('Check prices');
    expect(page).toContain('$12,000.00 a year before taxes');
    expect(page).not.toContain('Take-home $');

    fixture.componentInstance.savedInputName = 'Baseline';
    fixture.componentInstance.saveSavedInputs();
    await fixture.whenStable();
    fixture.detectChanges();
    const alert = fixture.nativeElement.querySelector('[data-error-summary]');
    expect(shown(alert?.textContent)).toContain(failureCopy('save', 'these inputs'));
    expect(shown(alert?.textContent)).not.toContain('balance-sheet');
    expect(fixture.componentInstance.error).toBeNull();
    fixture.destroy();
  });

  it('labels one taxed job as take-home and keeps the singular undated-price warning', async () => {
    encStore.getAssets.and.resolveTo([{ id: 1, current_value: 0, as_of_date: '2020-01-01' }] as never);
    encStore.getHoldings.and.resolveTo([
      { id: 1, lifecycle_status: 'active', shares: 1, quote_date: null, position_as_of: null },
    ] as never);
    encStore.getJobIncomes.and.resolveTo([
      { monthly_net: 4000, annual_taxes: 12000, annual_deductions: 0, is_active: true, effective_date: '2000-01-01' },
    ] as never);
    encStore.getFixedExpenses.and.resolveTo([{ annual_amount: 100, is_active: true }] as never);
    const fixture = await open();
    expectFactsMatchPreview(fixture);
    const page = shown(fixture.nativeElement.textContent);
    expect(page).toContain('(1 asset, 0 debts)');
    expect(page).toContain('(1 holding)');
    expect(page).toContain('(1 active job)');
    expect(page).toContain('(1 bill, 0 subscriptions)');
    expect(page).toContain('1 holding has no price date.');
    expect(page).toContain('Check prices');
    expect(page).toContain('Take-home');
    expect(page).toContain('$48,000.00 a year');
    expect(page).not.toContain('before taxes');
    expect(page).not.toContain('Take-home: not set');
    fixture.destroy();
  });
});
