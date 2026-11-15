import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController,provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture,TestBed } from '@angular/core/testing';
import { ConfirmService,ToastService } from '@vivek/ui';
import { ProfileSettingsComponent } from './profile-settings.component';

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

  it('remove does nothing when the confirm is cancelled', async () => {
    confirm.ask.and.resolveTo(false);
    load({ birthday: '1990-05-04', show_age: false });
    await fixture.whenStable();
    await component.remove();
    http.expectNone('/api/account/birthday');
    expect(component.savedBirthday).toBe('1990-05-04');
  });

});
