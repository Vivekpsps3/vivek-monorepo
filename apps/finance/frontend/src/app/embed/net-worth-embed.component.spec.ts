import { ChangeDetectorRef } from '@angular/core';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { NetWorthEmbedComponent } from './net-worth-embed.component';

describe('NetWorthEmbedComponent', () => {
  it('keeps the initial load and reflects later quote-driven net-worth updates with ticker disclosure', () => {
    const initial = { total: 1000, other_assets: 300, portfolio: 900, liabilities: 200 } as any;
    const finance = {
      sessionToken: 5,
      netWorth$: new BehaviorSubject<any>(null),
      getNetWorth: jasmine.createSpy('getNetWorth').and.returnValue(of(initial)),
    };
    const auth = {
      currentUser: { id: 8, username: 'sam' },
      user$: new BehaviorSubject<any>({ id: 8, username: 'sam' }),
    };
    const vault = { isUnlocked: true, unlocked$: new Subject<boolean>() };
    const market = jasmine.createSpyObj('MarketRefreshCoordinatorService', ['startForSession', 'endSession']);
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>('ChangeDetectorRef', ['markForCheck']);
    const component = new NetWorthEmbedComponent(finance as any, cdr, auth as any, vault as any, market);

    component.ngOnInit();
    expect(component.netWorth).toEqual(initial);
    expect(component.marketDisclosure).toContain('Ticker symbols are sent');
    expect(market.startForSession).toHaveBeenCalledWith(8, 5);

    const afterQuote = { ...initial, portfolio: 1250, total: 1350 };
    finance.netWorth$.next(afterQuote);
    expect(component.netWorth).toEqual(afterQuote);

    component.ngOnDestroy();
  });
});
