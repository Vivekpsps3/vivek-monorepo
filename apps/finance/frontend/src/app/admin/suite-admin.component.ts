import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { apiUrl } from '../core/api-url';
import { AuthService } from '../auth/auth.service';
import { AuthUser, UserRole } from '../auth/auth.models';

interface AdminMetrics {
  totals: Record<string, number>;
  finance_rows: Record<string, number>;
  per_user: Array<Record<string, string | number | boolean>>;
  tables: Array<{ name: string; rows: number | null }>;
}

interface ServiceHealth {
  name: string;
  href: string;
  status: 'ok' | 'down';
}

@Component({
  selector: 'app-suite-admin',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './suite-admin.component.html',
  styleUrl: './suite-admin.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuiteAdminComponent implements OnInit {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);

  users: AuthUser[] = [];
  usersLoading = true;
  usersError = '';
  metrics: AdminMetrics | null = null;
  services: ServiceHealth[] = [
    { name: 'Finance', href: '/', status: 'down' },
    { name: 'Travel', href: '/travel/', status: 'down' },
    { name: 'Media', href: '/media/', status: 'down' },
  ];
  inviting = false;
  username = '';
  displayName = '';
  inviteRole: UserRole = 'user';
  inviteToken = '';
  notice = '';

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.usersLoading = true;
    this.cdr.markForCheck();
    forkJoin({
      users: this.http.get<AuthUser[]>(apiUrl('/admin/users')),
      metrics: this.http.get<AdminMetrics>(apiUrl('/admin/metrics')),
      finance: this.http.get<{ status?: string }>(apiUrl('/health')).pipe(catchError(() => of(null))),
      travel: this.http.get<{ status?: string }>('/travel/api/health').pipe(catchError(() => of(null))),
      media: this.http.get<{ status?: string }>('/media/api/health').pipe(catchError(() => of(null))),
    }).subscribe({
      next: result => {
        this.users = result.users;
        this.metrics = result.metrics;
        this.usersLoading = false;
        this.usersError = '';
        this.services = [
          { name: 'Finance', href: '/', status: result.finance?.status === 'ok' ? 'ok' : 'down' },
          { name: 'Travel', href: '/travel/', status: result.travel?.status === 'ok' ? 'ok' : 'down' },
          { name: 'Media', href: '/media/', status: result.media?.status === 'ok' ? 'ok' : 'down' },
        ];
        this.cdr.markForCheck();
      },
      error: err => {
        this.usersError = err?.error?.detail || 'Could not load the suite';
        this.usersLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  stat(key: string): number {
    return this.metrics?.totals?.[key] ?? 0;
  }

  recordsFor(user: AuthUser): number {
    const row = this.metrics?.per_user?.find(item => item['id'] === user.id);
    const count = row?.['encrypted_records'];
    return typeof count === 'number' ? count : 0;
  }

  barWidth(rows: number | null): string {
    const max = Math.max(...(this.metrics?.tables ?? []).map(table => table.rows || 0), 1);
    return `${Math.max(4, Math.round(((rows || 0) / max) * 100))}%`;
  }

  isSelf(user: AuthUser): boolean {
    return this.auth.currentUser?.id === user.id;
  }

  wouldRemoveFinalActiveAdmin(user: AuthUser): boolean {
    if (user.role !== 'admin' || !user.is_active) return false;
    return this.users.filter(candidate => candidate.role === 'admin' && candidate.is_active && candidate.id !== user.id).length === 0;
  }

  canDelete(user: AuthUser): boolean {
    return !this.isSelf(user) && !this.wouldRemoveFinalActiveAdmin(user);
  }

  toggleRole(user: AuthUser): void {
    if (this.isSelf(user) || this.wouldRemoveFinalActiveAdmin(user)) return;
    this.patchUser(user, { role: user.role === 'admin' ? 'user' : 'admin' });
  }

  toggleActive(user: AuthUser): void {
    if (this.isSelf(user) || this.wouldRemoveFinalActiveAdmin(user)) return;
    this.patchUser(user, { is_active: !user.is_active });
  }

  asText(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  toggleInviteRole(): void {
    this.inviteRole = this.inviteRole === 'admin' ? 'user' : 'admin';
  }

  startInvite(): void {
    this.inviting = true;
    this.inviteToken = '';
    this.notice = '';
  }

  createUser(): void {
    const username = this.username.trim();
    const displayName = this.displayName.trim();
    if (!username || !displayName) return;
    this.http.post<AuthUser & { enrollment_token: string }>(apiUrl('/admin/users'), {
      username,
      display_name: displayName,
      role: this.inviteRole,
    }).subscribe({
      next: user => {
        this.users = [...this.users, user].sort((a, b) => (a.username || a.email).localeCompare(b.username || b.email));
        this.inviteToken = user.enrollment_token;
        this.username = '';
        this.displayName = '';
        this.inviteRole = 'user';
        this.inviting = false;
        this.notice = '';
        this.load();
      },
      error: err => {
        this.notice = err?.error?.detail || 'Could not create that account';
        this.cdr.markForCheck();
      },
    });
  }

  deleteUser(user: AuthUser): void {
    if (!this.canDelete(user)) return;
    const label = user.username || user.email;
    if (!window.confirm(`Delete ${label}? Their encrypted finance records go with the account.`)) return;
    this.http.delete<{ ok: boolean }>(apiUrl(`/admin/users/${user.id}`)).subscribe({
      next: () => {
        this.users = this.users.filter(item => item.id !== user.id);
        this.notice = '';
        this.load();
      },
      error: err => {
        this.notice = err?.error?.detail || 'Could not delete that account';
        this.cdr.markForCheck();
      },
    });
  }

  resetUser(user: AuthUser): void {
    const expected = `RESET ${user.email}`;
    const typed = window.prompt(`Erase finance data for ${user.username || user.email}.\n\nType ${expected}`);
    if (typed !== expected) return;
    this.http.post<{ ok: boolean }>(apiUrl(`/admin/users/${user.id}/reset-contents`), { confirm: expected }).subscribe({
      next: () => {
        this.notice = '';
        this.load();
      },
      error: err => {
        this.notice = err?.error?.detail || 'Could not reset that account';
        this.cdr.markForCheck();
      },
    });
  }

  private patchUser(user: AuthUser, patch: Partial<AuthUser>): void {
    this.http.patch<AuthUser>(apiUrl(`/admin/users/${user.id}`), patch).subscribe({
      next: updated => {
        this.users = this.users.map(item => item.id === updated.id ? updated : item);
        this.notice = '';
        this.cdr.markForCheck();
      },
      error: err => {
        this.notice = err?.error?.detail || 'Could not update that account';
        this.cdr.markForCheck();
      },
    });
  }
}
