import { SYNTHETIC_VAULT_PASSPHRASE, syntheticVault } from '../../apps/finance/frontend/e2e/synthetic-vault';
import { expect, test } from './fixtures';

for (const [width, height] of [[390, 844], [1280, 800]] as const) {
  test.describe(`Activity from Pixels at ${width}`, () => {
    test.use({ viewport: { width, height }, hasTouch: width === 390, reducedMotion: 'reduce', timezoneId: 'America/Los_Angeles' });

    test('opens the selected day, preselects that entry date and returns to the same Pixels day', async ({ page, request }) => {
      expect((await request.post('/e2e/reset?seed=pixels')).ok()).toBeTruthy();
      await page.clock.setFixedTime(new Date('2026-10-29T19:00:00Z'));
      const date = '2026-08-15';
      const vault = await syntheticVault(page, { transactions: [
        { id: 22, date, type: 'expense', amount: 15, category: 'Food', description: 'Portland day marker' },
        { id: 23, date: '2026-08-16', type: 'expense', amount: 27, category: 'Food', description: 'Next day marker' },
      ] });
      if (width === 390) await vault.open('/');
      await page.route(/\/api\/pixels\?/, route => route.continue());
      await page.route('**/travel/api/home', route => route.continue());
      await page.goto('/pixels?year=2026');
      const cell = page.locator(`[data-date="${date}"]`);
      await cell.scrollIntoViewIfNeeded();
      if (width === 390) await cell.tap();
      else await cell.press('Enter');

      const panel = page.locator('app-day-detail');
      await expect(panel).toContainText('Sat, Aug 15, 2026');
      const activity = panel.getByRole('link', { name: 'Open Finance Activity' });
      await expect(activity).toHaveAttribute('href', `/finance/spending?date=${date}&pixelsDay=${date}`);
      expect((await activity.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      if (width === 390) await activity.tap();
      else await activity.press('Enter');
      if (width === 1280) {
        await expect(page).toHaveURL(url => url.pathname === '/finance/vault/unlock'
          && url.searchParams.get('next') === `/finance/spending?date=${date}&pixelsDay=${date}`);
        await page.getByLabel('Vault passphrase').fill(SYNTHETIC_VAULT_PASSPHRASE);
        await page.getByRole('button', { name: 'Unlock', exact: true }).click();
      }
      await expect(page).toHaveURL(url => url.pathname === '/finance/spending' && url.searchParams.get('date') === date);
      const history = width === 390 ? page.locator('.tx-mobile-list') : page.getByRole('table', { name: 'Transactions history' });
      await expect(history).toContainText('Portland day marker');
      await expect(history).not.toContainText('Next day marker');
      await expect(page.getByRole('button', { name: /Remove filter Day:/ })).toBeVisible();
      await page.locator('ui-page-header').getByRole('button', { name: 'Add transaction' }).click();
      const editor = page.getByRole('dialog', { name: 'Add transaction' });
      await expect(editor.getByLabel('Date')).toHaveValue(date);
      await editor.getByRole('button', { name: 'Cancel' }).click();
      await expect(editor).toHaveCount(0);

      const back = page.getByRole('link', { name: 'Back to Pixels day' });
      await expect(back).toHaveAttribute('href', `/pixels?year=2026&day=${date}`);
      await back.click();
      await expect(page).toHaveURL(`/pixels?year=2026&day=${date}`);
      await expect(panel).toContainText('Sat, Aug 15, 2026');
      if (width === 390) {
        await page.goForward();
        await expect(history).toContainText('Portland day marker');
        await page.goBack();
        await expect(panel).toContainText('Sat, Aug 15, 2026');
      }
      await panel.getByRole('button', { name: 'Close' }).click();
      await expect(cell).toBeFocused();
    });
  });
}
