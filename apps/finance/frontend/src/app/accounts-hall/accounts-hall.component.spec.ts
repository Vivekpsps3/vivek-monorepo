import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ToastService } from '@vivek/ui';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { VaultService } from '../crypto/vault.service';
import type { Asset, Liability, NetWorth } from '../models/transaction.model';
import { FinanceService } from '../services/finance.service';
import { AccountsHallComponent } from './accounts-hall.component';

describe('AccountsHallComponent', () => {
  const checking: Asset = {
    id: 11, name: 'Harbor checking', category: 'checking', current_value: 1200,
    as_of_date: '2026-10-01', notes: 'Statement', review_interval_days: 0,
    created_at: '2026-10-01', updated_at: '2026-10-01',
  };
  const card: Liability = {
    id: 21, name: 'Harbor card balance', category: 'credit_card', balance_owed: 250,
    as_of_date: '2026-10-11', notes: '', review_interval_days: 60,
    created_at: '2026-10-11', updated_at: '2026-10-11',
  };
  const worth: NetWorth = {
    other_assets: 1200, portfolio: 300, liabilities: 250, total_assets: 1500, total: 1250,
  };

  function setup() {
    const assets$ = new BehaviorSubject<Asset[]>([checking]);
    const liabilities$ = new BehaviorSubject<Liability[]>([card]);
    const netWorth$ = new BehaviorSubject<NetWorth | null>(worth);
    const unlocked$ = new BehaviorSubject(true);
    let unlocked = true;
    const toast = jasmine.createSpyObj<ToastService>('ToastService', ['success', 'error']);
    const finance = jasmine.createSpyObj<FinanceService>('FinanceService', [
      'getAssets', 'getLiabilities', 'getNetWorth', 'updateAsset', 'updateLiability', 'addAsset', 'addLiability',
    ], { sessionToken: 1, assets$, liabilities$, netWorth$ });
    finance.getAssets.and.returnValue(of([checking]));
    finance.getLiabilities.and.returnValue(of([card]));
    finance.getNetWorth.and.callFake(() => of(netWorth$.value!));
    let publishes = 0;
    finance.updateAsset.and.callFake((_id: number, body: { current_value?: number }) => {
      publishes += 1;
      const next = { ...checking, current_value: body.current_value ?? checking.current_value };
      assets$.next([next]);
      netWorth$.next({ ...worth, other_assets: next.current_value, total: next.current_value + 300 - 250 });
      return of(next);
    });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: FinanceService, useValue: finance },
        { provide: ToastService, useValue: toast },
        {
          provide: VaultService,
          useValue: { unlocked$, get isUnlocked() { return unlocked; } },
        },
      ],
    });
    const fixture = TestBed.createComponent(AccountsHallComponent);
    fixture.detectChanges();
    return {
      fixture,
      finance,
      toast,
      assets$,
      netWorth$,
      unlocked$,
      lock: () => { unlocked = false; unlocked$.next(false); },
      publishes: () => publishes,
    };
  }

  it('opens the unlocked drawer in the shared editor and updates both views once', () => {
    const { fixture, finance, publishes, netWorth$ } = setup();
    const host: HTMLElement = fixture.nativeElement;
    expect(host.textContent).toContain('Hidden');
    expect(host.textContent).not.toContain('$');
    const lockedDrawer = host.querySelector('[data-drawer="asset:11"]');
    expect(lockedDrawer?.getAttribute('aria-label')).toBeNull();
    expect(lockedDrawer?.textContent).toContain('Harbor checking');
    expect(lockedDrawer?.textContent).toContain('Hidden');

    const seen: number[] = [];
    const practical = netWorth$.subscribe(value => { if (value) seen.push(value.total); });
    const before = seen.length;
    (host.querySelector('[data-drawer="asset:11"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    const editor = fixture.componentInstance.balanceEditor;
    expect(editor.draft?.id).toBe(11);
    expect(editor.draft?.kind).toBe('asset');
    expect(editor.draft?.name).toBe('Harbor checking');
    expect(editor.draft?.date).toBe('2026-10-01');
    expect(editor.draft?.notes).toBe('Statement');
    expect(editor.draft?.reviewIntervalDays).toBe(0);
    expect(host.querySelector('[data-drawer="debt:21"]')?.textContent).toContain('Hidden');
    expect(host.querySelector('[data-drawer="debt:21"]')?.textContent).not.toContain('$');

    editor.draft!.value = '1399.25';
    editor.save();
    fixture.detectChanges();

    expect(finance.updateAsset).toHaveBeenCalledOnceWith(11, jasmine.objectContaining({
      name: 'Harbor checking',
      current_value: 1399.25,
      as_of_date: '2026-10-01',
      review_interval_days: 0,
      notes: 'Statement',
    }), true);
    expect(publishes()).toBe(1);
    expect(seen.slice(before)).toEqual([1449.25]);
    expect(host.querySelector('[data-hall-amount]')?.textContent).toContain('1,399.25');
    expect(host.querySelector('[data-hall-total]')?.textContent).toContain('1,449.25');
    expect(host.querySelector('[data-drawer="debt:21"]')?.textContent).not.toContain('$');
    practical.unsubscribe();
  });

  it('keeps a failed draft and ignores a late response after lock', () => {
    const { fixture, finance, toast, assets$, netWorth$, lock } = setup();
    const held = new Subject<Asset>();
    finance.updateAsset.and.returnValue(held);
    (fixture.nativeElement.querySelector('[data-drawer="asset:11"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const editor = fixture.componentInstance.balanceEditor;
    editor.draft!.value = '1399.25';
    editor.draft!.notes = 'Unpublished coastal draft';
    editor.save();

    finance.updateLiability.and.returnValue(throwError(() => new Error('no')));
    fixture.componentInstance.unlock('debt:21');
    fixture.detectChanges();
    expect(editor.draft?.id).toBe(21);
    expect(editor.draft?.notes).toBe('');
    editor.draft!.notes = 'Current draft';
    editor.draft!.value = '80';
    editor.save();
    fixture.detectChanges();
    expect(editor.draft?.id).toBe(21);
    expect(editor.draft?.value).toBe('80');
    expect(editor.draft?.saveError).toContain("Couldn't save");

    held.next(checking);
    held.complete();
    fixture.detectChanges();
    expect(editor.draft?.id).toBe(21);
    expect(editor.draft?.notes).toBe('Current draft');
    expect(toast.success).not.toHaveBeenCalled();

    lock();
    fixture.detectChanges();
    assets$.next([{ ...checking, current_value: 9999 }]);
    netWorth$.next({ ...worth, other_assets: 9999, total: 9999 });
    fixture.detectChanges();
    expect(fixture.componentInstance.revealed()).toBeNull();
    expect(fixture.componentInstance.balanceEditor.draft).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('$');
    expect(fixture.nativeElement.textContent).not.toContain('Harbor');
    expect(fixture.nativeElement.textContent).not.toContain('9,999');
    expect(fixture.nativeElement.textContent).not.toContain('Unpublished coastal draft');
  });
});
