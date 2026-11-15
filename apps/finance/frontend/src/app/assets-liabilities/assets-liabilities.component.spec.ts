import { ConfirmService } from '@vivek/ui';
import { of } from 'rxjs';
import { Asset,Liability } from '../models/transaction.model';
import { AssetsLiabilitiesComponent } from './assets-liabilities.component';

describe('AssetsLiabilitiesComponent balance editing', () => {
  function makeComponent() {
    const finance = jasmine.createSpyObj('FinanceService', ['addAsset', 'addLiability', 'updateAsset', 'updateLiability', 'deleteAsset', 'deleteLiability']);
    finance.addAsset.and.callFake((body: unknown) => of(body));
    finance.addLiability.and.callFake((body: unknown) => of(body));
    finance.updateAsset.and.callFake((_id: number, body: unknown) => of(body));
    finance.updateLiability.and.callFake((_id: number, body: unknown) => of(body));
    const toast = jasmine.createSpyObj('ToastService', ['success', 'error', 'info']);
    const confirm = { ask: jasmine.createSpy('ask').and.resolveTo(true) } as unknown as ConfirmService;
    const component = new AssetsLiabilitiesComponent(finance, toast, confirm, { markForCheck: () => {} } as any);
    component.assets = [{
      id: 1, name: 'Checking', category: 'checking', current_value: 1200, as_of_date: '2026-09-30',
      review_interval_days: 0,
    } as Asset];
    component.liabilities = [{
      id: 2, name: 'Card', category: 'credit_card', balance_owed: 250, as_of_date: '2026-10-01',
      review_interval_days: 60,
    } as Liability];
    return { component, finance, toast, confirm };
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
    }, true);

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
    }, true);
  });

});
