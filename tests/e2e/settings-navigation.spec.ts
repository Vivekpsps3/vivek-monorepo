import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';
import { chooseColorTheme, openUserMenu } from './user-menu.mjs';

const views = [
  { name: 'phone', viewport: { width: 390, height: 844 }, theme: 'dark', hasTouch: true },
  { name: 'desktop', viewport: { width: 1280, height: 800 }, theme: 'light', hasTouch: false },
] as const;

for (const view of views) {
  test.describe(view.name, () => {
    test.use({ viewport: view.viewport, hasTouch: view.hasTouch, reducedMotion: 'reduce' });

    test(`settings groups and deep links at ${view.viewport.width}px in ${view.theme}`, async ({ page }) => {
      await page.goto('/hub');
      await chooseColorTheme(page, view.theme);
      const menu = await openUserMenu(page);
      await menu.getByRole('link', { name: 'Settings', exact: true }).click();
      await expect(page).toHaveURL(/\/settings$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeFocused();
      const nav = page.getByRole('navigation', { name: 'Settings', exact: true });
      await expect(nav.getByRole('heading', { name: 'Account and security' })).toBeVisible();
      await expect(nav.getByRole('heading', { name: 'Preferences' })).toBeVisible();
      await expect(nav.getByRole('heading', { name: 'Connections' })).toBeVisible();
      await expect(nav.getByRole('link', { name: 'Account', exact: true })).toHaveAttribute('href', '/settings/account');
      await expect(nav.getByRole('link', { name: 'Finance', exact: true })).toHaveAttribute('href', '/settings/finance');
      await expect(nav.getByRole('link', { name: 'Calendar subscriptions' })).toHaveAttribute('href', '/settings/calendars');

      const game = nav.getByRole('link', { name: 'Game', exact: true });
      const box = await game.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      if (view.hasTouch) await game.tap();
      else await game.press('Enter');
      await expect(page).toHaveURL(/\/settings\/game$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Game' })).toBeFocused();
      await expect(page.getByRole('link', { name: 'Open Town' })).toHaveAttribute('href', '/town');
      if (view.hasTouch) await page.getByRole('link', { name: '← Settings' }).tap();
      else await page.goBack();
      await expect(page).toHaveURL(/\/settings$/);

      const connection = nav.getByRole('link', { name: 'Flight schedules' });
      await connection.click();
      await expect(page).toHaveURL(/\/settings\/connections$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Flight schedules' })).toBeFocused();
      await expect(page.getByRole('textbox', { name: 'Hours in a workday' })).toHaveCount(0);
      expect((await page.reload())?.status()).toBe(200);
      await expect(page.getByLabel('New FlightAware API key')).toBeVisible();
      if (!view.hasTouch) await expect(connection).toHaveAttribute('aria-current', 'page');

      const result = await new AxeBuilder({ page }).analyze();
      expect(result.violations.filter(issue =>
        issue.id === 'color-contrast' || issue.impact === 'serious' || issue.impact === 'critical',
      )).toEqual([]);
      await page.screenshot({ path: test.info().outputPath(`connection-${view.name}.png`), fullPage: true });
    });
  });
}

test('signing out clears the connection settings while a key save is pending', async ({ page }) => {
  await page.route('**/travel/api/settings', route => route.fulfill({
    json: {
      flightaware: { source: 'database', configured: true, last4: 'A791' },
      pto: { hours_per_day: '8', sick_prompt_dismissed: false },
    },
  }));
  let releaseSave!: () => void;
  let releaseLogout!: () => void;
  const save = new Promise<void>(resolve => { releaseSave = resolve; });
  const logout = new Promise<void>(resolve => { releaseLogout = resolve; });
  await page.route('**/travel/api/settings/flightaware', async route => {
    await save;
    await route.fulfill({ json: { configured: true, source: 'database', last4: 'B971' } }).catch(() => undefined);
  });
  await page.route('**/api/auth/logout', async route => {
    await logout;
    // Browser-local clearing is under test. Keep the worker's shared synthetic login available.
    await route.fulfill({ json: { ok: true } }).catch(() => undefined);
  });
  try {
    await page.goto('/settings/connections');
    await expect(page.getByText('Key ending A791')).toBeVisible();
    await page.getByLabel('New FlightAware API key').fill('synthetic-owner-draft-B971');
    const request = page.waitForRequest(req => req.url().endsWith('/travel/api/settings/flightaware') && req.method() === 'PUT');
    await page.getByRole('button', { name: 'Save key' }).click();
    await request;

    const menu = await openUserMenu(page);
    await menu.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Your session ended' })).toBeVisible();
    releaseSave();
    await expect(page.getByText('Key ending A791')).toHaveCount(0);
    await expect(page.getByLabel('New FlightAware API key')).toHaveCount(0);
    await expect(page.getByText('Key saved.', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => JSON.stringify([
      history.state, Object.entries(localStorage), Object.entries(sessionStorage),
    ]))).not.toContain('synthetic-owner-draft-B971');
  } finally {
    releaseSave();
    releaseLogout();
  }
});
