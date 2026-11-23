import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../../../tests/e2e/fixtures';

const headers = { 'X-CSRF-Token': 'synthetic-csrf' };

test.describe('Stamp wallet', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });
  test.beforeEach(async ({ request }) => {
    expect((await request.post('/e2e/reset?seed=town')).ok()).toBeTruthy();
  });

  for (const width of [390, 1280]) for (const theme of ['light', 'dark'] as const) {
    test(`${width} ${theme} spends a quest reward and refunds the unlock`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript(chosen => localStorage.setItem('suite-theme', chosen), theme);
      await page.goto('/town');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const granted = await page.request.post('/api/town/stamps/grants?tz=America%2FLos_Angeles', {
        headers,
        data: { grant_key: 'quest:chapter-1', amount: 10, consumer: 'quest' },
      });
      expect(granted.status()).toBe(201);
      const bought = await page.request.post('/api/town/stamps/purchases?tz=America%2FLos_Angeles', {
        headers,
        data: { grant_key: 'market:buy:tile-fountain', catalog_id: 'tile-fountain', amount: 10 },
      });
      expect(bought.status()).toBe(201);
      const opener = page.getByRole('button', { name: 'Stamps', exact: true });
      await opener.focus();
      const openerBox = await opener.boundingBox();
      expect(openerBox?.width).toBeGreaterThanOrEqual(44);
      expect(openerBox?.height).toBeGreaterThanOrEqual(44);
      await page.keyboard.press('Enter');
      const dialog = page.locator('app-stamp-wallet');
      await expect(dialog.getByRole('heading', { name: 'Stamps' })).toBeVisible();
      await expect(dialog.locator('.balance')).toHaveText('0 Stamps');
      await expect(dialog).toContainText('Workshop market');
      await expect(dialog).toContainText('Chapter quests');
      await expect(dialog).toContainText('Minigames');
      await expect(dialog).toContainText('Tile fountain');
      expect(await dialog.evaluate(element => getComputedStyle(element).animationName)).toBe('none');
      const refund = dialog.getByRole('button', { name: 'Refund' });
      const refundBox = await refund.boundingBox();
      expect(refundBox?.width).toBeGreaterThanOrEqual(44);
      expect(refundBox?.height).toBeGreaterThanOrEqual(44);
      await refund.click();
      const phrase = dialog.locator('#stamp-refund-phrase');
      await expect(phrase).toBeFocused();
      await phrase.fill('refund');
      await dialog.getByRole('button', { name: 'Return Stamps' }).click();
      await expect(dialog.locator('.balance')).toHaveText('10 Stamps');
      await expect(dialog).toContainText('No unlocks yet.');
      const scan = await new AxeBuilder({ page }).include('app-stamp-wallet').analyze();
      expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(opener).toBeFocused();
      await info.attach(`stamps-${width}-${theme}`, { body: await page.screenshot(), contentType: 'image/png' });
    });
  }
});
