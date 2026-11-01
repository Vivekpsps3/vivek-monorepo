import { openUserMenu } from '../../../../tests/e2e/user-menu.mjs';
import { expect, type Page, test } from './frozen-clock';

const PASSPHRASE = 'hub-username-e2e-passphrase';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

test.beforeEach(async ({ page }) => {
  page.on('console', message => {
    if (message.text().includes(PASSPHRASE)) {
      throw new Error('The passphrase was written to the console');
    }
  });
});

async function createAccount(page: Page, username: string): Promise<void> {
  await page.goto('/auth/login');
  const status = await page.evaluate(async () => {
    const response = await fetch('/api/auth/bootstrap-status', { credentials: 'include' });
    if (!response.ok) throw new Error('bootstrap status failed');
    return response.json() as Promise<{ needs_setup?: boolean }>;
  });
  if (status.needs_setup) {
    await expect(page.getByRole('heading', { name: 'Create the first account' })).toBeVisible();
    await page.getByLabel('Username', { exact: true }).fill(username);
    await page.getByLabel('Display name', { exact: true }).fill('Synthetic reader');
    await page.getByLabel('Vault passphrase', { exact: true }).fill(PASSPHRASE);
    await page.getByRole('button', { name: 'Create admin account', exact: true }).click();
  } else {
    await page.goto('/auth/signup');
    await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible();
    await page.getByLabel('Username', { exact: true }).fill(username);
    await page.getByLabel('Name', { exact: true }).fill('Synthetic reader');
    await page.getByLabel('Vault passphrase', { exact: true }).fill(PASSPHRASE);
    await page.getByRole('button', { name: 'Sign up', exact: true }).click();
  }
  await page.waitForURL(/\/hub$/, { timeout: 60_000 });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

async function openAccount(page: Page): Promise<void> {
  await page.goto('/hub?settings=account');
  await page.waitForURL(/\/settings\/account$/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Account' })).toBeVisible();
}

async function expectPassphraseCleared(page: Page): Promise<void> {
  await expect(page.getByLabel('Current passphrase', { exact: true })).toHaveValue('');
  const stored = await page.evaluate(() => ({
    local: JSON.stringify(Object.entries(localStorage)),
    session: JSON.stringify(Object.entries(sessionStorage)),
  }));
  expect(stored.local).not.toContain(PASSPHRASE);
  expect(stored.session).not.toContain(PASSPHRASE);
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  expect(overflow).toBe(false);
}

async function signOut(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog', {name: 'Account settings'});
  if (await dialog.isVisible()) {
    await dialog.getByRole('button', {name: 'Done', exact: true}).click();
    await expect(dialog).toBeHidden();
  }
  await openUserMenu(page);
  await page.getByRole('banner').getByRole('button', {name: 'Sign out', exact: true}).click();
}

async function signIn(page: Page, username: string): Promise<void> {
  await page.goto('/auth/login');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Vault passphrase', { exact: true }).fill(PASSPHRASE);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/hub$/, { timeout: 60_000 });
}

async function saveUsername(page: Page, nextName: string, passphrase: string): Promise<void> {
  await openAccount(page);
  await page.getByLabel('New username', { exact: true }).fill(nextName);
  await page.getByLabel('Current passphrase', { exact: true }).fill(passphrase);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
}

test('old account URLs open settings account', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createAccount(page, 'rename.redirect');
  await page.goto('/hub?settings=account');
  await page.waitForURL(/\/settings\/account$/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Account' })).toBeVisible();
  await page.goto('/account');
  await page.waitForURL(/\/settings\/account$/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Account' })).toBeVisible();
  await expect(page.getByLabel('New username', { exact: true })).toBeVisible();
  const hint = page.getByText('3–64 characters: a–z, 0–9, . _ -');
  await expect(hint).toBeVisible();
});

test('renamed username shows in the hub, then signs in, and the old username does not', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const current = 'rename.source';
  const next = 'rename.done';
  await createAccount(page, current);
  await expectNoHorizontalOverflow(page);

  let issued: Record<string, string> = {};
  await page.route('**/api/auth/passwordless/challenge', async route => {
    const response = await route.fetch();
    issued = await response.json();
    await route.fulfill({ response });
  });
  const patchRequest = page.waitForRequest(
    request => request.url().includes('/api/account/username') && request.method() === 'PATCH',
  );
  await saveUsername(page, 'Rename.Done', PASSPHRASE);
  const patch = await patchRequest;
  const body = patch.postDataJSON();
  expect(patch.headers()['x-csrf-token']).toBeTruthy();
  expect(body).toMatchObject({
    username: next,
    challenge_id: issued.challenge_id,
    challenge: issued.challenge,
    message: issued.message,
  });
  expect(JSON.stringify(body)).not.toContain(PASSPHRASE);
  expect(body.signature_b64).toEqual(expect.any(String));
  await expect(page.locator('.toast-copy')).toHaveText('Username updated.');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectPassphraseCleared(page);

  await openAccount(page);
  await signOut(page);
  await page.waitForURL(/\/auth\/login/);
  await page.getByLabel('Username', { exact: true }).fill(next);
  await page.getByLabel('Vault passphrase', { exact: true }).fill(PASSPHRASE);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/hub$/, { timeout: 60_000 });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  await openAccount(page);
  await signOut(page);
  await page.waitForURL(/\/auth\/login/);
  await page.getByLabel('Username', { exact: true }).fill(current);
  await page.getByLabel('Vault passphrase', { exact: true }).fill(PASSPHRASE);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('.login-error')).toBeVisible({ timeout: 60_000 });
  await expect(page).toHaveURL(/\/auth\/login/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('a reload of /hub still renames', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await createAccount(page, 'rename.reload');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await saveUsername(page, 'rename.reloaded', PASSPHRASE);
  await expect(page.locator('.toast-copy')).toHaveText('Username updated.');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectPassphraseCleared(page);
});

test('a legacy email username signs in and changes through the hub', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const legacy = 'legacy.user@example.com';
  const next = 'legacy.renamed';
  await createAccount(page, 'legacy.seed');
  const adopted = await page.evaluate(async (username) => {
    const csrf = document.cookie
      .split('; ')
      .find(part => part.startsWith('finance_csrf='))
      ?.slice('finance_csrf='.length);
    const response = await fetch('/api/e2e/legacy-email-username', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrf ?? '' },
      body: JSON.stringify({ username }),
    });
    return { status: response.status, body: await response.text() };
  }, legacy);
  expect(adopted.status, adopted.body).toBe(200);

  await openAccount(page);
  await signOut(page);
  await page.waitForURL(/\/auth\/login/);
  await signIn(page, legacy);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await saveUsername(page, 'Legacy.Renamed', PASSPHRASE);
  await expect(page.locator('.toast-copy')).toHaveText('Username updated.');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectPassphraseCleared(page);

  await openAccount(page);
  await signOut(page);
  await page.waitForURL(/\/auth\/login/);
  await signIn(page, next);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  await openAccount(page);
  await signOut(page);
  await page.waitForURL(/\/auth\/login/);
  await page.getByLabel('Username', { exact: true }).fill(legacy);
  await page.getByLabel('Vault passphrase', { exact: true }).fill(PASSPHRASE);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('.login-error')).toBeVisible({ timeout: 60_000 });
  await expect(page).toHaveURL(/\/auth\/login/);
});

test('a CSRF mismatch shows the session-expired copy', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createAccount(page, 'rename.csrf');
  let patches = 0;
  await page.route('**/api/account/username', async route => {
    if (route.request().method() !== 'PATCH') {
      await route.continue();
      return;
    }
    patches += 1;
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Invalid CSRF token' }),
    });
  });
  await saveUsername(page, 'rename.csrf2', PASSPHRASE);
  const error = page.locator('#username-change-error');
  await expect(error).toHaveText('Session expired, sign in again.');
  await expect(error).toHaveAttribute('data-status', '403');
  expect(patches).toBe(2);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectPassphraseCleared(page);
});

test('an expired session opens sign-in with the session-ended toast', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createAccount(page, 'rename.expired');
  await page.route('**/api/account/username', async route => {
    if (route.request().method() !== 'PATCH') {
      await route.continue();
      return;
    }
    await page.context().clearCookies({ name: 'finance_session' });
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Login required' }),
    });
  });
  await saveUsername(page, 'rename.expired2', PASSPHRASE);
  await page.waitForURL(/\/auth\/login/, { timeout: 60_000 });
  await expect(page.locator('.toast-copy')).toHaveText('Your session ended. Sign in again.', { timeout: 30_000 });
  const stored = await page.evaluate(() =>
    JSON.stringify(Object.entries(sessionStorage)) + JSON.stringify(Object.entries(localStorage)));
  expect(stored).not.toContain(PASSPHRASE);
});

test('a wrong passphrase shows the 401 error and clears the passphrase', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createAccount(page, 'rename.wrong');
  await openAccount(page);
  await expectNoHorizontalOverflow(page);
  await saveUsername(page, 'rename.wrong2', 'not-the-passphrase');
  const error = page.locator('#username-change-error');
  await expect(error).toHaveText('That passphrase is wrong.');
  await expect(error).toHaveAttribute('data-status', '401');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/settings/account');
  await expectPassphraseCleared(page);
  await expectNoHorizontalOverflow(page);
});

test('a taken username shows the 409 error and clears the passphrase', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await createAccount(page, 'rename.owner');
  await openAccount(page);
  await signOut(page);
  await page.waitForURL(/\/auth\/login/);
  await createAccount(page, 'rename.other');

  const patchResponse = page.waitForResponse(
    response => response.url().includes('/api/account/username') && response.request().method() === 'PATCH',
  );
  await saveUsername(page, 'rename.owner', PASSPHRASE);
  expect((await patchResponse).status()).toBe(409);
  const error = page.locator('#username-change-error');
  await expect(error).toHaveText('That username is already taken.');
  await expect(error).toHaveAttribute('data-status', '409');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectPassphraseCleared(page);
});
