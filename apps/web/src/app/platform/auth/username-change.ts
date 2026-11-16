import { accountErrorMessage } from './account-error';

export const USERNAME_CHANGE_MISSING = 'The signed-in username is missing.';
export const USERNAME_CHANGE_LOOKUP = 'The signing key could not be loaded.';
export const USERNAME_CHANGE_CHALLENGE = 'The username change challenge could not be read.';

export function usernameChangeMessage(status: number): string {
  return accountErrorMessage({ status }, 'username');
}

export class UsernameChangeError extends Error {
  constructor(readonly status: number, _detail?: unknown, message?: string, readonly retryAfter?: string | null) {
    super(message ?? accountErrorMessage({ status, retryAfter }, 'username'));
    this.name = 'UsernameChangeError';
  }
}
