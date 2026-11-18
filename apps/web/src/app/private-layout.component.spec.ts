import { By } from '@angular/platform-browser';
import { Component } from '@angular/core';
import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { NavigationEnd,Router,provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BehaviorSubject,Subject,of } from 'rxjs';
import { SessionService } from './platform/session.service';
import { PrivateLayoutComponent } from './private-layout.component';

@Component({standalone: true, template: '<input aria-label="Shortcut typing"><div contenteditable="true" aria-label="Editable note"></div>'})
class ShortcutPageComponent {
  onWorkspaceShortcut = jasmine.createSpy('onWorkspaceShortcut');
}

@Component({standalone: true, template: '<input aria-label="Private draft" value="">'})
class PrivateDraftComponent {}

describe('Shared private shell', () => {
  it('destroys a mounted private draft when the signed-in identity changes', async () => {
    const users = new BehaviorSubject({id: 1, display_name: 'Ada'});
    const session = {currentUser: users.value, user$: users.asObservable(), isAdmin: () => false, logout: () => undefined};
    TestBed.configureTestingModule({providers: [
      provideRouter([{path: '', component: PrivateLayoutComponent, children: [{path: 'travel', component: PrivateDraftComponent}]}]),
      {provide: SessionService, useValue: session},
    ]});
    const harness = await RouterTestingHarness.create('/travel');
    const first = harness.routeNativeElement?.querySelector('input[aria-label="Private draft"]') as HTMLInputElement;
    first.value = 'Private information from Ada';
    session.currentUser = {id: 2, display_name: 'Bea'};
    users.next(session.currentUser);
    harness.detectChanges();
    await TestBed.inject(Router).navigateByUrl('/travel');
    harness.detectChanges();
    const next = harness.routeNativeElement?.querySelector('input[aria-label="Private draft"]') as HTMLInputElement;
    expect(next).not.toBe(first);
    expect(next.value).toBe('');
  });
  async function render(admin = false, events?: Subject<NavigationEnd>) {
    const session = {
      currentUser: { id: 1, display_name: 'Ada' },
      user$: of({ id: 1, display_name: 'Ada' }),
      isAdmin: () => admin,
      logout: jasmine.createSpy('logout'),
    };
    await TestBed.configureTestingModule({
      imports: [PrivateLayoutComponent],
      providers: [provideRouter([]), { provide: SessionService, useValue: session }],
    }).compileComponents();
    if (events) spyOnProperty(TestBed.inject(Router), 'events', 'get').and.returnValue(events);
    const fixture = TestBed.createComponent(PrivateLayoutComponent);
    fixture.detectChanges();
    return { fixture, session };
  }

  it('delegates page shortcuts once and guards typing, modifiers, repeats and open dialogs', async () => {
    const users = new BehaviorSubject({id: 1});
    TestBed.configureTestingModule({providers: [
      provideRouter([{path: '', component: PrivateLayoutComponent, children: [{path: 'hub', component: ShortcutPageComponent}]}]),
      {provide: SessionService, useValue: {currentUser: users.value, user$: users, isAdmin: () => false}},
    ]});
    const harness = await RouterTestingHarness.create('/hub');
    const shell = harness.routeDebugElement!.componentInstance as PrivateLayoutComponent;
    const command = harness.routeDebugElement!.query(By.directive(ShortcutPageComponent)).componentInstance as ShortcutPageComponent;
    const send = (target: Element | Document, options: KeyboardEventInit = {}) => target.dispatchEvent(new KeyboardEvent('keydown', {key: 'n', bubbles: true, ...options}));
    send(document);
    expect(command.onWorkspaceShortcut).toHaveBeenCalledTimes(1);
    send(harness.routeNativeElement!.querySelector('input')!);
    send(harness.routeNativeElement!.querySelector('[contenteditable]')!);
    for (const options of [{ctrlKey: true}, {metaKey: true}, {altKey: true}, {repeat: true}]) send(document, options);
    const modal = document.createElement('div'); modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); document.body.append(modal);
    send(document); modal.remove();
    expect(command.onWorkspaceShortcut).toHaveBeenCalledTimes(1);
    const open = spyOn(shell, 'openSearch');
    send(harness.routeNativeElement!.querySelector('input')!, {key: 'k', ctrlKey: true});
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('leaves a focused shell menu toggle alone while heading arrival is pending', fakeAsync(() => {
    const events = new Subject<NavigationEnd>();
    let fixture: ReturnType<typeof TestBed.createComponent<PrivateLayoutComponent>> | undefined;
    render(false, events).then(result => { fixture = result.fixture; });
    flushMicrotasks();
    const workspace = fixture!.nativeElement.querySelector('#workspace-content') as HTMLElement;
    const main = document.createElement('main');
    const heading = document.createElement('h1');
    heading.textContent = 'Trips';
    main.append(heading);
    workspace.append(main);
    let elapsed = 0;
    spyOn(performance, 'now').and.callFake(() => elapsed);
    events.next(new NavigationEnd(1, '/travel', '/travel'));
    flushMicrotasks();
    const toggle = fixture!.nativeElement.querySelector('.app-switcher__toggle') as HTMLButtonElement;
    const account = fixture!.nativeElement.querySelector('.user-menu-toggle') as HTMLButtonElement;
    toggle.focus();
    elapsed = 20;
    tick(20);
    expect(document.activeElement).toBe(toggle);
    toggle.click();
    fixture!.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    elapsed = 400;
    tick(400);
    expect(document.activeElement).toBe(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    events.next(new NavigationEnd(2, '/finance', '/finance'));
    flushMicrotasks();
    account.focus();
    elapsed = 420;
    tick(20);
    expect(document.activeElement).toBe(account);
    expect(account.getAttribute('aria-expanded')).not.toBe('true');
    main.remove();
  }));

  it('moves focus from the app switcher to the arrived heading', fakeAsync(() => {
    const events = new Subject<NavigationEnd>();
    let fixture: ReturnType<typeof TestBed.createComponent<PrivateLayoutComponent>> | undefined;
    render(false, events).then(result => { fixture = result.fixture; });
    flushMicrotasks();
    const workspace = fixture!.nativeElement.querySelector('#workspace-content') as HTMLElement;
    const main = document.createElement('main');
    const heading = document.createElement('h1');
    heading.textContent = 'Books';
    main.append(heading);
    workspace.append(main);
    const elapsed = 0;
    spyOn(performance, 'now').and.callFake(() => elapsed);
    const toggle = fixture!.nativeElement.querySelector('.app-switcher__toggle') as HTMLButtonElement;
    toggle.focus();
    events.next(new NavigationEnd(1, '/media/library', '/media/library'));
    flushMicrotasks();
    tick(0);
    expect(document.activeElement).toBe(heading);
    toggle.focus();
    tick(0);
    expect(document.activeElement).toBe(toggle);
    main.remove();
  }));

  it('moves focus to the arrived heading while shell menus stay idle', fakeAsync(() => {
    const events = new Subject<NavigationEnd>();
    let fixture: ReturnType<typeof TestBed.createComponent<PrivateLayoutComponent>> | undefined;
    render(false, events).then(result => { fixture = result.fixture; });
    flushMicrotasks();
    const workspace = fixture!.nativeElement.querySelector('#workspace-content') as HTMLElement;
    const main = document.createElement('main');
    const heading = document.createElement('h1');
    heading.textContent = 'Trips';
    main.append(heading);
    workspace.append(main);
    const elapsed = 0;
    spyOn(performance, 'now').and.callFake(() => elapsed);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    events.next(new NavigationEnd(1, '/travel', '/travel'));
    flushMicrotasks();
    tick(0);
    expect(document.activeElement).toBe(heading);
    main.remove();
  }));

  it('cancels pending heading focus when the shell is destroyed', fakeAsync(() => {
    const events = new Subject<NavigationEnd>();
    let fixture: ReturnType<typeof TestBed.createComponent<PrivateLayoutComponent>> | undefined;
    render(false, events).then(result => { fixture = result.fixture; });
    flushMicrotasks();
    const warn = spyOn(console, 'warn');
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    let elapsed = 0;
    spyOn(performance, 'now').and.callFake(() => elapsed);
    events.next(new NavigationEnd(1, '/travel', '/travel'));
    flushMicrotasks();
    fixture!.destroy();
    elapsed = 500;
    tick(500);
    expect(warn).not.toHaveBeenCalled();
  }));

  it('shows administration only for an administrator and signs out through the suite session', async () => {
    const { fixture, session } = await render(true);
    fixture.nativeElement.querySelector('.user-menu-toggle').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a[href="/hub/admin"]')).not.toBeNull();
    fixture.nativeElement.querySelector('#user-dropdown button').click();
    expect(session.logout).toHaveBeenCalledTimes(1);
  });

  async function renderSignedOut(url: string) {
    const session = {
      currentUser: null,
      user$: of(null),
      isAdmin: () => false,
      logout: jasmine.createSpy('logout'),
    };
    await TestBed.configureTestingModule({
      imports: [PrivateLayoutComponent],
      providers: [provideRouter([]), { provide: SessionService, useValue: session }],
    }).compileComponents();
    spyOnProperty(TestBed.inject(Router), 'url', 'get').and.returnValue(url);
    const fixture = TestBed.createComponent(PrivateLayoutComponent);
    fixture.detectChanges();
    return { fixture, session };
  }
  it('renders the shared session-ended state with the current page as the sign-in return', async () => {
    const { fixture } = await renderSignedOut('/travel/trips/42?view=map#day-2');
    const main = fixture.nativeElement.querySelector('#workspace-content main') as HTMLElement | null;
    expect(main).not.toBeNull();
    expect(main!.querySelector('h1')?.textContent?.trim()).toBe('Your session ended');
    const banner = main!.querySelector('[role="status"]') as HTMLElement | null;
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain('Your session ended. Sign in again to see your apps.');
    const signIn = main!.querySelector('a') as HTMLAnchorElement | null;
    expect(signIn).not.toBeNull();
    const href = new URL(signIn!.href);
    expect(href.pathname).toBe('/auth/login');
    expect(href.searchParams.get('next')).toBe('/travel/trips/42?view=map#day-2');
  });
  it('falls back to the Hub when the current URL is an auth page', async () => {
    const { fixture } = await renderSignedOut('/auth/login');
    expect(fixture.componentInstance.sessionEndedNext).toBe('/hub');
  });

});
