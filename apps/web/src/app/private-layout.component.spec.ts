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
  it('provides exactly one labeled Hub link and one account/theme surface', async () => {
    const { fixture } = await render();
    expect(fixture.nativeElement.querySelectorAll('a.suite-hub').length).toBe(1);
    expect(fixture.nativeElement.querySelector('a.suite-hub').getAttribute('href')).toBe('/hub');
    expect(fixture.nativeElement.querySelectorAll('a[href="/account"]').length).toBe(1);
    expect(fixture.nativeElement.querySelectorAll('select[aria-label="Color theme"]').length).toBe(1);
    expect(fixture.nativeElement.querySelector('a[href="/hub/admin"]')).toBeNull();
  });
  it('shows administration only for an administrator and signs out through the suite session', async () => {
    const { fixture, session } = await render(true);
    expect(fixture.nativeElement.querySelector('a[href="/hub/admin"]')).not.toBeNull();
    fixture.nativeElement.querySelector('button').click();
    expect(session.logout).toHaveBeenCalledTimes(1);
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
