import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { SuiteAdminComponent } from './suite-admin.component';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../auth/auth.models';

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
      per_user: users.map(user => ({ id: user.id, has_vault: false, encrypted_records: 0 })),
      tables: [{ name: 'alembic_version', rows: 1 }],
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
    expect(text).not.toContain('alembic_version');
    expect(text).not.toContain('Encrypted rows');
  });
});
