import { of, throwError } from 'rxjs';
import { ConfirmService } from '@vivek/ui';
import { Asset, Liability } from '../models/transaction.model';
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

  it('shows one retry toast when deleting an asset fails', async () => {
    const { component, finance, toast, confirm } = makeComponent();
    finance.deleteAsset.and.returnValue(throwError(() => new Error('nope')));
    await component.deleteAsset(component.assets[0]);
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error.calls.mostRecent().args[0]).toBe("Couldn't delete this asset.");
    expect(toast.error.calls.mostRecent().args[1].label).toBe('Try again');
    expect(finance.deleteAsset).toHaveBeenCalledWith(1, true);
    (toast.error.calls.mostRecent().args[1].run as () => void)();
    expect(confirm.ask as jasmine.Spy).toHaveBeenCalledTimes(1);
    expect(finance.deleteAsset).toHaveBeenCalledTimes(2);
  });

  it('shows one retry toast when deleting a debt fails', async () => {
    const { component, finance, toast, confirm } = makeComponent();
    finance.deleteLiability.and.returnValue(throwError(() => new Error('nope')));
    await component.deleteLiability(component.liabilities[0]);
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error.calls.mostRecent().args[0]).toBe("Couldn't delete this debt.");
    expect(toast.error.calls.mostRecent().args[1].label).toBe('Try again');
    expect(finance.deleteLiability).toHaveBeenCalledWith(2, true);
    (toast.error.calls.mostRecent().args[1].run as () => void)();
    expect(confirm.ask as jasmine.Spy).toHaveBeenCalledTimes(1);
    expect(finance.deleteLiability).toHaveBeenCalledTimes(2);
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

import { TestBed, ComponentFixture } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { ToastService } from '@vivek/ui';
import { FinanceService } from '../services/finance.service';

describe('empty states (F10)', () => {
  let fixture: ComponentFixture<AssetsLiabilitiesComponent>;
  let financeStub: {
    assets$: BehaviorSubject<Asset[]>; liabilities$: BehaviorSubject<Liability[]>;
    netWorth$: BehaviorSubject<unknown>;
    getAssets: jasmine.Spy; getLiabilities: jasmine.Spy; getNetWorth: jasmine.Spy;
  };

  beforeEach(async () => {
    financeStub = {
      assets$: new BehaviorSubject<Asset[]>([]),
      liabilities$: new BehaviorSubject<Liability[]>([]),
      netWorth$: new BehaviorSubject<unknown>(null),
      getAssets: jasmine.createSpy('getAssets').and.returnValue(of(null)),
      getLiabilities: jasmine.createSpy('getLiabilities').and.returnValue(of(null)),
      getNetWorth: jasmine.createSpy('getNetWorth').and.returnValue(of(null)),
    };
    await TestBed.configureTestingModule({
      imports: [AssetsLiabilitiesComponent],
      providers: [
        { provide: FinanceService, useValue: financeStub },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error', 'info']) },
        { provide: ConfirmService, useValue: { ask: () => Promise.resolve(true) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AssetsLiabilitiesComponent);
  });

  function text(): string { return (fixture.nativeElement as HTMLElement).textContent ?? ''; }

  it('hasBalanceSheet false when nothing exists', () => {
    fixture.detectChanges();
    expect(fixture.componentInstance.hasBalanceSheet).toBeFalse();
  });

  it('hasBalanceSheet true with rows', () => {
    financeStub.assets$.next([{ id: 1, name: 'Checking', category: 'checking', current_value: 5, as_of_date: '2026-09-30', review_interval_days: 0 } as Asset]);
    fixture.detectChanges();
    expect(fixture.componentInstance.hasBalanceSheet).toBeTrue();
  });

  it('hasBalanceSheet true with portfolio-only net worth', () => {
    financeStub.netWorth$.next({ total: 10, portfolio: 10, excluded_invalid_amounts: 0 });
    fixture.detectChanges();
    expect(fixture.componentInstance.hasBalanceSheet).toBeTrue();
  });

  it('empty vault shows both empty states, no hero, no header buttons', () => {
    financeStub.netWorth$.next({ total: 0, portfolio: 0, excluded_invalid_amounts: 0 });
    fixture.detectChanges();
    expect(text()).toContain('No assets yet');
    expect(text()).toContain('No debts recorded');
    expect(fixture.nativeElement.querySelector('.net-worth-hero')).toBeNull();
    expect(fixture.nativeElement.querySelector('.header-actions')).toBeNull();
  });

  it('hero and header buttons return once an asset exists', () => {
    financeStub.netWorth$.next({ total: 5, portfolio: 0, excluded_invalid_amounts: 0 });
    financeStub.assets$.next([{ id: 1, name: 'Checking', category: 'checking', current_value: 5, as_of_date: '2026-09-30', review_interval_days: 0 } as Asset]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.net-worth-hero')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.header-actions')).not.toBeNull();
  });
});
