/**
 * Signup and username changes share one rule. The source of truth is
 * `USERNAME_RE` in `apps/finance/backend/services/username_policy.py`.
 * Callers lowercase first, then test this pattern, matching the stored form.
 */
export const USERNAME_PATTERN = '^[a-zA-Z0-9_.-]{3,64}$';

const USERNAME_RE = new RegExp(USERNAME_PATTERN);

/** Lowercase, then accept only a full match of the server pattern. */
export function usernameForStorage(raw: string): string | null {
  const lowered = raw.toLowerCase();
  const match = USERNAME_RE.exec(lowered);
  return match?.[0] === lowered ? lowered : null;
}
