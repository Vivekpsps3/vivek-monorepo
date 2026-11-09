import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { RouterTestingHarness } from '@angular/router/testing';
import { NavigationEnd, Router, RouterLink, RouterOutlet, provideRouter } from '@angular/router';
import { PrivateLayoutComponent } from './private-layout.component';
import { SessionService } from './platform/session.service';
import { BehaviorSubject, Subject, of } from 'rxjs';

@Component({standalone: true, template: '<input aria-label="Private draft" value="">'})
class PrivateDraftComponent {}

@Component({
  standalone: true,
  template: `
    <main>
      <h1>Spending</h1>
      <div role="grid" aria-label="October 2026">
        <button type="button" role="gridcell" class="day">15</button>
      </div>
    </main>
  `,
})
class GridPageComponent {}

@Component({
  standalone: true,
  template: '<main><h1>Spending</h1><button type="button">Add transaction</button></main>',
})
class ButtonPageComponent {}

@Component({
  standalone: true,
  imports: [RouterLink, RouterOutlet],
  template: `
    <nav aria-label="Finance sections"><a id="net-worth" routerLink="/finance/have">Net worth</a></nav>
    <router-outlet />
  `,
})
class SectionLayoutComponent {}

@Component({
  standalone: true,
  template: '<main><h1>What you have</h1></main>',
})
class HavePageComponent {}

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
  it('preserves a keyboard-focusable table row when the route heading arrives', async () => {
    const events = new Subject<NavigationEnd>();
    const { fixture } = await render(false, events);
    const main = document.createElement('main');
    const heading = document.createElement('h1');
    heading.textContent = 'Pixels';
    const table = document.createElement('table');
    const row = table.insertRow();
    row.tabIndex = 0;
    row.insertCell().textContent = 'Aug 15, 2026';
    main.append(heading, table);
    fixture.nativeElement.querySelector('#workspace-content').append(main);
    row.focus();

    events.next(new NavigationEnd(1, '/pixels?year=2026', '/pixels?year=2026'));
    // Route heading focus is queued as a microtask; flush that exact boundary.
    await Promise.resolve();
    expect(document.activeElement).toBe(row);
  });
  it('keeps a grid cell focused after the page heading arrives', async () => {
    const session = {
      currentUser: { id: 1, display_name: 'Ada' },
      user$: of({ id: 1, display_name: 'Ada' }),
      isAdmin: () => false,
      logout: () => undefined,
    };
    TestBed.configureTestingModule({providers: [
      provideRouter([{path: '', component: PrivateLayoutComponent, children: [{path: 'finance/spending', component: GridPageComponent}]}]),
      {provide: SessionService, useValue: session},
    ]});
    const harness = await RouterTestingHarness.create('/finance/spending');
    const cell = harness.routeNativeElement?.querySelector('[role="gridcell"]') as HTMLButtonElement;
    cell.focus();
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(document.activeElement).toBe(cell);
  });
  it('leaves a button focused after the page heading has landed', async () => {
    const session = {
      currentUser: { id: 1, display_name: 'Ada' },
      user$: of({ id: 1, display_name: 'Ada' }),
      isAdmin: () => false,
      logout: () => undefined,
    };
    TestBed.configureTestingModule({providers: [
      provideRouter([{path: '', component: PrivateLayoutComponent, children: [{path: 'finance/spending', component: ButtonPageComponent}]}]),
      {provide: SessionService, useValue: session},
    ]});
    const harness = await RouterTestingHarness.create('/finance/spending');
    const button = harness.routeNativeElement?.querySelector('main button') as HTMLButtonElement;
    button.focus();
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(document.activeElement).toBe(button);
  });
  it('moves focus from a section link to the arrived heading', async () => {
    const session = {
      currentUser: { id: 1, display_name: 'Ada' },
      user$: of({ id: 1, display_name: 'Ada' }),
      isAdmin: () => false,
      logout: () => undefined,
    };
    TestBed.configureTestingModule({providers: [
      provideRouter([{path: '', component: PrivateLayoutComponent, children: [
        {path: 'finance', component: SectionLayoutComponent, children: [
          {path: 'have', component: HavePageComponent},
        ]},
      ]}]),
      {provide: SessionService, useValue: session},
    ]});
    const harness = await RouterTestingHarness.create('/finance');
    (document.getElementById('net-worth') as HTMLAnchorElement).focus();
    await harness.navigateByUrl('/finance/have');
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(document.activeElement).toBe(document.querySelector('#workspace-content main h1'));
  });
  it('provides the app switcher and one account/theme surface', async () => {
    const { fixture } = await render();
    const apps = fixture.nativeElement.querySelector('nav[aria-label="Apps"]') as HTMLElement;
    const links = [...apps.querySelectorAll('a')].map(link => link.getAttribute('href'));
    expect(links).toEqual(['/hub', '/finance', '/travel', '/media', '/town', '/pixels']);
    expect(fixture.nativeElement.querySelector('a.suite-hub')).toBeNull();
    expect(fixture.nativeElement.querySelector('a.suite-brand')).toBeNull();
    expect(fixture.nativeElement.querySelector('a[href="/account"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('a[href="/settings"]')).toBeNull();
    const trigger = fixture.nativeElement.querySelector('.user-menu-toggle') as HTMLButtonElement;
    expect(trigger.textContent?.trim()).toBe('Ada');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    trigger.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('a[href="/settings"]').length).toBe(1);
    expect(fixture.nativeElement.querySelector('a[href="/account"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('a[href="/travel/settings"]')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('select#suite-theme').length).toBe(0);
    expect(fixture.nativeElement.querySelector('a[href="/hub/admin"]')).toBeNull();
  });
  it('shows administration only for an administrator and signs out through the suite session', async () => {
    const { fixture, session } = await render(true);
    fixture.nativeElement.querySelector('.user-menu-toggle').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a[href="/hub/admin"]')).not.toBeNull();
    fixture.nativeElement.querySelector('#user-dropdown button').click();
    expect(session.logout).toHaveBeenCalledTimes(1);
  });
  it('closes the dropdown and restores the name button on Escape', async () => {
    const { fixture } = await render();
    const button = fixture.nativeElement.querySelector('.user-menu-toggle') as HTMLButtonElement;
    button.click();
    fixture.detectChanges();
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    fixture.nativeElement.querySelector('#user-dropdown a').dispatchEvent(escape);
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(fixture.nativeElement.querySelector('#user-dropdown')).toBeNull();
    expect(document.activeElement).toBe(button);
  });
  it('keeps app identity tied to the root route', async () => {
    const { fixture } = await render();
    const router = TestBed.inject(Router);
    spyOnProperty(router, 'url', 'get').and.returnValue('/travel/trips/42');
    fixture.detectChanges();
    expect(fixture.componentInstance.appName).toBe('Travel');
    expect(fixture.componentInstance.home).toBe('/travel/');
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
  it('falls back to the Hub when the current URL is not a safe relative path', async () => {
    const { fixture } = await renderSignedOut('//attacker.example/path');
    expect(fixture.componentInstance.sessionEndedNext).toBe('/hub');
  });
  it('hides the suite-health slot only while it is empty', async () => {
    const { fixture } = await render();
    const health = fixture.nativeElement.querySelector('.suite-health') as HTMLElement;
    expect(health).not.toBeNull();
    expect(getComputedStyle(health).display).toBe('none');
    health.textContent = 'Degraded';
    expect(getComputedStyle(health).display).not.toBe('none');
  });
});
