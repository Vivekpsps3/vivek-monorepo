import { ChangeDetectorRef } from '@angular/core';
import { of } from 'rxjs';
import { IncomeComponent } from './income.component';
import { FinanceService } from '../services/finance.service';
import { ConfirmService } from '../services/confirm.service';
import { ToastService } from '../services/toast.service';
import { JobIncome } from '../models/transaction.model';

describe('IncomeComponent compensation editing', () => {
  let component: IncomeComponent;
  let finance: jasmine.SpyObj<FinanceService>;
  let toast: jasmine.SpyObj<ToastService>;
  const row = { id: 3, employer: 'Acme', pay_frequency: 'annual', base_pay: 36525,
    effective_date: '2026-01-01', end_date: '2026-12-31', is_active: true,
    promotions: [{ date: '2026-06-01', annual_base_pay: 73050, role_title: 'Lead' }],
    compensation_payments: [{ date: '2026-07-01', kind: 'bonus', amount: 500 }],
  } as JobIncome;

  beforeEach(() => {
    finance = jasmine.createSpyObj('FinanceService', ['addJobIncome', 'updateJobIncome']);
    finance.updateJobIncome.and.returnValue(of(row));
    toast = jasmine.createSpyObj('ToastService', ['error', 'success']);
    component = new IncomeComponent(finance, {} as ConfirmService, toast, { markForCheck() {} } as ChangeDetectorRef);
  });

  it('edits a copy of history, so cancel preserves the saved job', () => {
    component.openEditModal(row);
    component.form.promotions![0].annual_base_pay = 1;
    component.form.compensation_payments![0].amount = 1;
    component.closeModal();
    expect(row.promotions![0].annual_base_pay).toBe(73050);
    expect(row.compensation_payments![0].amount).toBe(500);
  });

  it('saves end dates and histories through the existing encrypted service', () => {
    component.openEditModal(row);
    component.saveIncome();
    expect(finance.updateJobIncome).toHaveBeenCalledWith(3, jasmine.objectContaining({
      end_date: '2026-12-31', promotions: row.promotions, compensation_payments: [jasmine.objectContaining(row.compensation_payments![0])],
    }));
    expect(toast.success).toHaveBeenCalledWith('Income updated');
  });

  it('blocks invalid history before writing', () => {
    component.openEditModal(row);
    component.form.end_date = '2025-12-31';
    component.saveIncome();
    expect(finance.updateJobIncome).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('End date must be on or after the start date.');
  });

  it('opens legacy jobs with empty histories and allows clearing an end date', () => {
    component.openEditModal({ ...row, end_date: undefined, promotions: undefined, compensation_payments: undefined });
    expect(component.form.promotions).toEqual([]);
    expect(component.form.compensation_payments).toEqual([]);
    component.form.end_date = '';
    component.saveIncome();
    expect(finance.updateJobIncome).toHaveBeenCalledWith(3, jasmine.objectContaining({ end_date: null }));
  });
});
