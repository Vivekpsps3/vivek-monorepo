/** Inline copy for PATCH /api/account/username. The status is the server's. */
export function usernameChangeMessage(status: number): string {
  switch (status) {
    case 400:
      return 'That username is not valid.';
    case 401:
      return 'That passphrase is wrong.';
    case 409:
      return 'That username is already taken.';
    case 429:
      return 'Too many attempts. Try again later.';
    default:
      return 'The username could not be changed.';
  }
}

export class UsernameChangeError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(usernameChangeMessage(status));
    this.name = 'UsernameChangeError';
    this.status = status;
  }
}
