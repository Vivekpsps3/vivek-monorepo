import { of } from 'rxjs';
import { Asset, Liability } from '../models/transaction.model';
import { AssetsLiabilitiesComponent } from './assets-liabilities.component';
import { todayIsoDate } from '../utils/date.util';

describe('AssetsLiabilitiesComponent balance review', () => {
  function makeComponent() {
    const finance = jasmine.createSpyObj('FinanceService', ['addAsset', 'addLiability', 'updateAsset', 'updateLiability']);
    finance.updateAsset.and.callFake((_id: number, body: unknown) => of(body));
    finance.updateLiability.and.callFake((_id: number, body: unknown) => of(body));
    const toast = jasmine.createSpyObj('ToastService', ['success', 'error', 'info']);
    const component = new AssetsLiabilitiesComponent(finance, toast, {} as any, { markForCheck: () => {} } as any);
    component.assets = [{
      id: 1, name: 'Checking', category: 'checking', current_value: 1200, as_of_date: todayIsoDate(),
      review_interval_days: null,
    } as Asset];
    component.liabilities = [{
      id: 2, name: 'Card', category: 'credit_card', balance_owed: 250, as_of_date: todayIsoDate(),
      review_interval_days: 60,
    } as Liability];
    return { component, finance, toast };
  }

  it('uses 30-day cash and liability defaults and includes custom review intervals', () => {
    const { component } = makeComponent();
    component.openBalanceReview();
    expect(component.balanceReviewRows.map(row => row.intervalDays)).toEqual([30, 60]);
    expect(component.balanceReviewRows.map(row => row.name)).toEqual(['Checking', 'Card']);
    expect(component.reviewState(component.balanceReviewRows[0])).toBe('current');
    component.balanceReviewRows[0].asOfDate = new Date(
      Date.parse(component.balanceReviewDate + 'T00:00:00Z') - 31 * 86_400_000,
    ).toISOString().slice(0, 10);
    expect(component.reviewState(component.balanceReviewRows[0])).toBe('due');
  });

  it('only updates a balance date for explicitly confirmed unchanged rows', () => {
    const { component, finance } = makeComponent();
    component.openBalanceReview();
    const unchanged = component.balanceReviewRows[0];
    unchanged.confirmedUnchanged = true;
    component.saveBalanceReview();
    expect(finance.updateAsset).toHaveBeenCalledWith(1, { as_of_date: component.balanceReviewDate });
    expect(finance.updateLiability).not.toHaveBeenCalled();
  });

  it('saves changed amounts and date while leaving other unconfirmed balances untouched', () => {
    const { component, finance } = makeComponent();
    component.openBalanceReview();
    const changed = component.balanceReviewRows[0];
    changed.amount = 1350;
    component.updateReviewAmount(changed);
    component.saveBalanceReview();
    expect(finance.updateAsset).toHaveBeenCalledWith(1, {
      current_value: 1350,
      as_of_date: component.balanceReviewDate,
    });
    expect(finance.updateLiability).not.toHaveBeenCalled();
  });

  it('rejects blank or non-finite manual balances before starting a write', () => {
    const { component, finance } = makeComponent();
    component.assetForm = { ...component.assetForm, name: 'Cash', current_value: null as any };
    component.saveAsset();
    component.assetForm.current_value = Number.NaN;
    component.saveAsset();

    component.liabilityForm = { ...component.liabilityForm, name: 'Card', balance_owed: null as any };
    component.saveLiability();
    component.liabilityForm.balance_owed = Number.NaN;
    component.saveLiability();

    expect(finance.addAsset).not.toHaveBeenCalled();
    expect(finance.updateAsset).not.toHaveBeenCalled();
    expect(finance.addLiability).not.toHaveBeenCalled();
    expect(finance.updateLiability).not.toHaveBeenCalled();
    expect(component.saving).toBeFalse();
  });
});
