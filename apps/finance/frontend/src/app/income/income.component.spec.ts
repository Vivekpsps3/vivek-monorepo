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
