import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HTTP_ERROR_FALLBACK,
  TOAST_DURATION_MS,
  TOAST_LIMIT,
  failureCopy,
  httpErrorMessage,
  successCopy,
  toastLive,
  toastRole,
} from './toast.mjs';

test('toast contract matches the finance host', () => {
  assert.equal(TOAST_LIMIT, 3);
  assert.equal(TOAST_DURATION_MS, 5000);
  assert.equal(toastRole('error'), 'alert');
  assert.equal(toastLive('error'), 'assertive');
  assert.equal(toastRole('success'), 'status');
  assert.equal(toastLive('success'), 'polite');
  assert.equal(successCopy('Asset', 'added'), 'Asset added');
  assert.equal(failureCopy('save', 'this holding', 'Try again.'), "Couldn't save this holding. Try again.");
  assert.equal(httpErrorMessage('Request failed'), HTTP_ERROR_FALLBACK);
  assert.equal(httpErrorMessage('Vault is locked.'), 'Vault is locked.');
});
