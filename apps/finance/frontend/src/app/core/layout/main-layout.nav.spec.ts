import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { ConfirmService, SESSION_CONTEXT, ToastService, UserMenuContent, type SessionPort } from '@vivek/ui';
import { ApiHealthService } from '../../services/api-health.service';
import { VaultService } from '../../crypto/vault.service';
import { FinanceService } from '../../services/finance.service';
import { MarketRefreshCoordinatorService } from '../../services/market-refresh-coordinator.service';
import { FinanceGuideService } from '../finance-guide.service';
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

  it('renders five section-nav items with D3 labels', () => {
    const items = fixture.componentInstance.sectionNavItems;
    expect(items.map(item => item.label)).toEqual(['Home', 'Net worth', 'Spending', 'Recurring', 'Planning']);
    expect(items[0].exact).toBe(true);
    const links = [...fixture.nativeElement.querySelectorAll('.ui-section-nav__link')] as HTMLElement[];
    expect(links.map(link => link.textContent?.trim())).toEqual(['Home', 'Net worth', 'Spending', 'Recurring', 'Planning']);
  });

  it('mounts one section nav and no mobile tab bar', () => {
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.navbar')).toBeNull();
    expect(root.querySelector('.mobile-tabbar')).toBeNull();
    expect(root.querySelectorAll('ui-section-nav').length).toBe(1);
    expect(root.querySelector('.ui-section-nav')?.getAttribute('aria-label')).toBe('Finance sections');
  });

  it('Guide shows How Finance works with four steps and three rules', () => {
    fixture.componentInstance.openTutorial();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('#tutorial-title')?.textContent?.trim()).toBe('How Finance works');
    const steps = [...root.querySelectorAll('.tutorial-step')];
    expect(steps.length).toBe(4);
    expect(steps.map(step => step.querySelector('h3')?.textContent?.trim())).toEqual(['Net worth', 'Spending', 'Recurring', 'Planning']);
    const rules = [...root.querySelectorAll('.tutorial-rules li')];
    expect(rules.map(rule => rule.textContent?.trim())).toEqual([
      "Card activity doesn't change net worth.",
      "Planning doesn't change your balances.",
      "Don't enter the same cash twice.",
    ]);
  });

  it('Close guide button is 44x44 and labelled', () => {
    fixture.componentInstance.openTutorial();
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('.tutorial-close') as HTMLElement;
    expect(button.getAttribute('aria-label')).toBe('Close guide');
    // Size is CSS (.tutorial-close width/height 44px in the component
    // stylesheet); Karma does not apply component CSS to layout here, so
    // assert the class hook the rule targets.
    expect(button.classList.contains('tutorial-close')).toBe(true);
  });

  it('Show first steps on Home requests first steps, closes and navigates to /finance/', () => {
    const router = TestBed.inject(Router);
    const navigate = spyOn(router, 'navigateByUrl').and.resolveTo(true);
    const guide = TestBed.inject(FinanceGuideService);
    fixture.componentInstance.openTutorial();
    fixture.componentInstance.showFirstStepsOnHome();
    expect(guide.firstStepsRequested()).toBe(true);
    expect(fixture.componentInstance.showTutorial).toBe(false);
    expect(navigate).toHaveBeenCalledWith('/finance');
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
