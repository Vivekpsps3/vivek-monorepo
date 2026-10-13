import { of } from 'rxjs';
import { Asset, Liability } from '../models/transaction.model';
import { AssetsLiabilitiesComponent } from './assets-liabilities.component';

describe('AssetsLiabilitiesComponent balance editing', () => {
  function makeComponent() {
    const finance = jasmine.createSpyObj('FinanceService', ['addAsset', 'addLiability', 'updateAsset', 'updateLiability']);
    finance.addAsset.and.callFake((body: unknown) => of(body));
    finance.addLiability.and.callFake((body: unknown) => of(body));
    finance.updateAsset.and.callFake((_id: number, body: unknown) => of(body));
    finance.updateLiability.and.callFake((_id: number, body: unknown) => of(body));
    const toast = jasmine.createSpyObj('ToastService', ['success', 'error', 'info']);
    const component = new AssetsLiabilitiesComponent(finance, toast, {} as any, { markForCheck: () => {} } as any);
    component.assets = [{
      id: 1, name: 'Checking', category: 'checking', current_value: 1200, as_of_date: '2026-09-30',
      review_interval_days: 0,
    } as Asset];
    component.liabilities = [{
      id: 2, name: 'Card', category: 'credit_card', balance_owed: 250, as_of_date: '2026-10-01',
      review_interval_days: 60,
    } as Liability];
    return { component, finance, toast };
  }

  it('saves ordinary balance edits without changing the source date or legacy review metadata', () => {
    const { component, finance } = makeComponent();

    component.openEditAsset(component.assets[0]);
    component.assetForm.current_value = 1350;
    component.saveAsset();
    expect(finance.updateAsset).toHaveBeenCalledWith(1, {
      name: 'Checking',
      category: 'checking',
      current_value: 1350,
      as_of_date: '2026-09-30',
      review_interval_days: 0,
      notes: '',
    });

    component.openEditLiability(component.liabilities[0]);
    component.liabilityForm.balance_owed = 275;
    component.saveLiability();
    expect(finance.updateLiability).toHaveBeenCalledWith(2, {
      name: 'Card',
      category: 'credit_card',
      balance_owed: 275,
      as_of_date: '2026-10-01',
      review_interval_days: 60,
      notes: '',
    });
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
