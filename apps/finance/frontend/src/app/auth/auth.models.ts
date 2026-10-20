export type UserRole = 'admin' | 'user';

export interface AuthUser {
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

export interface LoginResponse {
  user: AuthUser;
  csrf_token: string;
}

export interface MeResponse {
  user: AuthUser;
  csrf_token?: string | null;
  /** Present only when the API served this session through the local dev bypass. */
  local_dev?: boolean;
}
