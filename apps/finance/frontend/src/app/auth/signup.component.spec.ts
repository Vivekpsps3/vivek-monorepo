import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
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

    enter(fields()[0], 'ab');
    submitButton().click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Username must be');
    expect(auth.signupPasswordless).not.toHaveBeenCalled();

    enter(fields()[0], 'valid.user');
    enter(fields()[1], 'short');
    submitButton().click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('at least 12 characters');
    expect(submitButton().disabled).toBeFalse();
    expect(auth.signupPasswordless).not.toHaveBeenCalled();
  });

  it('submits values from shared inputs, shows request errors, and allows retry', async () => {
    auth.signupPasswordless.and.returnValues(
      Promise.reject(new Error('Username is already registered')),
      Promise.resolve({} as AuthUser)
    );
    enter(fields()[0], 'Vivek.User');
    enter(fields()[1], 'long secure passphrase');

    submitButton().click();
    fixture.detectChanges();
    expect(auth.signupPasswordless).toHaveBeenCalledOnceWith('Vivek.User', 'long secure passphrase', '', '');
    expect(submitButton().disabled).toBeTrue();

    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('already registered');
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
});
