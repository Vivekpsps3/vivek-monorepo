import AxeBuilder from '@axe-core/playwright';
import { SYNTHETIC_VAULT_PASSPHRASE, syntheticVault } from '../../apps/finance/frontend/e2e/synthetic-vault';
import { expect, test } from './fixtures';

for (const [width, height, theme] of [[390, 844, 'dark'], [1280, 800, 'light']] as const) {
  test.describe(`dated unlock at ${width}`, () => {
    test.use({ viewport: { width, height }, hasTouch: width === 390, reducedMotion: 'reduce', timezoneId: 'America/Los_Angeles' });

    test('keeps the Portland date and the originating grid entry through unlock and close', async ({ page, request }, info) => {
      expect((await request.post('/e2e/reset?seed=pixels')).ok()).toBeTruthy();
      await page.clock.setFixedTime(new Date('2026-10-29T19:00:00Z'));
      await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
      await syntheticVault(page);
      await page.route(/\/api\/pixels\?/, route => route.continue());
      await page.route('**/travel/api/home', route => route.continue());
      await page.goto('/pixels?year=2026');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const date = page.locator('[data-date="2026-08-15"]');
      await date.scrollIntoViewIfNeeded();
      if (width === 390) await date.tap();
      else await date.press('Enter');
      const panel = page.locator('app-day-detail');
      await expect(panel).toContainText('Sat, Aug 15, 2026');
      const initialHistory = await page.evaluate(() => history.length);
      const unlock = panel.getByRole('link', { name: /Finance is locked/ });
      expect((await unlock.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      await unlock.click();
      await expect(page).toHaveURL(url => url.pathname === '/finance/vault/unlock'
        && url.searchParams.get('next') === '/pixels?year=2026&day=2026-08-15');
      const passphrase = page.getByRole('textbox', { name: 'Vault passphrase', exact: true });
      await passphrase.fill(SYNTHETIC_VAULT_PASSPHRASE);
      await page.getByRole('button', { name: 'Unlock', exact: true }).click();
      await expect(page).toHaveURL(/\/pixels\?year=2026&day=2026-08-15$/);
      await expect(panel).toContainText('Sat, Aug 15, 2026');
      await expect(unlock).toHaveCount(0);
      const close = panel.getByRole('button', { name: 'Close' });
      expect((await close.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      const scan = await new AxeBuilder({ page }).analyze();
      expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
      const screenshot = info.outputPath('dated-pixels-return.png');
      await page.screenshot({ path: screenshot });
      await info.attach('dated-pixels-return', { path: screenshot, contentType: 'image/png' });
      if (width === 390) await close.tap();
      else await page.keyboard.press('Escape');
      await expect(page).toHaveURL(/\/pixels\?year=2026$/);
      await expect(date).toBeFocused();
      await expect(panel).toHaveCount(0);
      expect(await page.evaluate(() => history.length)).toBe(initialHistory + 1);
      await page.goForward();
      await expect(panel).toContainText('Sat, Aug 15, 2026');
      await page.goBack();
      await expect(date).toBeFocused();
    });
  });
}
