import { ComponentFixture, TestBed } from '@angular/core/testing';
import { usernameForStorage } from '@vivek/auth';
import { ToastService } from '@vivek/ui';
import { AuthService } from '../auth/auth.service';
import { UsernameChangeError, usernameChangeMessage } from '../auth/username-change';
import { UsernameChangeComponent } from './username-change.component';

describe('usernameForStorage', () => {
  it('lowercases and uses the server pattern', () => {
    expect(usernameForStorage('New.Name')).toBe('new.name');
    expect(usernameForStorage('ab')).toBeNull();
    expect(usernameForStorage('a'.repeat(65))).toBeNull();
    expect(usernameForStorage('has space')).toBeNull();
    expect(usernameForStorage('ok_name-1')).toBe('ok_name-1');
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

  it('labels the fields and announces errors in a live region', () => {
    const labels = [...fixture.nativeElement.querySelectorAll('label')].map(label => label.textContent.trim());
    expect(labels).toEqual(['New username', 'Current passphrase']);
    expect(fixture.nativeElement.querySelector('input[type="password"]')).not.toBeNull();
    expect(errorRegion().getAttribute('aria-live')).toBe('assertive');
    expect(errorRegion().getAttribute('role')).toBe('alert');
    expect(fixture.nativeElement.querySelector('button[type="submit"]').textContent.trim()).toBe('Save');
  });

  it('shows the status copy and clears the passphrase after a failure', async () => {
    auth.changeUsername.and.rejectWith(new UsernameChangeError(401));
    fixture.componentInstance.nextName = 'next.name';
    fixture.componentInstance.passphrase = 'secret-passphrase';
    fixture.detectChanges();

    fixture.componentInstance.save();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(errorRegion().textContent.trim()).toBe(usernameChangeMessage(401));
    expect(errorRegion().getAttribute('data-status')).toBe('401');
    expect(fixture.componentInstance.passphrase).toBe('');
    expect(fixture.nativeElement.querySelector('input[type="password"]').value).toBe('');
    expect(toast.success).not.toHaveBeenCalled();
    expect(JSON.stringify(localStorage)).not.toContain('secret-passphrase');
    expect(JSON.stringify(sessionStorage)).not.toContain('secret-passphrase');
  });

  it('shows a taken name, a rate limit, and an invalid name', async () => {
    for (const status of [409, 429, 400]) {
      auth.changeUsername.and.rejectWith(new UsernameChangeError(status));
      fixture.componentInstance.nextName = 'next.name';
      fixture.componentInstance.passphrase = 'secret-passphrase';
      fixture.componentInstance.save();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(errorRegion().textContent.trim()).toBe(usernameChangeMessage(status));
      expect(errorRegion().getAttribute('data-status')).toBe(String(status));
      expect(fixture.componentInstance.passphrase).toBe('');
    }
  });

  it('toasts on success and clears the passphrase', async () => {
    auth.changeUsername.and.resolveTo({ username: 'next.name' } as never);
    fixture.componentInstance.nextName = 'Next.Name';
    fixture.componentInstance.passphrase = 'secret-passphrase';
    fixture.componentInstance.save();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(toast.success).toHaveBeenCalledWith('Username updated.');
    expect(errorRegion().textContent.trim()).toBe('');
    expect(fixture.componentInstance.passphrase).toBe('');
    expect(fixture.componentInstance.nextName).toBe('');
    expect(JSON.stringify(localStorage)).not.toContain('secret-passphrase');
    expect(JSON.stringify(sessionStorage)).not.toContain('secret-passphrase');
  });
});
