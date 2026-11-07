import { ChangeDetectorRef } from '@angular/core';
import { of, throwError } from 'rxjs';
import { IncomeComponent } from './income.component';
import { FinanceService } from '../services/finance.service';
import { ConfirmService } from '@vivek/ui';
import { ToastService } from '@vivek/ui';
import { MarketRefreshCoordinatorService } from '../services/market-refresh-coordinator.service';
import { JobIncome } from '../models/transaction.model';

describe('IncomeComponent compensation editing', () => {
  let component: IncomeComponent;
  let finance: jasmine.SpyObj<FinanceService>;
  let market: jasmine.SpyObj<MarketRefreshCoordinatorService>;
  let toast: jasmine.SpyObj<ToastService>;
  const row = { id: 3, employer: 'Acme', pay_frequency: 'annual', base_pay: 36525,
    effective_date: '2026-01-01', end_date: '2026-12-31', is_active: true,
    promotions: [{ date: '2026-06-01', annual_base_pay: 73050, role_title: 'Lead' }],
    compensation_payments: [{ date: '2026-07-01', kind: 'bonus', amount: 500 }],
  } as JobIncome;

  beforeEach(() => {
    finance = jasmine.createSpyObj('FinanceService', ['addJobIncome', 'updateJobIncome']);
    finance.updateJobIncome.and.returnValue(of(row));
    market = jasmine.createSpyObj('MarketRefreshCoordinatorService', ['refreshSymbol']);
    market.refreshSymbol.and.resolveTo({ symbol: 'MSFT', holdingsUpdated: 1, employerValuationsUpdated: 1, failedRecords: [] });
    toast = jasmine.createSpyObj('ToastService', ['error', 'success']);
    component = new IncomeComponent(finance, market, {} as ConfirmService, toast, { markForCheck() {} } as ChangeDetectorRef);
    component.incomes = [row];
  });

  const flushPromises = async (): Promise<void> => {
    for (let index = 0; index < 6; index += 1) await Promise.resolve();
  };

  it('edits a copy of history, so cancel preserves the saved job', () => {
    component.openEditModal(row);
    component.form.promotions![0].annual_base_pay = 1;
    component.form.compensation_payments![0].amount = 1;
    component.closeModal();
    expect(row.promotions![0].annual_base_pay).toBe(73050);
    expect(row.compensation_payments![0].amount).toBe(500);
  });

  it('saves end dates and histories through the existing encrypted service', async () => {
    component.openEditModal(row);
    component.saveIncome();
    await flushPromises();
    expect(finance.updateJobIncome).toHaveBeenCalledWith(3, jasmine.objectContaining({
      end_date: '2026-12-31', promotions: row.promotions, compensation_payments: [jasmine.objectContaining(row.compensation_payments![0])],
    }), true);
    expect(toast.success).toHaveBeenCalledWith('Job saved');
  });

  it('blocks invalid history before writing', () => {
    component.openEditModal(row);
    component.form.end_date = '2025-12-31';
    component.saveIncome();
    expect(finance.updateJobIncome).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(component.fieldErrors.some(error => error.message === 'End date must be on or after the start date.')).toBeTrue();
  });

  it('opens legacy jobs with empty histories and allows clearing an end date', async () => {
    component.openEditModal({ ...row, end_date: undefined, promotions: undefined, compensation_payments: undefined });
    expect(component.form.promotions).toEqual([]);
    expect(component.form.compensation_payments).toEqual([]);
    component.form.end_date = '';
    component.saveIncome();
    await flushPromises();
    expect(finance.updateJobIncome).toHaveBeenCalledWith(3, jasmine.objectContaining({ end_date: null }), true);
  });

  it('routes manual employer quote refresh through the shared coordinator', async () => {
    const job = { ...row, stock_symbol: 'MSFT', stock_valuations: [
      { date: '2026-10-12', price_per_share: 200, source: 'live_eod', symbol: 'MSFT' },
    ] } as JobIncome;
    component.incomes = [job];
    component.refreshStockTicker('msft');
    await flushPromises();
    expect(market.refreshSymbol).toHaveBeenCalledOnceWith('MSFT');
    expect(finance.updateJobIncome).not.toHaveBeenCalled();
  });

  it('reports employer and base pay together on an empty job', () => {
    component.openAddModal();
    component.saveIncome();
    expect(component.fieldErrors.map(error => error.message)).toEqual([
      'Enter the employer.',
      'Enter yearly pay above $0.',
    ]);
    expect(finance.addJobIncome).not.toHaveBeenCalled();
  });

  it('shows one error when a manual share price save fails and keeps the notice', async () => {
    const job = { ...row, stock_symbol: '', stock_valuations: [] } as JobIncome;
    component.incomes = [job];
    const draft = component.stockPriceDraft(job);
    draft.date = '2026-02-01';
    draft.price = '12.5';
    finance.updateJobIncome.and.returnValue(throwError(() => ({ error: { detail: 'Synthetic save failed' } })));
    component.saveStockPrice(job);
    await flushPromises();
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error.calls.mostRecent().args[0]).toBe("Couldn't save this share price. Try again.");
    expect(component.manualPriceNotice[3]).toContain('Manual price could not be saved');
    expect(component.manualPriceNotice[3]).not.toContain('Synthetic');
    expect(finance.updateJobIncome).toHaveBeenCalledWith(3, jasmine.any(Object), true);
  });
});

import { TestBed, ComponentFixture } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';

describe('empty states (F10)', () => {
  let fixture: ComponentFixture<IncomeComponent>;

  beforeEach(async () => {
    const financeStub = {
      jobIncomes$: new BehaviorSubject<JobIncome[]>([]),
      getJobIncomes: () => of([]),
    };
    await TestBed.configureTestingModule({
      imports: [IncomeComponent],
      providers: [
        { provide: FinanceService, useValue: financeStub },
        { provide: MarketRefreshCoordinatorService, useValue: { refreshSymbol: () => Promise.resolve({}) } },
        { provide: ConfirmService, useValue: { ask: () => Promise.resolve(true) } },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error']) },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(IncomeComponent);
    fixture.detectChanges();
  });

  it('no jobs → No jobs yet, summary hidden, exactly one Add job', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('No jobs yet');
    expect(el.textContent).toContain('Add your salary and pay schedule to project income.');
    expect(el.textContent).not.toContain('Yearly pay');
    expect(el.querySelector('.header-actions')).toBeNull();
    const addJobs = [...el.querySelectorAll('button')].filter(b => b.textContent?.trim() === 'Add job');
    expect(addJobs.length).toBe(1);
  });
});

describe('IncomeComponent pay summary (F18)', () => {
  const job = (overrides: Partial<JobIncome> = {}): JobIncome => ({
    id: 1, employer: 'Acme', pay_frequency: 'monthly', base_pay: 10000,
    effective_date: '2026-01-01', end_date: null, is_active: true,
    annual_gross: 120000, annual_net: 90000, annual_taxes: 25000, annual_deductions: 5000,
    ...overrides,
  } as JobIncome);

  async function render(rows: JobIncome[]): Promise<{ component: IncomeComponent; el: HTMLElement }> {
    const finance = jasmine.createSpyObj('FinanceService', ['getJobIncomes'], {
      jobIncomes$: of(rows),
    });
    finance.getJobIncomes.and.returnValue(of(rows));
    const market = jasmine.createSpyObj('MarketRefreshCoordinatorService', ['refreshSymbol']);
    const toast = jasmine.createSpyObj('ToastService', ['error', 'success']);
    await TestBed.configureTestingModule({
      imports: [IncomeComponent],
      providers: [
        { provide: FinanceService, useValue: finance },
        { provide: MarketRefreshCoordinatorService, useValue: market },
        { provide: ConfirmService, useValue: {} },
        { provide: ToastService, useValue: toast },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(IncomeComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { component: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('renders gross first with the take-home pair', async () => {
    const { el } = await render([job()]);
    // Money formatting inserts a word joiner after the currency symbol.
    const text = (el.querySelector('.income-summary')?.textContent ?? '').replace(/⁠/g, '');
    expect(text).toContain('Yearly pay');
    expect(text).toContain('$120,000.00');
    expect(text).toContain('before taxes');
    expect(text).toContain('about $10,000.00 a month');
    expect(text).toContain('Take-home');
    expect(text).toContain('$90,000.00');
    expect(text).toContain('Taxes and deductions');
    expect(text).toContain('$30,000.00');
    expect(text).not.toContain('Gross');
    expect(text).not.toContain('each month');
  });

  it('zero taxes render the not-set line and addTaxes opens the first untaxed current job', async () => {
    const { component, el } = await render([
      job({ id: 1, annual_taxes: 0, annual_deductions: 0, annual_net: 120000 }),
    ]);
    const text = el.querySelector('.income-summary')?.textContent ?? '';
    expect(text).toContain('Take-home: not set');
    const openSpy = spyOn(component, 'openEditModal');
    component.addTaxes();
    expect(openSpy).toHaveBeenCalledWith(jasmine.objectContaining({ id: 1 }));
  });
});
