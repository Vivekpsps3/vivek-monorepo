/** Toast shown on the sign-in page after a dead session. A full navigation drops in-memory toasts. */
export const SESSION_ENDED_COPY = 'Your session ended. Sign in again.';

/** Distinct from the cross-tab `suite-session-ended` marker, which is not copy. */
export const SESSION_ENDED_COPY_KEY = 'suite-session-ended-copy';

export function rememberSessionEnded(): void {
  try {
    sessionStorage.setItem(SESSION_ENDED_COPY_KEY, SESSION_ENDED_COPY);
  } catch {
    /* prerender or private mode */
  }
}

/** One-shot read. The sign-in page consumes the copy and then removes it. */
export function takeSessionEndedCopy(): string | null {
  try {
    const message = sessionStorage.getItem(SESSION_ENDED_COPY_KEY);
    if (message) sessionStorage.removeItem(SESSION_ENDED_COPY_KEY);
    return message;
  } catch {
    return null;
  }
}
