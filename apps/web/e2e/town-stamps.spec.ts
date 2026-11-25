import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '../../../tests/e2e/fixtures';

const headers = { 'X-CSRF-Token': 'synthetic-csrf' };

async function activate(page: Page, action: ReturnType<Page['locator']>, touch: boolean): Promise<void> {
  await expect(action).toBeEnabled();
  if (touch) await action.tap();
  else {
    await action.focus();
    await page.keyboard.press('Enter');
  }
}

test.describe('Stamp wallet and Workshop', () => {
  test.use({ timezoneId: 'America/Los_Angeles', hasTouch: true });
  test.beforeEach(async ({ request }) => {
    expect((await request.post('/e2e/reset?seed=town')).ok()).toBeTruthy();
  });

  for (const width of [390, 1280]) for (const theme of ['light', 'dark'] as const) {
    test(`${width} ${theme} buys, places twice and refunds the unused unlock`, async ({ page }, info) => {
      const touch = width === 390;
      await page.setViewportSize({ width, height: touch ? 844 : 800 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.addInitScript(chosen => localStorage.setItem('suite-theme', chosen), theme);
      await page.goto('/town');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const granted = await page.request.post('/api/town/stamps/grants', {
        headers, data: { grant_key: 'quest:chapter-1', amount: 5, consumer: 'quest' },
      });
      expect(granted.status()).toBe(201);

      const opener = page.getByRole('button', { name: 'Stamps', exact: true });
      await activate(page, opener, touch);
      const openerBox = await opener.boundingBox();
      expect(openerBox?.width).toBeGreaterThanOrEqual(44);
      expect(openerBox?.height).toBeGreaterThanOrEqual(44);
      const dialog = page.locator('app-stamp-wallet');
      await expect(dialog.getByRole('heading', { name: 'Stamps' })).toBeVisible();
      await expect(dialog.locator('.balance')).toHaveText('5 Stamps');
      await expect(dialog).toContainText('Chapter quests');
      await expect(dialog).toContainText('Minigames');
      expect(await dialog.evaluate(element => getComputedStyle(element).animationName)).toBe('none');
      const walletScan = await new AxeBuilder({ page }).include('app-stamp-wallet').analyze();
      expect(walletScan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(opener).toBeFocused();
      await activate(page, opener, touch);
      await activate(page, dialog.getByRole('link', { name: 'Workshop market' }), touch);

      const workshop = page.locator('app-town-workshop');
      await expect(workshop.getByRole('heading', { name: 'Shell stool' })).toBeVisible();
      await expect(workshop.getByLabel('Furniture').locator('option')).toHaveCount(12);
      await expect(workshop.locator('img')).toHaveAttribute('src', new RegExp(`shell-stool-${theme === 'dark' ? 'night' : 'day'}\\.svg`));
      const unlock = workshop.getByRole('button', { name: 'Unlock', exact: true });
      await expect(unlock).toBeInViewport({ ratio: 1 });
      const unlockBox = await unlock.boundingBox();
      expect(unlockBox?.width).toBeGreaterThanOrEqual(44);
      expect(unlockBox?.height).toBeGreaterThanOrEqual(44);
      await info.attach(`workshop-${width}-${theme}`, { body: await page.screenshot(), contentType: 'image/png' });
      await activate(page, unlock, touch);
      const confirmation = workshop.getByRole('heading', { name: 'Unlock for 5 Stamps?' });
      await expect(confirmation).toBeFocused();
      await info.attach(`confirm-${width}-${theme}`, { body: await page.screenshot(), contentType: 'image/png' });
      await expect(workshop.locator('.balance')).toHaveText('5 Stamps available');
      await activate(page, workshop.getByRole('button', { name: 'Cancel' }), touch);
      await expect(unlock).toBeFocused();
      await activate(page, unlock, touch);
      await activate(page, workshop.getByRole('button', { name: 'Confirm purchase' }), touch);
      await expect(workshop.locator('.balance')).toHaveText('0 Stamps available');
      await expect(workshop.getByText('Unlocked. Place it in Home.')).toBeFocused();
      const scan = await new AxeBuilder({ page }).include('app-town-workshop').analyze();
      expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();

      await activate(page, workshop.getByRole('link', { name: 'Place in Home' }), touch);
      const home = page.locator('app-town-home');
      await activate(page, home.getByRole('button', { name: 'Decorate room' }), touch);
      const inventory = home.getByLabel('Add furniture');
      await expect(inventory.locator('option[value="shell-stool"]')).toHaveCount(1);
      for (const column of ['0', '1']) {
        await inventory.selectOption('shell-stool');
        await home.getByLabel('Column', { exact: true }).selectOption({ value: column });
        await home.getByLabel('Row', { exact: true }).selectOption({ value: '0' });
        await activate(page, home.getByRole('button', { name: 'Place item' }), touch);
      }
      await activate(page, home.getByRole('button', { name: 'Save layout' }), touch);
      await expect(home.locator('[data-layout-status]')).toHaveAttribute('data-layout-revision', '1');
      const saved = await (await page.request.get('/api/town/layouts/living')).json();
      const stools = saved.items.filter((item: { catalog_id: string }) => item.catalog_id === 'shell-stool');
      expect(stools).toHaveLength(2);
      expect(stools[0].instance_id).not.toBe(stools[1].instance_id);

      await page.goto('/town/workshop?item=shell-stool');
      await activate(page, workshop.getByRole('button', { name: 'Refund', exact: true }), touch);
      await activate(page, workshop.getByRole('button', { name: 'Confirm refund' }), touch);
      await expect(workshop.getByRole('alert')).toHaveText('Remove every copy from your saved layouts before refunding.');
      await expect(workshop.locator('.balance')).toHaveText('0 Stamps available');
      expect(await (await page.request.get('/api/town/layouts/living')).json()).toEqual(saved);
      const removed = await page.request.put('/api/town/layouts/living', {
        headers,
        data: { expected_revision: 1, items: saved.items.filter((item: { catalog_id: string }) => item.catalog_id !== 'shell-stool') },
      });
      expect(removed.status()).toBe(200);
      await activate(page, workshop.getByRole('button', { name: 'Confirm refund' }), touch);
      await expect(workshop.locator('.balance')).toHaveText('5 Stamps available');
      await expect(workshop.getByText('5 Stamps returned.')).toBeFocused();
      await info.attach(`refunded-${width}-${theme}`, { body: await page.screenshot(), contentType: 'image/png' });
    });
  }

  test('two tabs cannot both spend the last Stamps', async ({ page, context }) => {
    await page.goto('/town');
    expect((await page.request.post('/api/town/stamps/grants', {
      headers, data: { grant_key: 'quest:chapter-1', amount: 10, consumer: 'quest' },
    })).status()).toBe(201);
    const other = await context.newPage();
    await Promise.all([page.goto('/town/workshop?item=tile-fountain'), other.goto('/town/workshop?item=globe')]);
    for (const tab of [page, other]) {
      await expect(tab.locator('app-town-workshop .balance')).toHaveText('10 Stamps available');
      await tab.getByRole('button', { name: 'Unlock', exact: true }).click();
    }
    const results = await Promise.all([page, other].map(async tab => {
      const response = tab.waitForResponse(value => new URL(value.url()).pathname === '/api/town/stamps/purchases');
      await tab.getByRole('button', { name: 'Confirm purchase' }).click();
      return (await response).status();
    }));
    expect(results.sort()).toEqual([201, 409]);
    const wallet = await (await page.request.get('/api/town/stamps')).json();
    expect(wallet.balance).toBe(0);
    expect(wallet.entitlements).toHaveLength(1);
    expect(wallet.receipts.filter((row: { kind: string }) => row.kind === 'spend')).toHaveLength(1);
    await expect(page.locator('app-town-workshop .balance')).toHaveText('0 Stamps available');
    await expect(other.locator('app-town-workshop .balance')).toHaveText('0 Stamps available');
    await other.close();
  });
});
