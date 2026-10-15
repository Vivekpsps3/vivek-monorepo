import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { apiUrl } from '../../core/api-url';
import { AuthService } from '../../auth/auth.service';
import { AuthUser, UserRole } from '../../auth/auth.models';
import { UiButtonComponent, UiDataTableComponent, UiInputComponent, UiPageHeaderComponent } from '@vivek/ui';

interface AdminMetrics {
  totals: Record<string, number>;
  finance_rows: Record<string, number>;
  per_user: Array<Record<string, string | number | boolean>>;
  tables: Array<{ name: string; rows: number | null }>;
}

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [FormsModule, UiButtonComponent, UiDataTableComponent, UiInputComponent, UiPageHeaderComponent],
  templateUrl: './admin-users.component.html',
  styleUrl: './admin-users.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminUsersComponent implements OnInit {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);

  users: AuthUser[] = [];
  usersLoading = false;
  usersError = '';
  usersMessage = '';
  createError = '';
  createMessage = '';
  error = '';
  message = '';
  metrics: AdminMetrics | null = null;
  username = '';
  displayName = '';
  role: UserRole = 'user';

  ngOnInit(): void {
    this.loadUsers();
    this.loadMetrics();
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

  loadUsers(): void {
    this.usersLoading = true;
    this.usersError = '';
    this.cdr.markForCheck();
    this.http.get<AuthUser[]>(apiUrl('/admin/users')).subscribe({
      next: users => {
        this.users = users;
        this.usersLoading = false;
        this.cdr.markForCheck();
      },
      error: err => {
        this.usersError = err?.error?.detail || 'Could not load users';
        this.usersLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  loadMetrics(): void {
    this.http.get<AdminMetrics>(apiUrl('/admin/metrics')).subscribe({
      next: metrics => { this.metrics = metrics; this.cdr.markForCheck(); },
      error: err => { this.error = err?.error?.detail || 'Could not load metrics'; this.cdr.markForCheck(); },
    });
  }

  createUser(): void {
    if (!this.username.trim() || !this.displayName.trim()) return;
    this.createError = '';
    this.createMessage = '';
    this.http.post<AuthUser & { enrollment_token: string }>(apiUrl('/admin/users'), {
      username: this.username,
      display_name: this.displayName,
      role: this.role,
    }).subscribe({
      next: user => {
        this.users = [...this.users, user].sort((a, b) => a.email.localeCompare(b.email));
        this.username = '';
        this.displayName = '';
        this.role = 'user';
        this.createMessage = `Invitation created. Share /auth/signup?token=${user.enrollment_token} (or the token alone) securely.`;
        this.loadMetrics();
        this.cdr.markForCheck();
      },
      error: err => { this.createError = err?.error?.detail || 'Could not create user'; this.cdr.markForCheck(); },
    });
  }

  setActive(user: AuthUser, isActive: boolean): void {
    this.patchUser(user, { is_active: isActive });
  }

  setRole(user: AuthUser, role: UserRole): void {
    this.patchUser(user, { role });
  }

  deleteUser(user: AuthUser): void {
    if (!this.canDelete(user)) {
      this.usersError = this.isSelf(user) ? 'You cannot delete your own account' : 'Cannot remove the final active admin';
      return;
    }
    const ok = window.confirm(`Delete ${user.email} and all finance data owned by this account?`);
    if (!ok) return;
    this.usersError = '';
    this.usersMessage = '';
    this.http.delete<{ ok: boolean }>(apiUrl(`/admin/users/${user.id}`)).subscribe({
      next: () => {
        this.users = this.users.filter(u => u.id !== user.id);
        this.usersMessage = 'User deleted';
        this.loadMetrics();
        this.cdr.markForCheck();
      },
      error: err => { this.usersError = err?.error?.detail || 'Could not delete user'; this.cdr.markForCheck(); },
    });
  }

  resetUserContents(user: AuthUser): void {
    const expected = `RESET ${user.email}`;
    const typed = window.prompt(`This keeps ${user.email} but deletes their finance, tax, import, planning, income, fixed expense, and subscription data.\n\nType ${expected} to continue.`);
    if (typed !== expected) {
      this.usersError = 'Reset cancelled';
      return;
    }
    this.usersError = '';
    this.usersMessage = '';
    this.http.post<{ ok: boolean }>(apiUrl(`/admin/users/${user.id}/reset-contents`), {
      confirm: expected,
    }).subscribe({
      next: () => {
        this.usersMessage = 'User contents reset';
        this.loadMetrics();
        this.cdr.markForCheck();
      },
      error: err => { this.usersError = err?.error?.detail || 'Could not reset user contents'; this.cdr.markForCheck(); },
    });
  }

  private patchUser(user: AuthUser, patch: Partial<AuthUser>): void {
    this.usersError = '';
    this.usersMessage = '';
    this.http.patch<AuthUser>(apiUrl(`/admin/users/${user.id}`), patch).subscribe({
      next: updated => {
        this.users = this.users.map(u => u.id === updated.id ? updated : u);
        this.usersMessage = 'User updated';
        this.loadMetrics();
        this.cdr.markForCheck();
      },
      error: err => { this.usersError = err?.error?.detail || 'Could not update user'; this.cdr.markForCheck(); },
    });
  }
}
