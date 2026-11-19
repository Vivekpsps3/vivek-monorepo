import { TestBed } from '@angular/core/testing';
import { ConfirmService } from '@vivek/ui';
import { Subject, of } from 'rxjs';
import { VaultService } from '../crypto/vault.service';
import { AssetsLiabilitiesComponent } from './assets-liabilities.component';

describe('AssetsLiabilitiesComponent balance editing', () => {
  const checking = {
    id: 1, name: 'Checking', category: 'checking', value: 1200, as_of_date: '2026-09-30',
    review_interval_days: 0,
  };
  const card = {
    id: 2, name: 'Card', category: 'credit_card', value: 250, as_of_date: '2026-10-01',
    review_interval_days: 60,
  };

  function makeComponent() {
    const finance = jasmine.createSpyObj('FinanceService', [
      'addAsset', 'addLiability', 'updateAsset', 'updateLiability', 'deleteAsset', 'deleteLiability',
    ], { sessionToken: 1 });
    finance.updateAsset.and.callFake((_id: number, body: unknown) => of(body));
    finance.updateLiability.and.callFake((_id: number, body: unknown) => of(body));
    const toast = jasmine.createSpyObj('ToastService', ['success', 'error']);
    TestBed.configureTestingModule({ providers: [{ provide: VaultService, useValue: { isUnlocked: true } }] });
    const component = TestBed.runInInjectionContext(() => new AssetsLiabilitiesComponent(
      finance, toast, new ConfirmService(), { markForCheck: () => {} } as any,
    ));
    return { component, finance, toast };
  }

  it('saves balance edits without changing the source date or review metadata', () => {
    const { component, finance } = makeComponent();

    component.openEditor('asset', checking);
    component.editor!.value = '1350';
    component.saveEditor();
    expect(finance.updateAsset).toHaveBeenCalledOnceWith(1, {
      name: 'Checking',
      category: 'checking',
      current_value: 1350,
      as_of_date: '2026-09-30',
      review_interval_days: 0,
      notes: '',
    }, true);

    component.openEditor('debt', card);
    component.editor!.value = '275';
    component.saveEditor();
    expect(finance.updateLiability).toHaveBeenCalledOnceWith(2, {
      name: 'Card',
      category: 'credit_card',
      balance_owed: 275,
      as_of_date: '2026-10-01',
      review_interval_days: 60,
      notes: '',
    }, true);
  });

  it('leaves a replacement editor alone when the cancelled editor finishes saving', () => {
    const { component, finance, toast } = makeComponent();
    const held = new Subject();
    finance.updateAsset.and.returnValue(held);

    component.openEditor('asset', checking);
    component.saveEditor();
    component.closeEditor();
    component.openEditor('debt', card);
    component.editor!.notes = 'Current draft';
    held.next({});
    held.complete();

    expect(component.editor?.id).toBe(card.id);
    expect(component.editor?.notes).toBe('Current draft');
    expect(toast.success).not.toHaveBeenCalled();
  });
});
