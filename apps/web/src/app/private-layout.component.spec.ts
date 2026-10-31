import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { RouterTestingHarness } from '@angular/router/testing';
import { Router, provideRouter } from '@angular/router';
import { PrivateLayoutComponent } from './private-layout.component';
import { SessionService } from './platform/session.service';
import { BehaviorSubject, of } from 'rxjs';

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
  async function render(admin = false) {
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
    const fixture = TestBed.createComponent(PrivateLayoutComponent);
    fixture.detectChanges();
    return { fixture, session };
  }
  it('provides the app switcher and one account/theme surface', async () => {
    const { fixture } = await render();
    const apps = fixture.nativeElement.querySelector('nav[aria-label="Apps"]') as HTMLElement;
    const links = [...apps.querySelectorAll('a')].map(link => link.getAttribute('href'));
    expect(links).toEqual(['/hub', '/finance', '/travel', '/media']);
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
    expect(fixture.nativeElement.querySelectorAll('select#suite-theme').length).toBe(1);
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
});
