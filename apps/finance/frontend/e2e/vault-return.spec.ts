import { expect, test } from './frozen-clock';
import { openUserMenu } from '../../../../tests/e2e/user-menu.mjs';
import { syntheticVault } from './synthetic-vault';

const PASSPHRASE = 'Synthetic finance test passphrase';

// One narrow-screen journey; layout/theme matrices live in screenshots.
const viewport = { width: 390, height: 844 };
const theme = 'dark';

test.use({ viewport });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
});

test('a locked deep link returns to the same tab after unlock', async ({ page }) => {
  await syntheticVault(page);
  await page.goto('/finance/spending?t=calendar');
  await expect(page).toHaveURL(/\/vault\/unlock\?next=%2Ffinance%2Fspending%3Ft%3Dcalendar/);
  await page.getByRole('textbox', { name: 'Vault passphrase', exact: true }).fill(PASSPHRASE);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page).toHaveURL(/\/finance\/spending\?t=calendar$/);
  await expect(page.getByRole('link', { name: 'Calendar', exact: true })).toHaveAttribute('aria-current', 'page');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('Lock Finance from the menu returns to the same screen', async ({ page }) => {
  const vault = await syntheticVault(page);
  await vault.open('/spending?t=calendar');
  const menu = await openUserMenu(page);
  await menu.getByRole('button', { name: 'Lock Finance', exact: true }).click();
  await expect(page).toHaveURL(/\/vault\/unlock\?next=/);
  await page.getByRole('textbox', { name: 'Vault passphrase', exact: true }).fill(PASSPHRASE);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page).toHaveURL(/\/finance\/spending\?t=calendar$/);
});

test('wrong passphrase keeps the layout and focus', async ({ page }) => {
  await syntheticVault(page);
  await page.goto('/finance/have');
  await expect(page).toHaveURL(/\/vault\/unlock/);
  const box = page.getByRole('textbox', { name: 'Vault passphrase', exact: true });
  const unlockButton = page.getByRole('button', { name: 'Unlock', exact: true });
  const before = await unlockButton.boundingBox();
  await box.fill('wrong passphrase entirely');
  await unlockButton.click();
  await expect(page.getByText("That passphrase didn't unlock your vault. Check it and try again.")).toBeVisible();
  const after = await unlockButton.boundingBox();
  expect(after?.y).toBe(before?.y);
  await expect(box).toBeFocused();
  await expect(box).toHaveValue('wrong passphrase entirely');
});

test('Not you? Sign out goes to sign-in', async ({ page }) => {
  await syntheticVault(page);
  await page.goto('/finance/have');
  await expect(page).toHaveURL(/\/vault\/unlock/);
  await page.getByRole('button', { name: 'Not you? Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
});
