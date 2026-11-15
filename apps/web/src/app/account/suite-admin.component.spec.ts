import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController,provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture,TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ConfirmService,type ConfirmActionOptions } from '@vivek/ui';
import { AuthUser } from '../platform/auth/auth.models';
import { SessionService as AuthService } from '../platform/session.service';
import { SuiteAdminComponent } from './suite-admin.component';

describe('SuiteAdminComponent', () => {
  let fixture: ComponentFixture<SuiteAdminComponent>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SuiteAdminComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AuthService, useValue: { currentUser: { id: 1, role: 'admin' } } },
      ],
    });
    fixture = TestBed.createComponent(SuiteAdminComponent);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('destructive confirms', () => {
    let confirmService: ConfirmService;
    let captured: ConfirmActionOptions | undefined;
    let confirmSpy: jasmine.Spy;

    const member: AuthUser = {
      id: 3,
      email: 'member@pending.local',
      username: 'member',
      display_name: 'Member',
      role: 'user',
      is_active: true,
      must_change_password: false,
      created_at: '2026-01-01T00:00:00',
      updated_at: '2026-01-01T00:00:00',
      last_login_at: null,
    };
    const self: AuthUser = { ...member, id: 1, username: 'owner', email: 'owner@pending.local', role: 'admin' };

    beforeEach(() => {
      confirmService = TestBed.inject(ConfirmService);
      captured = undefined;
      confirmSpy = spyOn(confirmService, 'confirmAction').and.callFake(options => {
        captured = options;
        return Promise.resolve(true);
      });
    });

    it('cancelled reset sends nothing and keeps the notice', async () => {
      confirmSpy.and.resolveTo(false);
      fixture.componentInstance.notice = 'Earlier notice';
      fixture.componentInstance.resetUser(member);
      await Promise.resolve();
      http.expectNone('/api/admin/users/3/reset-contents');
      expect(fixture.componentInstance.notice).toBe('Earlier notice');
    });

    it('deleteUser does not open a dialog when deletion is locked', () => {
      fixture.componentInstance.deleteUser(self);
      expect(confirmSpy).not.toHaveBeenCalled();
    });

    it('revokeSessions uses the self copy for the current user', () => {
      fixture.componentInstance.revokeSessions(self);
      expect(captured?.title).toBe('Sign out every other device?');
      expect(captured?.message).toContain('This browser stays signed in');
      expect(captured?.phrase).toBeUndefined();
    });

    it('a failed run never writes server detail to the notice', async () => {
      fixture.componentInstance.resetUser(member);
      const run = captured!.run() as Promise<unknown>;
      http.expectOne('/api/admin/users/3/reset-contents').flush({ detail: 'SQL boom' }, { status: 500, statusText: 'Server Error' });
      await run.then(
        () => fail('run should reject'),
        () => undefined,
      );
      expect(fixture.componentInstance.notice).not.toContain('SQL boom');
    });

  });
});
