import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ConfirmService, type ConfirmActionOptions } from '@vivek/ui';
import { SuiteAdminComponent } from './suite-admin.component';
import { SessionService as AuthService } from '../platform/session.service';
import { AuthUser } from '../platform/auth/auth.models';

describe('SuiteAdminComponent', () => {
  let fixture: ComponentFixture<SuiteAdminComponent>;
  let http: HttpTestingController;

  const ada: AuthUser = {
    id: 2,
    email: 'ada@pending.local',
    username: 'ada',
    display_name: 'Ada',
    role: 'user',
    is_active: true,
    must_change_password: false,
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
    last_login_at: null,
  };

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

  function flush(users: AuthUser[] = []): void {
    fixture.detectChanges();
    http.expectOne('/api/admin/users').flush(users);
    http.expectOne('/api/admin/metrics').flush({
      totals: { users: users.length, active_users: users.length, active_sessions: users.length + 4 },
      finance_rows: {},
      per_user: users.map(user => ({ id: user.id, has_vault: false, encrypted_records: 0, active_sessions: 3, enrolled: false })),
      tables: [{ name: 'alembic_version', rows: 1 }],
      recent: [{ id: 9, summary: 'Someone signed in', created_at: '2026-10-21T12:00:00' }],
    });
    http.expectOne('/api/health').flush({ status: 'ok' });
    http.expectOne('/travel/api/health').flush({ status: 'ok' });
    http.expectOne('/media/api/health').flush({ status: 'down' });
    fixture.detectChanges();
  }

  it('loads people, metrics, and app health together', () => {
    flush();
    expect(fixture.componentInstance.usersLoading).toBeFalse();
    expect(fixture.componentInstance.services.map(service => service.status)).toEqual(['ok', 'ok', 'down']);
    expect(fixture.nativeElement.querySelector('a.suite-hub')).toBeNull();
    expect(fixture.nativeElement.querySelector('.desk-mark')).toBeNull();
  });

  it('shows who needs an action instead of raw table counts', () => {
    flush([ada]);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Ada has never signed in');
    expect(text).toContain('Ada has no vault');
    expect(text).toContain('Media is down');
    expect(text).toContain('leftover sign-in');
    expect(text).toContain('Member');
    expect(text).toContain('Never signed in');
    expect(text).toContain('Sign out everywhere');
    expect(text).toContain('New enrollment link');
    expect(text).toContain('Someone signed in');
    expect(text).not.toContain('alembic_version');
    expect(text).not.toContain('Encrypted rows');
  });

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

    function flushLoad(): void {
      http.expectOne('/api/admin/users').flush([]);
      http.expectOne('/api/admin/metrics').flush({ totals: {}, finance_rows: {}, per_user: [], tables: [] });
      http.expectOne('/api/health').flush({ status: 'ok' });
      http.expectOne('/travel/api/health').flush({ status: 'ok' });
      http.expectOne('/media/api/health').flush({ status: 'ok' });
    }

    it('resetUser asks for RESET {username} and posts it on confirm', async () => {
      fixture.componentInstance.resetUser(member);
      expect(confirmSpy).toHaveBeenCalled();
      expect(captured?.phrase).toBe('RESET member');
      const run = captured!.run();
      const request = http.expectOne('/api/admin/users/3/reset-contents');
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ confirm: 'RESET member' });
      request.flush({ ok: true });
      await run;
      flushLoad();
      expect(fixture.componentInstance.notice).toContain('Finance data for member was erased');
    });

    it('resetUser falls back to the email in the phrase', () => {
      fixture.componentInstance.resetUser({ ...member, username: '' });
      expect(captured?.phrase).toBe('RESET member@pending.local');
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

    it('deleteUser asks for DELETE {username}', () => {
      fixture.componentInstance.deleteUser(member);
      expect(captured?.phrase).toBe('DELETE member');
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

    it('no window.confirm or window.prompt remains', () => {
      const confirmWindowSpy = jasmine.createSpy('confirm').and.throwError('used');
      const promptSpy = jasmine.createSpy('prompt').and.throwError('used');
      spyOn(window, 'confirm').and.callFake(confirmWindowSpy);
      spyOn(window, 'prompt').and.callFake(promptSpy);
      fixture.componentInstance.resetUser(member);
      fixture.componentInstance.deleteUser(member);
      fixture.componentInstance.revokeSessions(member);
      expect(confirmWindowSpy).not.toHaveBeenCalled();
      expect(promptSpy).not.toHaveBeenCalled();
      expect(confirmSpy).toHaveBeenCalledTimes(3);
    });
  });
});
