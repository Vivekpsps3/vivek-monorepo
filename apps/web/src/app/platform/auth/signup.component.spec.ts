import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthUser } from './auth.models';
import { SignupComponent } from './signup.component';
import { AuthService } from './auth.service';

describe('SignupComponent', () => {
  let fixture: ComponentFixture<SignupComponent>;
  let auth: jasmine.SpyObj<AuthService>;

  beforeEach(async () => {
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['signupPasswordless', 'signupPolicy']);
    auth.signupPolicy.and.resolveTo({ mode: 'open', signup_open: true, invite_code_required: false });
    TestBed.configureTestingModule({
      imports: [SignupComponent],
      providers: [
        { provide: AuthService, useValue: auth },
        provideRouter([]),
      ],
    });

    const router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl').and.resolveTo(true);
    fixture = TestBed.createComponent(SignupComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  function fields(): HTMLInputElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('input')) as HTMLInputElement[];
  }

  function enter(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  function submitButton(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
  }

  it('keeps submit available and explains invalid username and passphrase requirements', () => {
    expect(submitButton().disabled).toBeFalse();

    enter(fields()[1], 'ab');
    submitButton().click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#signup-error').textContent).toContain('Enter a name.');
    expect(auth.signupPasswordless).not.toHaveBeenCalled();

    enter(fields()[0], 'Vivek');
    enter(fields()[1], 'ab');
    submitButton().click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#signup-error').textContent).toContain('Username must be');
    expect(auth.signupPasswordless).not.toHaveBeenCalled();

    enter(fields()[1], 'valid.user');
    enter(fields()[2], 'short');
    submitButton().click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#signup-error').textContent).toContain('at least 12 characters');
    expect(submitButton().disabled).toBeFalse();
    expect(auth.signupPasswordless).not.toHaveBeenCalled();
  });

  it('submits values from shared inputs, shows request errors, and allows retry', async () => {
    auth.signupPasswordless.and.returnValues(
      Promise.reject(new HttpErrorResponse({ status: 409 })),
      Promise.resolve({} as AuthUser)
    );
    enter(fields()[0], 'Vivek User');
    enter(fields()[1], 'Vivek.User');
    enter(fields()[2], 'long secure passphrase');

    submitButton().click();
    fixture.detectChanges();
    expect(auth.signupPasswordless).toHaveBeenCalledOnceWith('Vivek.User', 'long secure passphrase', 'Vivek User', '');
    expect(submitButton().disabled).toBeTrue();

    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#signup-error').textContent).toContain('already registered');
    expect(submitButton().disabled).toBeFalse();

    submitButton().click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(auth.signupPasswordless).toHaveBeenCalledTimes(2);
  });

  it('hides the form when signup is closed', async () => {
    auth.signupPasswordless.calls.reset();
    auth.signupPolicy.and.resolveTo({ mode: 'closed', signup_open: false, invite_code_required: false });
    const closed = TestBed.createComponent(SignupComponent);
    closed.detectChanges();
    await closed.whenStable();
    closed.detectChanges();

    expect(closed.nativeElement.textContent).toContain('Account creation is closed');
    expect(closed.nativeElement.querySelector('button[type="submit"]')).toBeNull();
    expect(auth.signupPasswordless).not.toHaveBeenCalled();
  });
  it('focuses the first invalid field, links the error and clears it when corrected', () => {
    submitButton().click(); fixture.detectChanges();
    const input = fields()[0];
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toContain('signup-error');
    expect(fixture.nativeElement.querySelector('#signup-error').getAttribute('aria-live')).toBe('polite');
    enter(input, 'Synthetic user');
    expect(input.hasAttribute('aria-invalid')).toBeFalse();
    expect(fixture.nativeElement.querySelector('#signup-error').textContent.trim()).toBe('');
    submitButton().click(); fixture.detectChanges();
    expect(document.activeElement).toBe(fields()[1]);
    expect(fields()[1].getAttribute('aria-describedby')).toContain('-hint');
  });

  it('keeps the status region mounted while idle and while a signup is held', () => {
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain('then sign up');
    auth.signupPasswordless.and.returnValue(new Promise(() => undefined));
    enter(fields()[0], 'Synthetic'); enter(fields()[1], 'synthetic.user'); enter(fields()[2], 'Synthetic passphrase');
    submitButton().click(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain('Creating your account');
    expect(fixture.nativeElement.querySelector('form').getAttribute('aria-busy')).toBe('true');
  });

  it('announces slow local setup at 30 seconds and disposes its timers on destruction', fakeAsync(() => {
    auth.signupPasswordless.and.returnValue(new Promise(() => undefined));
    fixture.componentInstance.displayName = 'Synthetic'; fixture.componentInstance.username = 'synthetic.user'; fixture.componentInstance.password = 'Synthetic passphrase';
    fixture.componentInstance.submit();
    tick(5_000); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain('Setting up encryption');
    tick(25_000); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain("Don't close this tab");
    fixture.destroy();
  }));

});
