import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { accountErrorField, accountErrorMessage, retryAfterSeconds } from './account-error';

describe('account request errors', () => {
  it('reads integer and HTTP-date Retry-After and rejects invalid values', () => {
    const now = Date.parse('2026-11-16T12:00:00Z');
    expect(retryAfterSeconds('90', now)).toBe(90);
    expect(retryAfterSeconds('Mon, 16 Nov 2026 12:01:30 GMT', now)).toBe(90);
    expect(retryAfterSeconds('Mon, 16 Nov 2026 11:59:30 GMT', now)).toBe(0);
    for (const value of [null, '', '-1', '1.5', 'tomorrow', '99999999999999999999']) expect(retryAfterSeconds(value, now)).toBeNull();
  });

  it('uses safe status copy for every account flow without rendering private transport details', () => {
    for (const action of ['login', 'signup', 'username', 'name'] as const) {
      for (const status of [0, 500, 503]) {
        const error = new HttpErrorResponse({ status, error: { detail: 'PRIVATE_DATABASE_PATH' } });
        expect(accountErrorMessage(error, action)).toContain('server or network error');
        expect(accountErrorMessage(error, action)).not.toContain('PRIVATE_DATABASE_PATH');
      }
      const throttled = new HttpErrorResponse({ status: 429, headers: new HttpHeaders({ 'Retry-After': '12' }) });
      expect(accountErrorMessage(throttled, action)).toBe('Too many attempts. Try again in 12 seconds.');
    }
    expect(accountErrorMessage(new Error('PRIVATE_INTERNAL_ERROR'), 'login')).not.toContain('PRIVATE_INTERNAL_ERROR');
    expect(accountErrorMessage({ status: 403 }, 'username')).toBe('Session expired, sign in again.');
    expect(accountErrorMessage({ status: 403 }, 'signup')).toContain('Check your invite code');
  });

  it('links only known validation locations and never uses a server message as field copy', () => {
    expect(accountErrorField({ status: 422, error: { detail: [{ loc: ['body', 'display_name'], msg: 'PRIVATE' }] } })).toBe('name');
    expect(accountErrorField({ status: 422, error: { detail: [{ loc: ['body', 'unknown'], msg: 'PRIVATE' }] } })).toBe('');
    expect(accountErrorField({ status: 503, error: { detail: [{ loc: ['username'] }] } })).toBe('');
  });
});
