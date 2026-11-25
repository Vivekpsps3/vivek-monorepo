import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BehaviorSubject, Subject } from 'rxjs';
import { SessionService } from '../platform/session.service';
import { TownApiService, type StampWallet } from './town.api';
import { WorkshopComponent } from './workshop.component';

const available: StampWallet = { balance: 5, consumers: [], receipts: [], entitlements: [] };
const unlocked: StampWallet = {
  ...available,
  balance: 0,
  entitlements: [{ catalog_id: 'shell-stool', active: true, amount: 5, spend_receipt_id: 4 }],
};

describe('Workshop', () => {
  let user: BehaviorSubject<{ id: number } | null>;
  let loads: Subject<StampWallet>[];
  let writes: Subject<StampWallet>[];
  let api: { getStamps: jasmine.Spy; purchaseStamps: jasmine.Spy; refundStamps: jasmine.Spy };

  beforeEach(() => {
    user = new BehaviorSubject<{ id: number } | null>({ id: 1 });
    loads = [];
    writes = [];
    const request = (responses: Subject<StampWallet>[]) => jasmine.createSpy().and.callFake(() => {
      const pending = new Subject<StampWallet>();
      responses.push(pending);
      return pending;
    });
    api = { getStamps: request(loads), purchaseStamps: request(writes), refundStamps: request(writes) };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'town/workshop', component: WorkshopComponent }]),
        { provide: SessionService, useValue: { user$: user } },
        { provide: TownApiService, useValue: api },
      ],
    });
  });

  async function open(wallet: StampWallet, item = 'shell-stool') {
    const harness = await RouterTestingHarness.create('/town/workshop?item=' + item);
    loads[0].next(wallet);
    harness.detectChanges();
    const el = harness.routeNativeElement!;
    function click(name: string): void {
      const button = Array.from(el.querySelectorAll('button')).find(button => button.textContent?.trim() === name);
      expect(button).withContext(name).toBeDefined();
      button?.click();
      harness.detectChanges();
    }
    return { harness, el, click };
  }

  it('confirms one item and preserves its receipt key through an unconfirmed request', async () => {
    const { harness, el, click } = await open(available);
    click('Unlock');
    expect(api.purchaseStamps).not.toHaveBeenCalled();
    click('Cancel');
    expect(api.purchaseStamps).not.toHaveBeenCalled();
    click('Unlock');
    click('Confirm purchase');
    expect(api.purchaseStamps).toHaveBeenCalledOnceWith({
      catalog_id: 'shell-stool', amount: 5, grant_key: jasmine.stringMatching(/^market:buy:/),
    });
    writes[0].error({ status: 502 });
    harness.detectChanges();
    expect(el.textContent).toContain('Try this action again');
    click('Confirm purchase');
    expect(api.purchaseStamps.calls.argsFor(1)).toEqual(api.purchaseStamps.calls.argsFor(0));
    writes[1].next(unlocked);
    harness.detectChanges();
    expect(el.textContent).toContain('0 Stamps available');
    expect(el.textContent).toContain('Unlocked. Place it in Home.');
  });

  it('keeps a refused refund actionable and ignores a held write on owner change', async () => {
    const { harness, el, click } = await open(unlocked);
    click('Refund');
    click('Confirm refund');
    expect(api.refundStamps).toHaveBeenCalledOnceWith({
      catalog_id: 'shell-stool', spend_receipt_id: 4, grant_key: 'market:refund:4',
    });
    writes[0].error({ status: 409, error: { code: 'unlock_in_use' } });
    harness.detectChanges();
    expect(el.textContent).toContain('Remove every copy from your saved layouts');
    click('Confirm refund');
    user.next({ id: 2 });
    loads[1].next({ ...available, balance: 2 });
    writes[1].next({ ...available, balance: 999 });
    harness.detectChanges();
    expect(el.textContent).toContain('2 Stamps available');
    expect(el.textContent).not.toContain('999');
    expect(el.textContent).not.toContain('Confirm refund');
  });

  it('shows and refunds a previously sold unlock outside the current catalog', async () => {
    const old = { ...unlocked, entitlements: [{ ...unlocked.entitlements[0], catalog_id: 'future-chair' }] };
    const { el, click } = await open(old, 'future-chair');
    expect(el.querySelector('h2')?.textContent).toContain('Older unlock');
    click('Refund');
    click('Confirm refund');
    expect(api.refundStamps).toHaveBeenCalledOnceWith({
      catalog_id: 'future-chair', spend_receipt_id: 4, grant_key: 'market:refund:4',
    });
  });

  it('reloads the wallet on an item deep link and drops a held confirmation from the previous item', async () => {
    const { harness, el, click } = await open(available);
    click('Unlock');
    click('Confirm purchase');
    await harness.navigateByUrl('/town/workshop?item=moon-clock', WorkshopComponent);
    loads[1].next({ ...available, balance: 3 });
    writes[0].next({ ...unlocked, balance: 999 });
    harness.detectChanges();
    expect(el.querySelector('h2')?.textContent).toContain('Moon clock');
    expect(el.textContent).toContain('3 Stamps available');
    expect(el.textContent).not.toContain('999');
  });
});
