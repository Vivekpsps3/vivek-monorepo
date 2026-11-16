import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from './fixtures';

async function linkedError(page: Page, label: string, errorId: string) {
  const field = page.getByLabel(label, { exact: true });
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(field).toHaveAttribute('aria-describedby', new RegExp(errorId));
}

for (const width of [390, 1280]) for (const theme of ['light', 'dark']) {
  test(`account forms explain keyboard validation at ${width}px ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
    await page.goto('/auth/login');
    await page.getByRole('button', { name: 'Sign in', exact: true }).focus();
    await page.keyboard.press('Enter');
    await linkedError(page, 'Username', 'login-error');
    await page.getByLabel('Username', { exact: true }).fill('synthetic');
    await expect(page.locator('#login-error')).toBeEmpty();
    await page.getByRole('button', { name: 'Sign in', exact: true }).press('Enter');
    await linkedError(page, 'Vault passphrase', 'login-error');
    await expect(page.getByLabel('Vault passphrase', { exact: true })).toHaveAttribute('autocomplete', 'current-password');
    await page.getByRole('link', { name: 'Create an account' }).click();
    await expect(page.locator('form').getByRole('status')).toContainText('then sign up');
    await page.getByRole('button', { name: 'Sign up', exact: true }).press('Enter');
    await linkedError(page, 'Name', 'signup-error');
    await page.getByLabel('Name', { exact: true }).fill('Synthetic');
    await page.getByLabel('Username', { exact: true }).fill('ab');
    await page.getByRole('button', { name: 'Sign up', exact: true }).press('Enter');
    await linkedError(page, 'Username', 'signup-error');
    await expect(page.getByLabel('Username', { exact: true })).toHaveAttribute('aria-describedby', /-hint/);
    await page.getByLabel('Username', { exact: true }).fill('valid.user');
    await page.getByRole('button', { name: 'Sign up', exact: true }).press('Enter');
    await linkedError(page, 'Vault passphrase', 'signup-error');
    await expect(page.getByLabel('Vault passphrase', { exact: true })).toHaveAttribute('autocomplete', 'new-password');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}

test('login retains safe status and Retry-After copy from each HTTP phase', async ({ page }) => {
  await page.goto('/auth/login');
  await page.getByLabel('Username', { exact: true }).fill('synthetic');
  await page.getByLabel('Vault passphrase', { exact: true }).fill('Synthetic passphrase');
  for (const fixture of [
    { status: 429, retry: '45', message: '45 seconds' },
    { status: 429, retry: new Date(Date.now() + 120_000).toUTCString(), message: /Try again in 1\d\d seconds/ },
    { status: 403, message: 'This request was not allowed' },
    { status: 503, message: 'server or network error' },
    { status: 0, message: 'server or network error' },
  ]) {
    await page.route('**/api/auth/passwordless/lookup', route => fixture.status === 0 ? route.abort('failed') : route.fulfill({ status: fixture.status, headers: fixture.retry ? { 'Retry-After': fixture.retry } : {}, json: { detail: 'PRIVATE_SERVER_INTERNALS' } }));
    await page.getByRole('button', { name: 'Sign in', exact: true }).press('Enter');
    await expect(page.locator('#login-error')).toContainText(fixture.message);
    await expect(page.locator('#login-error')).toHaveAttribute('aria-live', 'polite');
    await expect(page.locator('body')).not.toContainText('PRIVATE_SERVER_INTERNALS');
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
    await page.unroute('**/api/auth/passwordless/lookup');
  }
});

test('signup keeps one idle/progress region and links server fields without exposing internals', async ({ page }) => {
  await page.clock.install();
  await page.goto('/auth/signup');
  await page.getByLabel('Name', { exact: true }).fill('Synthetic');
  await page.getByLabel('Username', { exact: true }).fill('signup.user');
  await page.getByLabel('Vault passphrase', { exact: true }).fill('Synthetic signup passphrase');
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let received!: () => void;
  const request = new Promise<void>(resolve => { received = resolve; });
  await page.route('**/api/auth/signup/passwordless', async route => {
    received(); await held;
    await route.fulfill({ status: 422, json: { detail: [{ loc: ['body', 'username'], msg: 'PRIVATE_VALIDATOR_INTERNALS' }] } });
  });
  await page.getByRole('button', { name: 'Sign up', exact: true }).click();
  await expect(page.locator('form').getByRole('status')).toContainText('Creating your account');
  await request;
  await page.clock.fastForward(5_000);
  await expect(page.locator('form').getByRole('status')).toContainText('Setting up encryption');
  release();
  await expect(page.locator('#signup-error')).toContainText('Check the account details');
  await linkedError(page, 'Username', 'signup-error');
  await expect(page.locator('body')).not.toContainText('PRIVATE_VALIDATOR_INTERNALS');
  await expect(page.locator('form').getByRole('status')).toContainText('then sign up');
});

test('invite-code signup links the required code and preserves safe 403 recovery', async ({ page }) => {
  await page.route('**/api/auth/signup-policy', route => route.fulfill({ json: { mode: 'invite', signup_open: true, invite_code_required: true } }));
  await page.route('**/api/auth/signup/passwordless', route => route.fulfill({ status: 403, json: { detail: 'Signup is not available' } }));
  await page.goto('/auth/signup');
  await page.getByRole('button', { name: 'Sign up', exact: true }).click();
  await linkedError(page, 'Invite code', 'signup-error');
  await page.getByLabel('Invite code', { exact: true }).fill('synthetic-code');
  await page.getByLabel('Name', { exact: true }).fill('Synthetic');
  await page.getByLabel('Username', { exact: true }).fill('invite.user');
  await page.getByLabel('Vault passphrase', { exact: true }).fill('Synthetic invitation passphrase');
  await page.getByRole('button', { name: 'Sign up', exact: true }).press('Enter');
  await expect(page.locator('#signup-error')).toContainText('Check your invite code');
  await expect(page.getByRole('button', { name: 'Sign up', exact: true })).toBeEnabled();
});

test('enrollment uses the admin-selected identity and rejects malformed previews', async ({ page }) => {
  for (const username of ['bad@username', 'valid.enrollee']) {
    await page.route('**/api/auth/invitations/synthetic-link', route => route.fulfill({ json: { username, display_name: 'Synthetic invitee', expires_at: '2099-01-01T00:00:00Z' } }));
    await page.goto('/auth/signup?invite=synthetic-link');
    if (username.includes('@')) {
      await expect(page.locator('#signup-error')).toContainText('invalid or expired');
      await expect(page.getByRole('button', { name: 'Finish account' })).toHaveCount(0);
      await expect(page.getByLabel('Vault passphrase', { exact: true })).toHaveCount(0);
    } else {
      await expect(page.locator('#signup-invite-identity')).toContainText('signs in as valid.enrollee');
      await expect(page.getByLabel('Username', { exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: 'Finish account' }).press('Enter');
      await linkedError(page, 'Vault passphrase', 'signup-error');
      await expect(page.getByLabel('Vault passphrase', { exact: true })).toHaveAttribute('aria-describedby', /-hint/);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    }
    await page.unroute('**/api/auth/invitations/synthetic-link');
  }
});

test('enrollment preview can recover from rate limits and network/server failure', async ({ page }) => {
  let attempt = 0;
  await page.route('**/api/auth/invitations/retry-link', route => {
    attempt++;
    if (attempt === 1) return route.fulfill({ status: 429, headers: { 'Retry-After': '15' }, json: { detail: 'Rate limited' } });
    if (attempt === 2) return route.fulfill({ status: 503, json: { detail: 'PRIVATE_INVITATION_INTERNALS' } });
    return route.fulfill({ json: { username: 'retry.enrollee', display_name: 'Synthetic invitee', expires_at: '2099-01-01T00:00:00Z' } });
  });
  await page.goto('/auth/signup?invite=retry-link');
  await expect(page.locator('#signup-error')).toContainText('15 seconds');
  await page.getByRole('button', { name: 'Check enrollment link again' }).press('Enter');
  await expect(page.locator('#signup-error')).toContainText('server or network error');
  await expect(page.locator('body')).not.toContainText('PRIVATE_INVITATION_INTERNALS');
  await page.getByRole('button', { name: 'Check enrollment link again' }).press('Enter');
  await expect(page.getByRole('button', { name: 'Finish account' })).toBeEnabled();
  expect(attempt).toBe(3);
});

test('signup rate limits, network failure and the HTTP deadline restore an actionable form', async ({ page }) => {
  await page.clock.install();
  await page.goto('/auth/signup');
  await page.getByLabel('Name', { exact: true }).fill('Synthetic');
  await page.getByLabel('Username', { exact: true }).fill('retry.signup');
  await page.getByLabel('Vault passphrase', { exact: true }).fill('Synthetic retry passphrase');
  for (const mode of ['rate', 'network', 'timeout']) {
    let received!: () => void;
    const request = new Promise<void>(resolve => { received = resolve; });
    await page.route('**/api/auth/signup/passwordless', async route => {
      received();
      if (mode === 'rate') await route.fulfill({ status: 429, headers: { 'Retry-After': '20' }, json: { detail: 'Rate limited' } });
      if (mode === 'network') await route.abort('failed');
      // The final fixture deliberately leaves the request pending to exercise the real deadline.
    });
    await page.getByRole('button', { name: 'Sign up', exact: true }).press('Enter');
    await request;
    if (mode === 'timeout') await page.clock.fastForward(12_100);
    await expect(page.locator('#signup-error')).toContainText(mode === 'rate' ? '20 seconds' : 'server or network error');
    await expect(page.getByRole('button', { name: 'Sign up', exact: true })).toBeEnabled();
    await expect(page.locator('form').getByRole('status')).toContainText('then sign up');
    await page.unroute('**/api/auth/signup/passwordless');
  }
});
