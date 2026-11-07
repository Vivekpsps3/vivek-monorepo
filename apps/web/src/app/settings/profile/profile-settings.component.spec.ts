import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpErrorResponse } from '@angular/common/http';
import { ConfirmService, ToastService } from '@vivek/ui';
import { ProfileSettingsComponent, validateBirthday } from './profile-settings.component';

describe('validateBirthday (PF6)', () => {
  const today = new Date(2026, 10, 6); // 2026-11-06 local

  it('accepts a real past date', () => {
    expect(validateBirthday('1990-05-04', today)).toBeNull();
  });

  it('rejects empty and partial input with the full-date message', () => {
    expect(validateBirthday('', today)).toBe('Enter a full date.');
    expect(validateBirthday('1990-05', today)).toBe('Enter a full date.');
    expect(validateBirthday('2026-02-30', today)).toBe('Enter a full date.');
  });

  it('rejects pre-1900 dates with the year message', () => {
    expect(validateBirthday('1899-12-31', today)).toBe('Enter a year after 1900.');
    expect(validateBirthday('1900-01-01', today)).toBeNull();
  });

  it('rejects future dates with the future message, allowing one day of slack', () => {
    expect(validateBirthday('2026-11-07', today)).toBeNull();
    expect(validateBirthday('2026-11-08', today)).toBe("Birthday can't be in the future.");
  });
});

describe('ProfileSettingsComponent (PF6)', () => {
  let fixture: ComponentFixture<ProfileSettingsComponent>;
  let component: ProfileSettingsComponent;
  let http: HttpTestingController;
  let toast: jasmine.SpyObj<ToastService>;
  let confirm: { ask: jasmine.Spy };

  beforeEach(async () => {
    toast = jasmine.createSpyObj('ToastService', ['success', 'error']);
    confirm = { ask: jasmine.createSpy('ask').and.resolveTo(true) };
    await TestBed.configureTestingModule({
      imports: [ProfileSettingsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ToastService, useValue: toast },
        { provide: ConfirmService, useValue: confirm },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ProfileSettingsComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => http.verify());

  function load(view: { birthday: string | null; show_age: boolean }): void {
    fixture.detectChanges();
    http.expectOne('/api/account/birthday').flush(view);
  }

  function text(): string { return (fixture.nativeElement as HTMLElement).textContent ?? ''; }

  it('loads the saved birthday into the form under the #birthday anchor', async () => {
    load({ birthday: '1990-05-04', show_age: true });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.birthdayInput).toBe('1990-05-04');
    expect(component.showAge).toBeTrue();
    expect(fixture.nativeElement.querySelector('#birthday')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('input[type="date"]')).not.toBeNull();
    expect(text()).toContain('Show my age on Life in Pixels');
  });

  it('saves and toasts "Birthday saved." without the date', async () => {
    load({ birthday: null, show_age: false });
    component.birthdayInput = '1990-05-04';
    const saving = component.save();
    const req = http.expectOne('/api/account/birthday');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ birthday: '1990-05-04', show_age: false });
    req.flush({ birthday: '1990-05-04', show_age: false });
    await saving;
    expect(toast.success).toHaveBeenCalledWith('Birthday saved.');
    expect(toast.success.calls.mostRecent().args.join(' ')).not.toContain('1990-05-04');
    expect(component.savedBirthday).toBe('1990-05-04');
  });

  it('blocks a future birthday client-side with the verbatim message and aria-invalid', async () => {
    load({ birthday: null, show_age: false });
    component.birthdayInput = '2999-01-01';
    await component.save();
    http.expectNone('/api/account/birthday', 'no PATCH for an invalid date');
    fixture.detectChanges();
    expect(component.error).toBe("Birthday can't be in the future.");
    expect(component.invalid).toBeTrue();
    const alert = fixture.nativeElement.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("Birthday can't be in the future.");
  });

  it('shows the server 422 detail verbatim', async () => {
    load({ birthday: null, show_age: false });
    component.birthdayInput = '1990-05-04';
    const saving = component.save();
    http.expectOne('/api/account/birthday').flush(
      { detail: 'Enter a year after 1900.' },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await saving;
    expect(component.error).toBe('Enter a year after 1900.');
    expect(component.invalid).toBeTrue();
  });

  it('remove asks first, then PATCHes null and clears the form', async () => {
    load({ birthday: '1990-05-04', show_age: true });
    await fixture.whenStable();
    const removing = component.remove();
    await Promise.resolve();
    expect(confirm.ask).toHaveBeenCalled();
    const req = http.expectOne('/api/account/birthday');
    expect(req.request.body).toEqual({ birthday: null, show_age: true });
    req.flush({ birthday: null, show_age: true });
    await removing;
    expect(component.savedBirthday).toBeNull();
    expect(component.birthdayInput).toBe('');
  });

  it('remove does nothing when the confirm is cancelled', async () => {
    confirm.ask.and.resolveTo(false);
    load({ birthday: '1990-05-04', show_age: false });
    await fixture.whenStable();
    await component.remove();
    http.expectNone('/api/account/birthday');
    expect(component.savedBirthday).toBe('1990-05-04');
  });

  it('handles a non-422 failure without leaking the date', async () => {
    load({ birthday: null, show_age: false });
    component.birthdayInput = '1990-05-04';
    const saving = component.save();
    http.expectOne('/api/account/birthday').error(new ProgressEvent('error'), { status: 500, statusText: 'Server Error' } as any);
    await saving;
    expect(component.error).toBe("Birthday couldn't be saved.");
    expect(component.error).not.toContain('1990-05-04');
    expect(new HttpErrorResponse({}).status).toBe(0);
  });
});
