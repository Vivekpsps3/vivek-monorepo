/** Inline copy for PATCH /api/account/username. The status is the server's. */
const SERVER_OR_NETWORK = 'A server or network error prevented the change.';

export const USERNAME_CHANGE_MISSING = 'The signed-in username is missing.';
export const USERNAME_CHANGE_LOOKUP = 'The signing key could not be loaded.';
export const USERNAME_CHANGE_CHALLENGE = 'The username change challenge could not be read.';

export function usernameChangeMessage(status: number, detail?: unknown): string {
  switch (status) {
    case 400:
      return 'That username is not valid.';
    case 401:
      return 'That passphrase is wrong.';
    case 403:
      return 'Session expired, sign in again.';
    case 409:
      return 'That username is already taken.';
    case 422:
      return 'That username change request is invalid.';
    case 429:
      return 'Too many attempts. Try again later.';
    default: {
      // Mapped statuses keep their copy. A string detail is the server's own reason.
      if (typeof detail === 'string' && detail.trim()) return detail.trim();
      if (status === 0 || status >= 500) return SERVER_OR_NETWORK;
      return 'The username could not be changed.';
    }
  }
}

export class UsernameChangeError extends Error {
  readonly status: number;

  constructor(status: number, detail?: unknown, message?: string) {
    super(message ?? usernameChangeMessage(status, detail));
    this.name = 'UsernameChangeError';
    this.status = status;
  }
}
