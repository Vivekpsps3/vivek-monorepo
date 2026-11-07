import { expect, test } from './frozen-clock';
import { syntheticVault } from './synthetic-vault';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

function memberRow(page: import('@playwright/test').Page) {
  return page.locator('li', { hasText: 'Synthetic member' });
}

test('reset needs the typed phrase and shows failures inline', async ({ page }) => {
  const bodies: unknown[] = [];
  let attempts = 0;
  await page.route('**/api/admin/users/988/**', async route => {
    const request = route.request();
    if (request.method() === 'POST' && request.url().includes('reset-contents')) {
      bodies.push(request.postDataJSON());
      attempts++;
      if (attempts === 1) return route.fulfill({ status: 500, json: { detail: 'boom' } });
      return route.fulfill({ status: 200, json: { ok: true } });
    }
    return route.fallback();
  });
  const vault = await syntheticVault(page, {}, { role: 'admin' });
  await vault.open('/hub/admin');

  await memberRow(page).getByRole('button', { name: 'Reset finance data' }).click();
  const dialog = page.getByRole('dialog', { name: 'Erase finance data for member?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await expect(dialog.getByRole('button', { name: 'Erase data' })).toHaveAttribute('aria-disabled', 'true');

  await dialog.getByLabel(/Type RESET member to confirm/).fill('RESET member');
  await expect(dialog.getByRole('button', { name: 'Erase data' })).not.toHaveAttribute('aria-disabled', 'true');
  await dialog.getByRole('button', { name: 'Erase data' }).click();

  await expect(dialog.getByRole('alert')).toHaveText("Couldn't erase their data. Nothing was deleted. Try again.");
  await expect(page.getByText('boom', { exact: true })).toHaveCount(0);
  await expect(dialog).toBeVisible();

  await dialog.getByRole('button', { name: 'Erase data' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('app-suite-admin').getByRole('status')).toHaveText(
    'Finance data for member was erased, and their sessions were signed out.',
  );
  expect(bodies).toEqual([{ confirm: 'RESET member' }, { confirm: 'RESET member' }]);
});

test('delete asks for DELETE member and Cancel sends nothing', async ({ page }) => {
  let deletes = 0;
  await page.route('**/api/admin/users/988/**', async route => {
    if (route.request().method() === 'DELETE') {
      deletes++;
      return route.fulfill({ status: 200, json: { ok: true } });
    }
    return route.fallback();
  });
  const vault = await syntheticVault(page, {}, { role: 'admin' });
  await vault.open('/hub/admin');

  await memberRow(page).getByRole('button', { name: 'Delete' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete member?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel(/Type DELETE member to confirm/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  expect(deletes).toBe(0);
});

test('sign out everywhere confirms without a phrase', async ({ page }) => {
  let posts = 0;
  await page.route('**/api/admin/metrics', route =>
    route.fulfill({
      json: {
        totals: {},
        finance_rows: {},
        per_user: [{ id: 988, has_vault: false, encrypted_records: 0, active_sessions: 2, enrolled: true }],
        tables: [],
        recent: [],
      },
    }),
  );
  await page.route('**/api/admin/users/988/**', async route => {
    if (route.request().method() === 'POST' && route.request().url().includes('revoke-sessions')) {
      posts++;
      return route.fulfill({ status: 200, json: { ok: true, revoked: 2 } });
    }
    return route.fallback();
  });
  const vault = await syntheticVault(page, {}, { role: 'admin' });
  await vault.open('/hub/admin');

  await memberRow(page).getByRole('button', { name: 'Sign out everywhere' }).click();
  const dialog = page.getByRole('dialog', { name: 'Sign member out everywhere?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('input')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Sign out' }).click();
  await expect(dialog).toBeHidden();
  expect(posts).toBe(1);
});

test('dialog fits at 390 and follows the theme', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const vault = await syntheticVault(page, {}, { role: 'admin' });
  await vault.open('/hub/admin');
  await memberRow(page).getByRole('button', { name: 'Reset finance data' }).click();
  const dialog = page.getByRole('dialog', { name: 'Erase finance data for member?' });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  const panelBackground = await dialog.evaluate(el => getComputedStyle(el).backgroundColor);
  expect(panelBackground).not.toBe('rgba(0, 0, 0, 0)');
  expect(panelBackground).not.toBe('transparent');
});
