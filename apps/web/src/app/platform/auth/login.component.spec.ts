import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { LoginComponent } from './login.component';
import { AuthService } from './auth.service';

describe('LoginComponent', () => {
  it('marks for check when passwordless setup begins and fails asynchronously', async () => {
    const auth = jasmine.createSpyObj('AuthService', ['bootstrapPasswordless', 'bootstrapStatus', 'signupPolicy']);
    auth.bootstrapStatus.and.returnValue(of({ needs_setup: false }));
    auth.signupPolicy.and.resolveTo({ mode: 'closed', signup_open: false, invite_code_required: false });
    auth.bootstrapPasswordless.and.returnValue(Promise.reject(new Error('Setup failed')));
    TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        { provide: AuthService, useValue: auth },
        provideRouter([]),
      ],
    });
    const router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl').and.resolveTo(true);
    const fixture: ComponentFixture<LoginComponent> = TestBed.createComponent(LoginComponent);
    const component = fixture.componentInstance;
    const cdr = (component as any).cdr as jasmine.SpyObj<{ markForCheck(): void }>;
    spyOn(cdr, 'markForCheck');
    component.setupMode = true;
    component.username = 'admin';
    component.displayName = 'Admin';
    component.password = 'long enough passphrase';

    component.submit();
    await Promise.resolve();
    await Promise.resolve();

    expect(component.error).toBe('Setup failed');
    expect(cdr.markForCheck).toHaveBeenCalled();
  });

  it('submits an email-shaped username to vault sign-in', async () => {
    const auth = jasmine.createSpyObj('AuthService', ['bootstrapStatus', 'signupPolicy', 'loginWithVault']);
    auth.bootstrapStatus.and.returnValue(of({ needs_setup: false }));
    auth.signupPolicy.and.resolveTo({ mode: 'closed', signup_open: false, invite_code_required: false });
    auth.loginWithVault.and.returnValue(new Promise(() => undefined));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        { provide: AuthService, useValue: auth },
        provideRouter([]),
      ],
    });
    const fixture: ComponentFixture<LoginComponent> = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Use your enrolled username');
    expect(fixture.nativeElement.textContent).not.toContain('email linked');
    fixture.componentInstance.username = 'legacy.user@example.com';
    fixture.componentInstance.password = 'correct horse battery staple';
    fixture.componentInstance.submit();
    expect(fixture.componentInstance.error).toBe('');
    expect(auth.loginWithVault).toHaveBeenCalledWith(
      'legacy.user@example.com',
      'correct horse battery staple',
    );
  });
});
