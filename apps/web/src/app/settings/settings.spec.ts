import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { ThemeService } from '@vivek/ui';
import { VaultService } from '../../../../finance/frontend/src/app/crypto/vault.service';
import { PrivateLayoutComponent } from '../private-layout.component';
import { routes } from '../routes';
import { SessionService } from '../platform/session.service';
import { AccountSectionComponent } from './account-section.component';
import { AppearanceSectionComponent } from './appearance-section.component';
import { FinanceSectionComponent } from './finance-section.component';
import { SETTINGS_SECTIONS } from './settings.registry';
import { SETTINGS_ROUTES } from './settings.routes';
import { SettingsShellComponent } from './settings-shell.component';

describe('settings shell', () => {
  it('redirects /account and keeps profile out of the registry', () => {
    const layout = routes.find(route => route.component === PrivateLayoutComponent);
    const account = layout?.children?.find(route => route.path === 'account');
    const redirect = account?.redirectTo as (() => string) | string | undefined;
    expect(typeof redirect === 'function' ? redirect() : redirect).toBe('/settings/account');
    expect(SETTINGS_SECTIONS.map(section => section.path)).toEqual([
      'account', 'appearance', 'travel', 'finance', 'about',
    ]);
    expect(SETTINGS_SECTIONS.find(section => section.path === 'travel')?.data).toEqual({ embedded: true });
    expect(SETTINGS_SECTIONS.some(section => section.path === 'profile')).toBeFalse();
  });

  it('shows one Settings heading and the section list', () => {
    TestBed.configureTestingModule({
      imports: [SettingsShellComponent],
      providers: [provideRouter(SETTINGS_ROUTES)],
    });
    const fixture = TestBed.createComponent(SettingsShellComponent);
    fixture.detectChanges();
    const headings = [...fixture.nativeElement.querySelectorAll('h1')] as HTMLElement[];
    expect(headings.map(heading => heading.textContent?.trim())).toEqual(['Settings']);
    const labels = [...fixture.nativeElement.querySelectorAll('nav[aria-label="Settings"] a')].map(link =>
      (link.textContent ?? '').trim());
    expect(labels).toEqual(['Account', 'Appearance', 'Travel', 'Finance', 'About']);
    expect(fixture.nativeElement.textContent).not.toContain('Profile');
  });
});

describe('AccountSectionComponent', () => {
  let fixture: ComponentFixture<AccountSectionComponent>;
  let updateDisplayName: jasmine.Spy;

  beforeEach(() => {
    updateDisplayName = jasmine.createSpy('updateDisplayName').and.resolveTo({ display_name: 'Ada' });
    TestBed.configureTestingModule({
      imports: [AccountSectionComponent],
      providers: [{
        provide: SessionService,
        useValue: {
          user$: new BehaviorSubject({ display_name: 'Ada' }),
          updateDisplayName,
        },
      }],
    });
    fixture = TestBed.createComponent(AccountSectionComponent);
    fixture.detectChanges();
  });

  it('moves the name form and shows the username hint', async () => {
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Account settings');
    expect(text).toContain('Change username');
    expect(text).toContain('Save name');
    expect(text).toContain('3–64 characters: a–z, 0–9, . _ -');
    expect(fixture.nativeElement.querySelectorAll('h1').length).toBe(1);

    const component = fixture.componentInstance;
    component.draftName = '   ';
    await component.saveName();
    expect(component.nameError).toBe('Enter a name.');
    component.draftName = 'a'.repeat(161);
    await component.saveName();
    expect(component.nameError).toContain('160');
    updateDisplayName.and.rejectWith(new Error('offline'));
    component.draftName = 'Ada Lovelace';
    await component.saveName();
    expect(component.nameError).toBe('offline');
    updateDisplayName.and.resolveTo({ display_name: 'Ada Lovelace' });
    await component.saveName();
    expect(component.nameError).toBe('');
    expect(updateDisplayName).toHaveBeenCalledWith('Ada Lovelace');
  });
});

describe('AppearanceSectionComponent', () => {
  afterEach(() => {
    TestBed.inject(ThemeService).set('system');
  });

  it('persists suite-theme from the radio group', () => {
    localStorage.setItem('suite-theme', 'system');
    TestBed.configureTestingModule({ imports: [AppearanceSectionComponent] });
    const fixture = TestBed.createComponent(AppearanceSectionComponent);
    fixture.detectChanges();
    const dark = fixture.nativeElement.querySelector('input[value="dark"]') as HTMLInputElement;
    dark.click();
    fixture.detectChanges();
    expect(localStorage.getItem('suite-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(fixture.nativeElement.querySelectorAll('h1').length).toBe(1);
  });
});

describe('FinanceSectionComponent', () => {
  function setup(unlocked: boolean): { fixture: ComponentFixture<FinanceSectionComponent>; lock: jasmine.Spy } {
    const unlocked$ = new BehaviorSubject(unlocked);
    const vault = {
      whenReady: () => Promise.resolve(),
      isUnlocked: unlocked,
      unlocked$,
      lock: jasmine.createSpy('lock').and.callFake(() => {
        vault.isUnlocked = false;
        unlocked$.next(false);
      }),
    };
    TestBed.configureTestingModule({
      imports: [FinanceSectionComponent],
      providers: [provideRouter([]), { provide: VaultService, useValue: vault }],
    });
    const fixture = TestBed.createComponent(FinanceSectionComponent);
    fixture.detectChanges();
    return { fixture, lock: vault.lock };
  }

  it('shows the locked state and no lock button while the vault is locked', async () => {
    const { fixture } = setup(false);
    await fixture.whenStable();
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Finance is locked.');
    expect(text).not.toContain('Lock now');
    const link = fixture.nativeElement.querySelector('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toContain('/finance/vault/unlock');
    expect(link.getAttribute('href')).toContain('next=%2Fsettings%2Ffinance');
  });

  it('locks the vault from Lock now and then shows only the locked state', async () => {
    const { fixture, lock } = setup(true);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Lock now');
    fixture.nativeElement.querySelector('button').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(lock).toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Finance is locked.');
    expect(fixture.nativeElement.textContent).not.toContain('Lock now');
  });
});
