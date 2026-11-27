import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ConfirmService, ToastService } from '@vivek/ui';
import { Subject } from 'rxjs';
import { EncryptedStoreService } from '../crypto/encrypted-store.service';
import { FinanceService } from '../services/finance.service';
import { PlanningService } from '../services/planning.service';
import { clearPlanningDrafts } from './planning-session';
import { PlanningComponent } from './planning.component';

describe('Planning retirement readiness', () => {
  let encStore: jasmine.SpyObj<EncryptedStoreService>;

  beforeEach(async () => {
    clearPlanningDrafts();
    encStore = jasmine.createSpyObj<EncryptedStoreService>('EncryptedStoreService', [
      'getNetWorth', 'getJobIncomes', 'getFixedExpenses', 'getSubscriptions',
      'getTransactions', 'getImportReceipts', 'getBankAccounts',
      'getAssets', 'getLiabilities', 'getHoldings',
      'listPlanningProfiles', 'savePlanningProfile', 'deletePlanningProfile',
    ]);
    encStore.getNetWorth.and.resolveTo({ total: 2800, portfolio: 300, liabilities: 0 } as never);
    encStore.getJobIncomes.and.resolveTo([]);
    encStore.getFixedExpenses.and.resolveTo([]);
    encStore.getSubscriptions.and.resolveTo([]);
    encStore.getTransactions.and.resolveTo([]);
    encStore.getImportReceipts.and.resolveTo([]);
    encStore.getBankAccounts.and.resolveTo([]);
    encStore.getAssets.and.resolveTo([{ id: 1, current_value: 2500, as_of_date: '2026-10-01' }] as never);
    encStore.getLiabilities.and.resolveTo([]);
    encStore.getHoldings.and.resolveTo([{
      id: 10, lifecycle_status: 'active', shares: 3, current_price: 100,
      quote_date: '2026-10-01', position_as_of: '2026-10-01',
    }] as never);
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

  afterEach(() => clearPlanningDrafts());

  async function open(tool: 'retirement-target' | 'simulation' | 'savings-goal' | 'debt-payoff'): Promise<ComponentFixture<PlanningComponent>> {
    const fixture = TestBed.createComponent(PlanningComponent);
    fixture.componentRef.setInput('tool', tool);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function text(fixture: ComponentFixture<PlanningComponent>): string {
    return (fixture.nativeElement.textContent ?? '').replaceAll('\u2060', '').replace(/\s+/g, ' ');
  }

  it('leads Retirement with a spending prompt and does not project a missing baseline as zero', async () => {
    const fixture = await open('retirement-target');
    const root = fixture.nativeElement as HTMLElement;
    const page = text(fixture);
    expect(page).toContain('Yearly spending is not recorded');
    expect(page).not.toContain('FI target');
    expect(page).not.toContain('Portfolio gap');
    const basis = root.querySelector('[aria-label="Spending basis"]');
    const extra = root.querySelector('input[name="extraAnnualExpenses"]');
    const index = root.querySelector('app-planning-tool-index');
    expect(basis).not.toBeNull();
    expect(extra).not.toBeNull();
    expect(index).not.toBeNull();
    expect(basis!.compareDocumentPosition(extra!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(extra!.compareDocumentPosition(index!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const withdrawal = root.querySelector('input[name="withdrawalrate"]');
    expect(root.querySelector('app-planning-tool-index')!.compareDocumentPosition(withdrawal!) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    fixture.destroy();
  });

  function setManualSpending(fixture: ComponentFixture<PlanningComponent>, value: string): void {
    fixture.componentInstance.onSpendingModeChange('manual');
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input[name="annual_spending"]') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it('shows a retirement target for an entered zero and a known amount', async () => {
    const fixture = await open('retirement-target');
    setManualSpending(fixture, '0');
    expect(text(fixture)).toContain('FI target');
    expect(text(fixture)).toContain('Using the $0 yearly spending you entered.');

    setManualSpending(fixture, '40000');
    const known = text(fixture);
    expect(known).toContain('FI target');
    expect(known).toContain('1,000,000');
    expect(known).not.toContain('you entered');
    fixture.destroy();
  });

  it('keeps an entered amount when Retirement is opened again', async () => {
    const first = await open('retirement-target');
    first.componentInstance.onSpendingModeChange('manual');
    first.componentInstance.onAnnualSpendingInput(40000);
    first.destroy();

    const again = await open('retirement-target');
    expect(again.componentInstance.spendingMode).toBe('manual');
    expect(again.componentInstance.assumptions.annual_spending).toBe(40000);
    expect(text(again)).toContain('FI target');
    expect(text(again)).not.toContain('not recorded');
    again.destroy();
  });

  it('shows a stale price warning and keeps the last target when refresh fails', async () => {
    encStore.getFixedExpenses.and.resolveTo([{ annual_amount: 12000, is_active: true }] as never);
    encStore.getHoldings.and.resolveTo([{
      id: 10, lifecycle_status: 'active', shares: 3, current_price: 100,
      quote_date: null, position_as_of: '2026-10-01',
    }] as never);
    const fixture = await open('retirement-target');
    expect(text(fixture)).toContain('1 holding has no price date.');
    expect(text(fixture)).toContain('FI target');
    const facts = fixture.nativeElement.querySelector('details.planning-disclosure') as HTMLDetailsElement;
    expect(facts.open).toBeTrue();

    encStore.getNetWorth.and.rejectWith(new Error('planning inputs unavailable'));
    fixture.componentInstance.refreshSourceFacts();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text(fixture)).toContain('planning inputs unavailable');
    const labels = [...fixture.nativeElement.querySelectorAll('ui-button')].map(node => (node as HTMLElement).textContent ?? '');
    expect(labels.some(label => label.includes('Retry loading current facts'))).toBeTrue();
    expect(text(fixture)).toContain('FI target');
    fixture.destroy();
  });

  it('does not project a target when planning inputs fail to load', async () => {
    encStore.getNetWorth.and.rejectWith(new Error('planning inputs unavailable'));
    const fixture = await open('retirement-target');
    expect(text(fixture)).toContain('planning inputs unavailable');
    expect(text(fixture)).not.toContain('FI target');
    fixture.destroy();
  });

  it('puts each in-page tool input ahead of the tool index', async () => {
    for (const tool of ['simulation', 'savings-goal', 'debt-payoff'] as const) {
      const fixture = await open(tool);
      const root = fixture.nativeElement as HTMLElement;
      const index = root.querySelector('app-planning-tool-index');
      const field = tool === 'simulation'
        ? root.querySelector('input[name="horizonYears"]')
        : tool === 'savings-goal'
          ? root.querySelector('input[name="name"]')
          : root.querySelector('select[name="selecteddebtliabilityid"]');
      expect(field).withContext(tool).not.toBeNull();
      expect(index).withContext(tool).not.toBeNull();
      expect(field!.compareDocumentPosition(index!) & Node.DOCUMENT_POSITION_FOLLOWING).withContext(tool).toBeTruthy();
      fixture.destroy();
    }
  });
});
