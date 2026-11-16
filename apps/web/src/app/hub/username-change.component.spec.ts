import { ComponentFixture,TestBed } from '@angular/core/testing';
import { ToastService } from '@vivek/ui';
import { UsernameChangeError,usernameChangeMessage } from '../platform/auth/username-change';
import { SessionService as AuthService } from '../platform/session.service';
import { UsernameChangeComponent } from './username-change.component';

describe('usernameChangeMessage', () => {
  it('uses the literal copy for 403, 422, 5xx, and 0', () => {
    expect(usernameChangeMessage(403)).toBe('Session expired, sign in again.');
    expect(usernameChangeMessage(422)).toBe('That username change request is invalid.');
    expect(usernameChangeMessage(500)).toBe('A server or network error prevented the change.');
    expect(usernameChangeMessage(503)).toBe('A server or network error prevented the change.');
    expect(usernameChangeMessage(0)).toBe('A server or network error prevented the change.');
  });

});

describe('UsernameChangeComponent', () => {
  let fixture: ComponentFixture<UsernameChangeComponent>;
  let auth: jasmine.SpyObj<AuthService>;
  let toast: jasmine.SpyObj<ToastService>;

  beforeEach(async () => {
    auth = jasmine.createSpyObj('AuthService', ['changeUsername']);
    toast = jasmine.createSpyObj('ToastService', ['success', 'error']);
    await TestBed.configureTestingModule({
      imports: [UsernameChangeComponent],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: ToastService, useValue: toast },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(UsernameChangeComponent);
    fixture.detectChanges();
  });

  function errorRegion(): HTMLElement {
    return fixture.nativeElement.querySelector('#username-change-error');
  }

  it('shows the session, invalid-request, and server copy', async () => {
    for (const status of [403, 422, 500, 0]) {
      auth.changeUsername.and.rejectWith(new UsernameChangeError(status));
      fixture.componentInstance.nextName = 'next.name';
      fixture.componentInstance.passphrase = 'secret-passphrase';
      fixture.componentInstance.save();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(errorRegion().textContent.trim()).toBe(usernameChangeMessage(status));
      if (status === 403 || status === 422) {
        expect(errorRegion().getAttribute('data-status')).toBe(String(status));
      }
      expect(fixture.componentInstance.passphrase).toBe('');
    }
  });

  it('focuses invalid username before passphrase and clears linked local errors on correction', async () => {
    await fixture.componentInstance.save(); fixture.detectChanges();
    const inputs = fixture.nativeElement.querySelectorAll('input') as NodeListOf<HTMLInputElement>;
    expect(document.activeElement).toBe(inputs[0]);
    expect(inputs[0].getAttribute('aria-invalid')).toBe('true');
    expect(inputs[0].getAttribute('aria-describedby')).toContain('username-change-error');
    inputs[0].value = 'next.name'; inputs[0].dispatchEvent(new Event('input')); fixture.detectChanges();
    expect(inputs[0].hasAttribute('aria-invalid')).toBeFalse();
    await fixture.componentInstance.save(); fixture.detectChanges();
    expect(document.activeElement).toBe(inputs[1]);
    expect(inputs[1].getAttribute('autocomplete')).toBe('current-password');
    expect(auth.changeUsername).not.toHaveBeenCalled();
  });

  it('preserves Retry-After from the session error and announces it politely', async () => {
    auth.changeUsername.and.rejectWith(new UsernameChangeError(429, undefined, undefined, '75'));
    fixture.componentInstance.nextName = 'next.name'; fixture.componentInstance.passphrase = 'Synthetic passphrase';
    await fixture.componentInstance.save(); fixture.detectChanges();
    expect(errorRegion().textContent).toContain('75 seconds');
    expect(errorRegion().getAttribute('aria-live')).toBe('polite');
    expect(fixture.componentInstance.passphrase).toBe('');
  });

});
