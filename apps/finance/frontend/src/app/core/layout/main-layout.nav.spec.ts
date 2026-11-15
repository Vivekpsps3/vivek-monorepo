import { ComponentFixture,TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ConfirmService,SESSION_CONTEXT,ToastService,UserMenuContent,type SessionPort } from '@vivek/ui';
import { BehaviorSubject,of,Subject } from 'rxjs';
import { VaultService } from '../../crypto/vault.service';
import { ApiHealthService } from '../../services/api-health.service';
import { FinanceService } from '../../services/finance.service';
import { MarketRefreshCoordinatorService } from '../../services/market-refresh-coordinator.service';
import { MainLayoutComponent } from './main-layout.component';

describe('MainLayoutComponent navigation (F6)', () => {
  let fixture: ComponentFixture<MainLayoutComponent>;

  beforeEach(async () => {
    const user = { id: 7, username: 'vivek', role: 'member' } as unknown as SessionPort['currentUser'];
    const auth: SessionPort = {
      user$: new BehaviorSubject(user),
      currentUser: user,
      csrfToken: null,
      revision: 0,
      cleared$: new Subject<void>(),
      isAdmin: () => false,
      loadSession: () => of(user),
      clearLocalSession: () => Promise.resolve(),
      logout: () => undefined,
    };
    const marketState = { phase: 'idle', failures: [] } as never;
    await TestBed.configureTestingModule({
      imports: [MainLayoutComponent],
      providers: [
        provideRouter([{ path: 'finance', component: MainLayoutComponent }]),
        { provide: SESSION_CONTEXT, useValue: auth },
        { provide: ApiHealthService, useValue: { checkWithRetries: () => of(true) } },
        {
          provide: VaultService,
          useValue: {
            unlocked$: new BehaviorSubject(true),
            isUnlocked: true,
            lock: () => Promise.resolve(),
          },
        },
        { provide: FinanceService, useValue: { sessionToken: 1, clearSessionState: () => undefined } },
        {
          provide: MarketRefreshCoordinatorService,
          useValue: {
            status$: of(marketState),
            currentState: marketState,
            disclosure: 'Price checks send ticker symbols only. Shares, balances and plans stay encrypted in this browser.',
            firstAutoCheck$: new Subject<readonly string[]>(),
            disclosedSymbols: [] as readonly string[],
            startForSession: () => undefined,
            endSession: () => undefined,
            broadcastLock: () => undefined,
            broadcastSignOut: () => undefined,
            endSessionCalls: 0,
          },
        },
        { provide: ConfirmService, useValue: { ask: () => Promise.resolve(true), confirmAction: () => Promise.resolve(true) } },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error']) },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(MainLayoutComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('toggles Check prices when I unlock in place and opens About price checks', () => {
    localStorage.clear();
    const menu = TestBed.inject(UserMenuContent);
    const view = menu.template()!.createEmbeddedView({});
    view.detectChanges();
    const host = document.createElement('div');
    for (const node of view.rootNodes) host.appendChild(node);
    const toggle = host.querySelector('[role="menuitemcheckbox"]') as HTMLButtonElement;
    expect(toggle.textContent).toContain('Check prices when I unlock');
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(toggle.querySelector('ui-icon')).not.toBeNull();

    toggle.click();
    view.detectChanges();
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(toggle.querySelector('ui-icon')).toBeNull();
    expect(localStorage.getItem('finance-auto-price-check:7')).toBe('off');
    expect(host.querySelector('[role="menuitemcheckbox"]')).not.toBeNull();

    toggle.click();
    view.detectChanges();
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(localStorage.getItem('finance-auto-price-check:7')).toBe('on');

    const about = [...host.querySelectorAll('button')].find(button => button.textContent?.trim() === 'About price checks');
    about!.click();
    fixture.detectChanges();
    const title = fixture.nativeElement.querySelector('#price-details-title') as HTMLElement;
    expect(title.textContent?.trim()).toBe('About price checks');
    const dialogText = title.closest('ui-dialog')?.textContent ?? '';
    expect(dialogText).toContain('Price checks send ticker symbols only. Shares, balances and plans stay encrypted in this browser.');
    expect(dialogText).toContain("Prices come from a public market-data service, requested by Finance's server.");
    expect(dialogText).toContain('Check prices when I unlock is on.');
    expect(dialogText).toContain('No ticker symbols were sent.');
    expect(dialogText).not.toMatch(/\bIP\b/);
    fixture.componentInstance.closePriceDetails();
    fixture.detectChanges();
    expect(fixture.componentInstance.showPriceDetails).toBeFalse();

    view.destroy();
    localStorage.clear();
  });
});
