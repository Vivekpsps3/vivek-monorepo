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

  beforeEach(() => {
    loads = [];
    const api = {
      getStamps: jasmine.createSpy().and.callFake(() => {
        const subject = new Subject<StampWallet>();
        loads.push(subject);
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
    expect(el.querySelector('a[href="/town/workshop"]')).not.toBeNull();
    expect(el.querySelector('a[href="/town/memory"]')).not.toBeNull();
  });

  it('links an active unlock to its Workshop item and ignores a late wallet after invalidation', () => {
    const { fixture, el } = render();
    loads[0].next(wallet({
      entitlements: [{ catalog_id: 'moon-clock', active: true, amount: 20, spend_receipt_id: 9 }],
    }));
    fixture.detectChanges();
    expect(el.querySelector('a[href="/town/workshop?item=moon-clock"]')?.textContent).toContain('Moon clock');
    fixture.componentInstance.invalidate();
    fixture.detectChanges();
    loads[0].next(wallet({ balance: 999 }));
    fixture.detectChanges();
    expect(el.textContent).not.toContain('999');
    expect(el.querySelector('a[href="/town/workshop?item=moon-clock"]')).toBeNull();
  });
});
