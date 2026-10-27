export type UserRole = 'admin' | 'user';

export type { SessionUser as AuthUser } from '@vivek/auth';
import type { SessionUser as AuthUser } from '@vivek/auth';

export interface LoginResponse {
  user: AuthUser;
  csrf_token: string;
}

export interface SignupPolicy {
  mode: 'closed' | 'open' | 'invite' | 'allowlist';
  signup_open: boolean;
  invite_code_required: boolean;
}

export interface MeResponse {
  user: AuthUser;
  csrf_token?: string | null;
  /** Present only when the API served this session through the local dev bypass. */
  local_dev?: boolean;
}
