import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { SuiteAdminComponent } from './suite-admin.component';
import { AuthService } from '../auth/auth.service';

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
        { provide: AuthService, useValue: { currentUser: null } },
      ],
    });
    fixture = TestBed.createComponent(SuiteAdminComponent);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads people, metrics, and app health together', () => {
    fixture.detectChanges();
    http.expectOne('/api/admin/users').flush([]);
    http.expectOne('/api/admin/metrics').flush({ totals: { users: 1 }, finance_rows: {}, per_user: [], tables: [] });
    http.expectOne('/api/health').flush({ status: 'ok' });
    http.expectOne('/travel/api/health').flush({ status: 'ok' });
    http.expectOne('/media/api/health').flush({ status: 'down' });

    expect(fixture.componentInstance.usersLoading).toBeFalse();
    expect(fixture.componentInstance.services.map(service => service.status)).toEqual(['ok', 'ok', 'down']);
  });
});
