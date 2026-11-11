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
  await expect(trigger).toBeVisible();
  let menu = await openUserMenu(page);
  await expect(menu.getByRole('link', { name: 'Account stats · Admin', exact: true })).toBeVisible();
  await menu.getByRole('button', { name: 'Guide', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'How Finance works' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(trigger).toBeFocused();

  // F2: the Finance slot's buttons, in order.
  menu = await openUserMenu(page);
  const financeButtons = await menu.locator('.finance-user-actions').getByRole('button').allTextContents();
  expect(financeButtons.map(text => text.trim())).toEqual(['Guide', 'Lock Finance', 'About price checks', 'Clear data…']);
  await page.keyboard.press('Escape');

  const resets: unknown[] = [];
  await page.route('**/api/auth/reset-data', route => {
    resets.push(route.request().postDataJSON());
    return resets.length === 1 ? route.fulfill({ status: 502, json: { detail: 'Reset unavailable' } })
      : route.fulfill({ json: { ok: true } });
  });

  // Cancel sends nothing and keeps the data.
  menu = await openUserMenu(page);
  await menu.getByRole('button', { name: 'Clear data…', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Clear all Finance data?', exact: true });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(trigger).toBeFocused();
  expect(resets).toEqual([]);
  expect(vault.data('assets')).toHaveLength(1);

  // Typed phrase gates the button; a 502 stays inline; retry succeeds in the
  // same open dialog.
  menu = await openUserMenu(page);
  await menu.getByRole('button', { name: 'Clear data…', exact: true }).click();
  await expect(confirm).toBeVisible();
  const clearButton = confirm.getByRole('button', { name: 'Clear data', exact: true });
  await confirm.getByLabel(/Type CLEAR MY DATA to confirm/).fill('clear my data');
  await expect(clearButton).toHaveAttribute('aria-disabled', 'true');
  await confirm.getByLabel(/Type CLEAR MY DATA to confirm/).fill('CLEAR MY DATA');
  await expect(clearButton).not.toHaveAttribute('aria-disabled', 'true');
  await clearButton.click();
  await expect(confirm).toBeVisible();
  await expect(confirm.getByText("Couldn't clear your data. Nothing was deleted. Try again.")).toBeVisible();
  await expect(page.locator('.toast.error')).toHaveCount(0);
  expect(vault.data('assets')).toHaveLength(1);
  await clearButton.click();
  await expect(confirm).toBeHidden();
  await expect(page.getByText('Finance data cleared.', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/finance\/?$/);
  expect(resets).toEqual([{ confirm: 'CLEAR MY DATA' }, { confirm: 'CLEAR MY DATA' }]);

  await page.getByRole('link', { name: 'Hub', exact: true }).click();
  await expect(page).toHaveURL(/\/hub$/);
  menu = await openUserMenu(page);
  await expect(menu.getByRole('button', { name: 'Lock Finance', exact: true })).toHaveCount(0);
  await expect(menu.getByRole('button', { name: 'Clear data…', exact: true })).toHaveCount(0);
});
