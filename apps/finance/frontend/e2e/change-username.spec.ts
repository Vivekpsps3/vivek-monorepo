import { expect, type Page, test } from '@playwright/test';

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
    await page.getByLabel('Vault passphrase', { exact: true }).fill(PASSPHRASE);
    await page.getByRole('button', { name: 'Sign up', exact: true }).click();
  }
  await page.waitForURL(/\/hub$/, { timeout: 60_000 });
  await expect(page.locator('.hub-account__name')).toHaveText([username, username]);
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

async function saveUsername(page: Page, nextName: string, passphrase: string): Promise<void> {
  await page.locator('.username-panel').scrollIntoViewIfNeeded();
  await page.getByLabel('New username', { exact: true }).fill(nextName);
  await page.getByLabel('Current passphrase', { exact: true }).fill(passphrase);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
}

test('renamed username shows in the hub, then signs in, and the old username does not', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const current = 'rename.source';
  const next = 'rename.done';
  await createAccount(page, current);
  await expectNoHorizontalOverflow(page);

  const challengeResponse = page.waitForResponse(
    response => response.url().includes('/api/auth/passwordless/challenge') && response.request().method() === 'POST',
  );
  const patchRequest = page.waitForRequest(
    request => request.url().includes('/api/account/username') && request.method() === 'PATCH',
  );
  await saveUsername(page, 'Rename.Done', PASSPHRASE);
  const issued = await (await challengeResponse).json();
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
  await expect(page.locator('.hub-account__name')).toHaveText([next, next]);
  await expectPassphraseCleared(page);

  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.waitForURL(/\/auth\/login/);
  await page.getByLabel('Username', { exact: true }).fill(next);
  await page.getByLabel('Vault passphrase', { exact: true }).fill(PASSPHRASE);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/hub$/, { timeout: 60_000 });
  await expect(page.locator('.hub-account__name').first()).toHaveText(next);

  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.waitForURL(/\/auth\/login/);
  await page.getByLabel('Username', { exact: true }).fill(current);
  await page.getByLabel('Vault passphrase', { exact: true }).fill(PASSPHRASE);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('.login-error')).toBeVisible({ timeout: 60_000 });
  await expect(page).toHaveURL(/\/auth\/login/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('a wrong passphrase shows the 401 error and clears the passphrase', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createAccount(page, 'rename.wrong');
  await page.locator('.username-panel').scrollIntoViewIfNeeded();
  await expectNoHorizontalOverflow(page);
  await saveUsername(page, 'rename.wrong2', 'not-the-passphrase');
  const error = page.locator('#username-change-error');
  await expect(error).toHaveText('That passphrase is wrong.');
  await expect(error).toHaveAttribute('data-status', '401');
  await expect(page.locator('.hub-account__name')).toHaveText(['rename.wrong', 'rename.wrong']);
  await expect(page).toHaveURL(/\/hub$/);
  await expectPassphraseCleared(page);
  await expectNoHorizontalOverflow(page);
});

test('a taken username shows the 409 error and clears the passphrase', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await createAccount(page, 'rename.owner');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
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
  await expect(page.locator('.hub-account__name')).toHaveText(['rename.other', 'rename.other']);
  await expectPassphraseCleared(page);
});
