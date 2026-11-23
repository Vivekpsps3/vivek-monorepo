import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { StampWalletComponent } from './stamp-wallet.component';
import { TownApiService, type StampWallet } from './town.api';

function wallet(partial: Partial<StampWallet> = {}): StampWallet {
  return {
    balance: 0,
    consumers: [
      { id: 'market', name: 'Workshop market', detail: 'Spend and refund cosmetic unlocks.' },
      { id: 'quest', name: 'Chapter quests', detail: 'Grant each chapter reward once.' },
      { id: 'minigame', name: 'Minigames', detail: 'Grant a capped reward from a validated play receipt.' },
    ],
    receipts: [],
    entitlements: [],
    ...partial,
  };
}

describe('Stamp wallet', () => {
  let loads: Subject<StampWallet>[];
  let refunds: Subject<StampWallet>[];
  let api: { getStamps: jasmine.Spy; refundStamps: jasmine.Spy };

  beforeEach(() => {
    loads = [];
    refunds = [];
    api = {
      getStamps: jasmine.createSpy().and.callFake(() => {
        const subject = new Subject<StampWallet>();
        loads.push(subject);
        return subject;
      }),
      refundStamps: jasmine.createSpy().and.callFake(() => {
        const subject = new Subject<StampWallet>();
        refunds.push(subject);
        return subject;
      }),
    };
    TestBed.configureTestingModule({
      imports: [StampWalletComponent],
      providers: [provideRouter([]), { provide: TownApiService, useValue: api }],
    });
  });

  function render() {
    const fixture = TestBed.createComponent(StampWalletComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('starts at zero and names the market, quest, and minigame', () => {
    const { fixture, el } = render();
    loads[0].next(wallet());
    fixture.detectChanges();
    expect(el.querySelector('.balance')?.textContent).toContain('0 Stamps');
    expect(el.textContent).toContain('Workshop market');
    expect(el.textContent).toContain('Chapter quests');
    expect(el.textContent).toContain('Minigames');
    expect(el.textContent).toContain('No receipts yet.');
    expect(el.querySelector('a[href="/town/cosmetics"]')).not.toBeNull();
    expect(el.querySelector('a[href="/town/memory"]')).not.toBeNull();
  });

  it('keeps the refund phrase when the request fails and clears it when the wallet updates', () => {
    const { fixture, el } = render();
    loads[0].next(wallet({
      balance: 0,
      entitlements: [{ catalog_id: 'tile-fountain', active: true, amount: 10, spend_receipt_id: 4 }],
    }));
    fixture.detectChanges();
    const refundButton = [...el.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Refund');
    refundButton?.click();
    fixture.detectChanges();
    const input = el.querySelector<HTMLInputElement>('#stamp-refund-phrase')!;
    input.value = 'refund';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    el.querySelector<HTMLFormElement>('form')!.requestSubmit();
    fixture.detectChanges();
    expect(input.disabled).toBeFalse();
    expect(el.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBeTrue();
    refunds[0].error({ status: 409 });
    fixture.detectChanges();
    expect(el.querySelector<HTMLInputElement>('#stamp-refund-phrase')!.value).toBe('refund');
    expect(el.textContent).toContain('The phrase is still here.');
    el.querySelector<HTMLFormElement>('form')!.requestSubmit();
    fixture.detectChanges();
    refunds[1].next(wallet({ balance: 10, entitlements: [] }));
    fixture.detectChanges();
    expect(el.querySelector('.balance')?.textContent).toContain('10 Stamps');
    expect(el.querySelector('#stamp-refund-phrase')).toBeNull();
    expect(api.refundStamps).toHaveBeenCalledWith({
      grant_key: 'market:refund:tile-fountain:4',
      catalog_id: 'tile-fountain',
    });
  });

  it('drops a typed phrase on invalidation and ignores a late wallet', () => {
    const { fixture, el } = render();
    loads[0].next(wallet({
      balance: 0,
      entitlements: [{ catalog_id: 'moon-clock', active: true, amount: 20, spend_receipt_id: 9 }],
    }));
    fixture.detectChanges();
    [...el.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Refund')?.click();
    fixture.detectChanges();
    const input = el.querySelector<HTMLInputElement>('#stamp-refund-phrase')!;
    input.value = 'refund';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    el.querySelector<HTMLFormElement>('form')!.requestSubmit();
    fixture.detectChanges();
    fixture.componentInstance.invalidate();
    fixture.detectChanges();
    refunds[0].next(wallet({ balance: 999 }));
    loads[0].next(wallet({ balance: 999 }));
    fixture.detectChanges();
    expect(el.textContent).not.toContain('999');
    expect(el.querySelector('#stamp-refund-phrase')).toBeNull();
    expect(el.querySelector('.balance')?.textContent).toContain('Loading Stamps');
  });

  it('keeps a typed phrase when a reload fails', () => {
    const { fixture, el } = render();
    loads[0].next(wallet({
      entitlements: [{ catalog_id: 'globe', active: true, amount: 10, spend_receipt_id: 2 }],
    }));
    fixture.detectChanges();
    [...el.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Refund')?.click();
    fixture.detectChanges();
    const input = el.querySelector<HTMLInputElement>('#stamp-refund-phrase')!;
    input.value = 'ref';
    input.dispatchEvent(new Event('input'));
    fixture.componentInstance.load();
    loads[1].error({ status: 503 });
    fixture.detectChanges();
    expect(el.querySelector<HTMLInputElement>('#stamp-refund-phrase')!.value).toBe('ref');
    expect(el.textContent).toContain('Stamps are unavailable right now.');
  });
});
