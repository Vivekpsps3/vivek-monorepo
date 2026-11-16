/** Copy from local account operations is explicit; arbitrary transport messages stay private. */
export class AccountFormError extends Error {}

export const SIGN_IN_FAILED = 'Sign-in failed. Check your username, not your email, and your vault passphrase. A browser that is already signed in only needs the passphrase on Unlock vault—use that username on new browsers.';
export const USERNAME_HINT = '3–64 letters, numbers, dots, underscores, or hyphens.';
export const PASSPHRASE_HINT = 'Use at least 12 characters. Your passphrase signs in and unlocks your vault.';

/** Retry-After is either a nonnegative integer in seconds or an HTTP date. */
export function retryAfterSeconds(value: string | null | undefined, now = Date.now()): number | null {
  if (!value?.trim()) return null;
  const raw = value.trim();
  if (/^\d+$/.test(raw)) {
    const seconds = Number(raw);
    return Number.isSafeInteger(seconds) ? seconds : null;
  }
  if (!/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), /i.test(raw)) return null;
  const until = Date.parse(raw);
  return Number.isFinite(until) ? Math.max(0, Math.ceil((until - now) / 1000)) : null;
}

export function accountErrorMessage(error: unknown, action: 'login' | 'signup' | 'username' | 'name'): string {
  if (error instanceof AccountFormError) return error.message;
  const response = error as { status?: number; headers?: { get(name: string): string | null }; retryAfter?: string | null } | null;
  const status = response?.status ?? 0;
  if (status === 0 || status >= 500) return action === 'username'
    ? 'A server or network error prevented the change.'
    : 'A server or network error prevented the request. Try again.';
  if (status === 429) {
    const seconds = retryAfterSeconds(response?.retryAfter ?? response?.headers?.get('Retry-After'));
    return seconds === null ? 'Too many attempts. Try again later.' : `Too many attempts. Try again in ${seconds} seconds.`;
  }
  if (action === 'username') {
    const copy: Record<number, string> = {
      400: 'That username is not valid.', 401: 'That passphrase is wrong.',
      403: 'Session expired, sign in again.', 409: 'That username is already taken.',
      422: 'That username change request is invalid.',
    };
    return copy[status] ?? 'The username could not be changed.';
  }
  if (status === 401) return action === 'login' ? SIGN_IN_FAILED : 'Session expired, sign in again.';
  if (status === 403) return action === 'signup'
    ? 'Signup is unavailable. Check your invite code or ask an admin for an enrollment link.'
    : 'This request was not allowed. Refresh the page and try again.';
  if (status === 409) return action === 'signup' ? 'That username is already registered. Sign in or choose another username.' : 'Account details changed. Refresh the page and try again.';
  if (status === 400 || status === 422) return 'Check the account details and try again.';
  return 'The request could not be completed. Try again.';
}

/** Link server validation to known controls without rendering server messages. */
export function accountErrorField(error: unknown): string {
  if (error instanceof AccountFormError && error.message === SIGN_IN_FAILED) return 'password';
  const response = error as { status?: number; error?: { detail?: unknown } } | null;
  if (response?.status === 401) return 'password';
  if (response?.status === 409) return 'username';
  if (response?.status !== 422) return '';
  const detail = response.error?.detail;
  if (!Array.isArray(detail)) return '';
  const fields: Record<string, string> = { username: 'username', display_name: 'name', invite_code: 'invite', password: 'password', vault_passphrase: 'password' };
  for (const item of detail) {
    if (!item || !Array.isArray(item.loc)) continue;
    const field: unknown = item.loc[item.loc.length - 1];
    if (typeof field === 'string' && Object.hasOwn(fields, field)) return fields[field];
  }
  return '';
}
