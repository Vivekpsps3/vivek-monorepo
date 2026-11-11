/** Inline copy for PATCH /api/account/username. The status is the server's. */
const SERVER_OR_NETWORK = 'A server or network error prevented the change.';
const INVALID_REQUEST = 'That username change request is invalid.';

export const USERNAME_CHANGE_MISSING = 'The signed-in username is missing.';
export const USERNAME_CHANGE_LOOKUP = 'The signing key could not be loaded.';
export const USERNAME_CHANGE_CHALLENGE = 'The username change challenge could not be read.';

const STATUS_COPY: Readonly<Record<number, string>> = {
  400: 'That username is not valid.',
  401: 'That passphrase is wrong.',
  403: 'Session expired, sign in again.',
  409: 'That username is already taken.',
  422: INVALID_REQUEST,
  429: 'Too many attempts. Try again later.',
};

function typedFieldDetail(detail: unknown): boolean {
  const items = Array.isArray(detail) ? detail : [detail];
  return items.some(item => {
    if (!item || typeof item !== 'object') return false;
    const record = item as { loc?: unknown; field?: unknown; msg?: unknown; type?: unknown };
    return typeof record.type === 'string'
      || typeof record.field === 'string'
      || typeof record.msg === 'string'
      || Array.isArray(record.loc);
  });
}

/** Network and 5xx first, then mapped copy, then a typed field, then a client string. */
export function usernameChangeMessage(status: number, detail?: unknown): string {
  if (status === 0 || status >= 500) return SERVER_OR_NETWORK;
  const mapped = STATUS_COPY[status];
  if (mapped) return mapped;
  if (typedFieldDetail(detail)) return INVALID_REQUEST;
  if (typeof detail === 'string' && detail.trim()) return detail.trim();
  return 'The username could not be changed.';
}

export class UsernameChangeError extends Error {
  readonly status: number;

  constructor(status: number, detail?: unknown, message?: string) {
    super(message ?? usernameChangeMessage(status, detail));
    this.name = 'UsernameChangeError';
    this.status = status;
  }
}
