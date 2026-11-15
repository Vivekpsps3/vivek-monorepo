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

});
