import { expect, test } from './frozen-clock';
import { openUserMenu } from '../../../../tests/e2e/user-menu.mjs';
import { syntheticVault } from './synthetic-vault';

test('Finance actions live in the username dropdown and preserve clear-data confirmation and recovery', async ({ page }) => {
  const vault = await syntheticVault(page, {
    assets: [{ id: 1, name: 'Keep until confirmed', category: 'cash', current_value: 100, as_of_date: '2026-10-01' }],
  }, { role: 'admin' });
  await vault.open('/have');
  const header = page.getByRole('banner');
  const trigger = header.getByRole('button', { name: 'synthetic', exact: true });
  await expect(header.getByRole('button')).toHaveCount(1);
  let menu = await openUserMenu(page);
  await expect(menu.getByRole('link', { name: 'Account stats · Admin', exact: true })).toBeVisible();
  await menu.getByRole('button', { name: 'Guide', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'How to start' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(trigger).toBeFocused();
  const resets: unknown[] = [];
  await page.route('**/api/auth/reset-data', route => {
    resets.push(route.request().postDataJSON());
    return resets.length === 1 ? route.fulfill({ status: 502, json: { detail: 'Reset unavailable' } })
      : route.fulfill({ json: { ok: true } });
  });
  menu = await openUserMenu(page);
  await menu.getByRole('button', { name: 'Clear Finance data', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Clear your data?', exact: true });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(trigger).toBeFocused();
  expect(resets).toEqual([]);
  expect(vault.data('assets')).toHaveLength(1);
  for (let attempt = 0; attempt < 2; attempt++) {
    menu = await openUserMenu(page);
    await menu.getByRole('button', { name: 'Clear Finance data', exact: true }).click();
    await confirm.getByRole('button', { name: 'Clear my data', exact: true }).click();
    await expect(confirm).toBeHidden();
    if (attempt === 0) {
      await expect(page.locator('.toast.error .toast-copy')).toContainText("Couldn't clear your data. Something went wrong.");
      expect(vault.data('assets')).toHaveLength(1);
    }
  }
  await expect(page.getByText('Your data is clear.', { exact: true })).toBeVisible();
  expect(resets).toEqual([{ confirm: 'CLEAR MY DATA' }, { confirm: 'CLEAR MY DATA' }]);
  await page.getByRole('link', { name: 'Hub', exact: true }).click();
  await expect(page).toHaveURL(/\/hub$/);
  menu = await openUserMenu(page);
  await expect(menu.getByRole('button', { name: 'Lock vault', exact: true })).toHaveCount(0);
  await expect(menu.getByRole('button', { name: 'Clear Finance data', exact: true })).toHaveCount(0);
});
