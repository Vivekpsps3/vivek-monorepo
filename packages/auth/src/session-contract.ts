import type { Observable } from 'rxjs';

export type UserRole = 'admin' | 'user';

export interface SessionUser {
  id: number;
  email: string;
  username?: string | null;
  display_name: string;
  role: UserRole;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
  updated_at: string;
  last_login_at?: string | null;
}

/** Identity and session actions used by domain features. Vault policy stays in Finance. */
export interface SessionPort {
  readonly user$: Observable<SessionUser | null>;
  readonly cleared$: Observable<void>;
  readonly currentUser: SessionUser | null;
  readonly csrfToken: string | null;
  readonly revision: number;
  isAdmin(): boolean;
  loadSession(): Observable<SessionUser | null>;
  clearLocalSession(): void;
  logout(): void;
}
