import { expect, test } from './frozen-clock';
import { syntheticVault } from './synthetic-vault';

test('Finance locks after 15 idle minutes and says why', async ({ page }) => {
  const vault = await syntheticVault(page);
  await vault.open('/have');
  await page.clock.fastForward('15:30');
  await expect(page).toHaveURL(/\/vault\/unlock\?next=%2Ffinance%2Fhave/);
  await expect(page.getByText('Finance locked after 15 minutes without activity.')).toBeVisible();
});

test('activity keeps Finance unlocked', async ({ page }) => {
  const vault = await syntheticVault(page);
  await vault.open('/have');
  await page.clock.fastForward('10:00');
  await page.mouse.move(40, 40);
  await page.mouse.down();
  await page.mouse.up();
  await page.clock.fastForward('10:00');
  await expect(page).toHaveURL(/\/finance\/have/);
  await page.clock.fastForward('06:00');
  await expect(page).toHaveURL(/\/vault\/unlock\?next=%2Ffinance%2Fhave/);
});

test('Settings Finance offers Off/5/15/60 and Off prevents locking', async ({ page }) => {
  const vault = await syntheticVault(page);
  await vault.open('/');
  await page.goto('/settings/finance');
  await expect(page.getByText('Lock Finance automatically')).toBeVisible();
  for (const label of ['Off', 'After 5 minutes', 'After 15 minutes', 'After 60 minutes']) {
    await expect(page.getByRole('radio', { name: label, exact: true })).toBeVisible();
  }
  await page.getByRole('radio', { name: 'Off', exact: true }).check();
  await expect(page.getByText('Auto-lock turned off.')).toBeVisible();
  await page.clock.fastForward(70 * 60_000);
  await expect(page).toHaveURL(/\/settings\/finance/);
  await expect(page.getByText('Lock Finance automatically')).toBeVisible();
});

test('Lock Finance in Settings flips the section to locked', async ({ page }) => {
  const vault = await syntheticVault(page);
  await vault.open('/');
  await page.goto('/settings/finance');
  await page.getByRole('button', { name: 'Lock Finance', exact: true }).click();
  await expect(page.getByText('Finance is locked.')).toBeVisible();
  await expect(page).toHaveURL(/\/settings\/finance/);
});
