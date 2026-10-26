import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { UiIconComponent, UiIconName } from '@vivek/ui';
import { apiUrl } from '../core/api-url';
import { SuiteHubLinkComponent } from '../core/layout/suite-hub-link.component';
import { silentErrorToast } from '../core/http-error.interceptor';
import { AuthService } from '../auth/auth.service';
import { AuthUser, UserRole } from '../auth/auth.models';

interface AdminMetrics {
  totals: Record<string, number>;
  finance_rows: Record<string, number>;
  per_user: Array<Record<string, string | number | boolean | null>>;
  tables: Array<{ name: string; rows: number | null }>;
  recent?: Array<{ id: number; summary: string; created_at?: string | null }>;
}

interface ServiceHealth {
  name: string;
  href: string;
  icon: UiIconName;
  status: 'ok' | 'down';
}

export interface AttentionItem {
  id: string;
  icon: UiIconName;
  title: string;
  detail: string;
  href?: string;
  action?: string;
}

@Component({
  selector: 'app-suite-admin',
  standalone: true,
  imports: [UiIconComponent, SuiteHubLinkComponent],
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
    { name: 'Finance', href: '/', icon: 'wallet', status: 'down' },
    { name: 'Travel', href: '/travel/', icon: 'calendar', status: 'down' },
    { name: 'Media', href: '/media/', icon: 'spark', status: 'down' },
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
      users: this.http.get<AuthUser[]>(apiUrl('/admin/users'), { context: silentErrorToast() }),
      metrics: this.http.get<AdminMetrics>(apiUrl('/admin/metrics'), { context: silentErrorToast() }),
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
          { name: 'Finance', href: '/', icon: 'wallet', status: result.finance?.status === 'ok' ? 'ok' : 'down' },
          { name: 'Travel', href: '/travel/', icon: 'calendar', status: result.travel?.status === 'ok' ? 'ok' : 'down' },
          { name: 'Media', href: '/media/', icon: 'spark', status: result.media?.status === 'ok' ? 'ok' : 'down' },
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

  attention(): AttentionItem[] {
    const items: AttentionItem[] = [];
    for (const service of this.services) {
      if (service.status !== 'down') continue;
      items.push({
        id: `down-${service.name}`,
        icon: 'alert',
        title: `${service.name} is down`,
        detail: 'Open it and check that the app is running.',
        href: service.href,
        action: `Open ${service.name}`,
      });
    }

    const never = this.users.filter(user => !user.last_login_at);
    if (never.length === 1) {
      items.push({
        id: 'never',
        icon: 'users',
        title: `${this.label(never[0])} has never signed in`,
        detail: 'Send them the enrollment link from their row. It works once, for 24 hours.',
      });
    } else if (never.length > 1) {
      items.push({
        id: 'never',
        icon: 'users',
        title: `${never.length} people have never signed in`,
        detail: never.map(user => this.label(user)).join(', '),
      });
    }

    const missingVault = this.users.filter(user => user.is_active && !this.hasVault(user));
    if (missingVault.length === 1) {
      items.push({
        id: 'vault',
        icon: 'shield',
        title: `${this.label(missingVault[0])} has no vault`,
        detail: 'Finance stays empty until they finish enrollment on their own device.',
      });
    } else if (missingVault.length > 1) {
      items.push({
        id: 'vault',
        icon: 'shield',
        title: `${missingVault.length} people have no vault`,
        detail: missingVault.map(user => this.label(user)).join(', '),
      });
    }

    const disabled = this.users.filter(user => !user.is_active);
    if (disabled.length) {
      items.push({
        id: 'disabled',
        icon: 'users',
        title: disabled.length === 1 ? `${this.label(disabled[0])} is disabled` : `${disabled.length} accounts are disabled`,
        detail: 'Disabled accounts cannot sign in. Enable one from their row if they should come back.',
      });
    }

    const openSessions = this.metrics?.totals?.['active_sessions'] ?? 0;
    const activePeople = this.users.filter(user => user.is_active).length;
    if (activePeople > 0 && openSessions > activePeople) {
      const extra = openSessions - activePeople;
      items.push({
        id: 'sessions',
        icon: 'alert',
        title: extra === 1 ? '1 leftover sign-in is still open' : `${extra} leftover sign-ins are still open`,
        detail: `${openSessions} sessions are open for ${activePeople} ${activePeople === 1 ? 'person' : 'people'}. Sign out other devices on their row. Their vault stays.`,
      });
    }

    return items;
  }

  label(user: AuthUser): string {
    return user.display_name || user.username || user.email;
  }

  handle(user: AuthUser): string {
    return user.username || user.email;
  }

  initial(user: AuthUser): string {
    return (this.label(user).trim().charAt(0) || '?').toUpperCase();
  }

  hasVault(user: AuthUser): boolean {
    return this.userRow(user)?.['has_vault'] === true;
  }

  userRow(user: AuthUser): Record<string, string | number | boolean | null> | undefined {
    return this.metrics?.per_user?.find(item => item['id'] === user.id);
  }

  sessionCount(user: AuthUser): number | null {
    const count = this.userRow(user)?.['active_sessions'];
    return typeof count === 'number' ? count : null;
  }

  showSignOut(user: AuthUser): boolean {
    const count = this.sessionCount(user);
    if (count == null) return false;
    return this.isSelf(user) ? count > 1 : count > 0;
  }

  canReissue(user: AuthUser): boolean {
    if (this.hasVault(user)) return false;
    const enrolled = this.userRow(user)?.['enrolled'];
    return enrolled !== true;
  }

  enrollmentLink(): string {
    if (!this.inviteToken || typeof location === 'undefined') return '';
    return `${location.origin}/auth/signup?invite=${encodeURIComponent(this.inviteToken)}`;
  }

  recent(): Array<{ id: number; summary: string; created_at?: string | null }> {
    return this.metrics?.recent ?? [];
  }

  when(iso: string | null | undefined): string {
    if (!iso) return '';
    const then = new Date(iso);
    if (Number.isNaN(then.getTime())) return '';
    return then.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  recordsFor(user: AuthUser): number {
    const count = this.userRow(user)?.['encrypted_records'];
    return typeof count === 'number' ? count : 0;
  }

  recordsLabel(user: AuthUser): string {
    const count = this.recordsFor(user);
    if (count === 0) return 'No finance records';
    return count === 1 ? '1 finance record' : `${count} finance records`;
  }

  signedInLabel(user: AuthUser): string {
    if (!user.last_login_at) return 'Never signed in';
    const then = new Date(user.last_login_at);
    if (Number.isNaN(then.getTime())) return 'Never signed in';
    const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);
    if (days <= 0) return 'Signed in today';
    if (days === 1) return 'Signed in yesterday';
    if (days < 30) return `Signed in ${days} days ago`;
    return `Last signed in ${then.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
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

  roleLockReason(user: AuthUser): string | null {
    const reasons = [
      this.isSelf(user) ? "You can't change your own role or access." : null,
      this.wouldRemoveFinalActiveAdmin(user) ? "This is the only active admin, so the role and access stay as they are." : null,
    ].filter((reason): reason is string => reason != null);
    return reasons.length ? reasons.join(' ') : null;
  }

  deleteLockReason(user: AuthUser): string | null {
    if (this.isSelf(user)) return "You can't delete your own account.";
    if (this.wouldRemoveFinalActiveAdmin(user)) return "This is the only active admin, so the role and access stay as they are.";
    return null;
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
    }, { context: silentErrorToast() }).subscribe({
      next: user => {
        this.users = [...this.users, user].sort((a, b) => (a.username || a.email).localeCompare(b.username || b.email));
        this.inviteToken = user.enrollment_token;
        this.username = '';
        this.displayName = '';
        this.inviteRole = 'user';
        this.inviting = false;
        this.notice = 'Account created. Send them the enrollment link. It works once, for 24 hours.';
        this.load();
      },
      error: err => {
        this.notice = err?.error?.detail || 'Could not create that account';
        this.cdr.markForCheck();
      },
    });
  }

  copyLink(): void {
    const link = this.enrollmentLink();
    if (!link) return;
    const done = () => {
      this.notice = 'Enrollment link copied. It works once, for 24 hours.';
      this.cdr.markForCheck();
    };
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(link).then(done, () => {
        this.notice = 'Select the link and copy it.';
        this.cdr.markForCheck();
      });
      return;
    }
    this.notice = 'Select the link and copy it.';
    this.cdr.markForCheck();
  }

  reissue(user: AuthUser): void {
    this.http.post<AuthUser & { enrollment_token: string }>(apiUrl(`/admin/users/${user.id}/enrollment`), {}, { context: silentErrorToast() }).subscribe({
      next: updated => {
        this.inviteToken = updated.enrollment_token;
        this.notice = `Enrollment link for ${this.handle(user)} is ready. It replaces any older link.`;
        this.cdr.markForCheck();
        this.load();
      },
      error: err => {
        this.notice = err?.error?.detail || 'Could not make a new enrollment link';
        this.cdr.markForCheck();
      },
    });
  }

  revokeSessions(user: AuthUser): void {
    const prompt = this.isSelf(user)
      ? 'Sign out every other device? This browser stays signed in, and the vault stays.'
      : `Sign ${this.handle(user)} out everywhere? Their vault stays.`;
    if (!window.confirm(prompt)) return;
    this.http.post<{ ok: boolean; revoked: number }>(apiUrl(`/admin/users/${user.id}/revoke-sessions`), {}, { context: silentErrorToast() }).subscribe({
      next: result => {
        this.notice = result.revoked
          ? `Signed out ${result.revoked} ${result.revoked === 1 ? 'session' : 'sessions'}.`
          : 'No other sessions were open.';
        this.load();
      },
      error: err => {
        this.notice = err?.error?.detail || 'Could not sign that account out';
        this.cdr.markForCheck();
      },
    });
  }

  deleteUser(user: AuthUser): void {
    if (!this.canDelete(user)) return;
    const label = this.handle(user);
    if (!window.confirm(`Delete ${label}? Their encrypted finance records go with the account.`)) return;
    this.http.delete<{ ok: boolean }>(apiUrl(`/admin/users/${user.id}`), { context: silentErrorToast() }).subscribe({
      next: () => {
        this.users = this.users.filter(item => item.id !== user.id);
        this.notice = `${label} was deleted.`;
        this.load();
      },
      error: err => {
        this.notice = err?.error?.detail || 'Could not delete that account';
        this.cdr.markForCheck();
      },
    });
  }

  resetUser(user: AuthUser): void {
    const expected = `RESET ${user.username || user.email}`;
    const typed = window.prompt(`Erase finance data for ${this.handle(user)}.\n\nType ${expected}`);
    if (typed !== expected) return;
    this.http.post<{ ok: boolean }>(apiUrl(`/admin/users/${user.id}/reset-contents`), { confirm: expected }, { context: silentErrorToast() }).subscribe({
      next: () => {
        this.notice = `Finance data for ${this.handle(user)} was erased, and their sessions were signed out.`;
        this.load();
      },
      error: err => {
        this.notice = err?.error?.detail || 'Could not reset that account';
        this.cdr.markForCheck();
      },
    });
  }

  private patchUser(user: AuthUser, patch: Partial<AuthUser>): void {
    this.http.patch<AuthUser>(apiUrl(`/admin/users/${user.id}`), patch, { context: silentErrorToast() }).subscribe({
      next: updated => {
        this.users = this.users.map(item => item.id === updated.id ? updated : item);
        this.notice = `${this.label(updated)} updated.`;
        this.cdr.markForCheck();
      },
      error: err => {
        this.notice = err?.error?.detail || 'Could not update that account';
        this.cdr.markForCheck();
      },
    });
  }
}
