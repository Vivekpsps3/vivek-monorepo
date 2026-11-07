import { expect, type Page, test } from './frozen-clock';
import { syntheticVault } from './synthetic-vault';

// F14: Home states. The clock is frozen at noon PT on 2026-10-20.
test.use({ frozenInstant: Date.parse('2026-10-20T12:00:00-07:00') });

const widths = [390, 1280] as const;
const themes = ['light', 'dark'] as const;

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(overflow).toBe(true);
}

function seededSeed() {
  return {
    assets: [{ id: 1, name: 'Checking', category: 'cash', current_value: 4200, as_of_date: '2026-10-22' }],
    holdings: [{
      id: 10, symbol: 'VOO', shares: 3, purchase_price: 600, purchase_date: '2022-01-01',
      current_price: 700.81, price_source: 'live', price_as_of: '2026-10-20T14:38:00Z',
      position_as_of: '2026-10-10', company_name: 'Vanguard 500',
    }],
    subscriptions: [{
      id: 20, name: 'Streaming', category: 'entertainment', amount: 15.49,
      frequency: 'monthly', next_bill_date: '2026-10-22', is_active: true,
    }],
  };
}

for (const width of widths) {
  for (const theme of themes) {
    const combo = `[${width} ${theme}]`;

    test(`${combo} empty vault`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript(choice => localStorage.setItem('suite-theme', choice), theme);
      const vault = await syntheticVault(page, {});
      await vault.open('/');
      await expect(page.getByRole('heading', { name: 'Start with one number' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Add a balance' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Import card activity' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'First steps' })).toBeVisible();
      await expect(page.locator('.home-tile')).toHaveCount(0);
      await expect(page.locator('canvas')).toHaveCount(0);
      await expectNoHorizontalScroll(page);
      await page.screenshot({ path: testInfo.outputPath(`home-empty-${width}-${theme}.png`), fullPage: true });

      await page.getByRole('link', { name: 'Import card activity' }).click();
      await expect(page).toHaveURL(/\/spending/);
      await expect(page.getByRole('dialog')).toBeVisible();
    });

    test(`${combo} seeded Home order`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript(choice => localStorage.setItem('suite-theme', choice), theme);
      const vault = await syntheticVault(page, seededSeed());
      vault.setQuote('VOO', { price: 700.81 });
      await vault.open('/');

      const netWorth = page.locator('.home-tile--balance');
      const dueSoon = page.locator('.due-soon');
      const firstSteps = page.locator('.first-steps');
      await expect(netWorth).toBeVisible();
      await expect(dueSoon).toBeVisible();
      await expect(firstSteps).toBeVisible();
      const boxes = await page.evaluate(() => {
        const y = (sel: string) => document.querySelector(sel)?.getBoundingClientRect().top ?? -1;
        return { tile: y('.home-tile--balance'), activity: y('.home-tile--activity'), due: y('.due-soon'), steps: y('.first-steps') };
      });
      expect(boxes.tile).toBeGreaterThanOrEqual(0);
      expect(boxes.due).toBeGreaterThan(boxes.tile);
      expect(boxes.steps).toBeGreaterThan(boxes.due);
      if (width === 1280) {
        expect(Math.abs(boxes.activity - boxes.tile)).toBeLessThanOrEqual(1);
      } else {
        expect(boxes.activity).toBeGreaterThan(boxes.tile);
      }
      await expectNoHorizontalScroll(page);
      await page.screenshot({ path: testInfo.outputPath(`home-seeded-${width}-${theme}.png`), fullPage: true });
    });

    test(`${combo} as-of line`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript(choice => localStorage.setItem('suite-theme', choice), theme);
      const vault = await syntheticVault(page, seededSeed());
      vault.setQuote('VOO', { price: 700.81 });
      await vault.open('/');
      await expect(page.locator('.home-tile--balance')).toContainText('Balances Oct 22 · Prices as of 7:38 AM PT');
    });

    test(`${combo} due soon`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript(choice => localStorage.setItem('suite-theme', choice), theme);
      const vault = await syntheticVault(page, seededSeed());
      vault.setQuote('VOO', { price: 700.81 });
      await vault.open('/');
      const card = page.locator('.due-soon');
      await expect(card).toContainText('Streaming');
      await expect(card).toContainText('$15.49');
    });

    test(`${combo} first steps progress and hide`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript(choice => localStorage.setItem('suite-theme', choice), theme);
      const vault = await syntheticVault(page, seededSeed());
      vault.setQuote('VOO', { price: 700.81 });
      await vault.open('/');
      await expect(page.locator('.first-steps')).toContainText('3 of 4 done');
      await page.getByRole('button', { name: 'Hide' }).click();
      await expect(page.locator('.first-steps')).toHaveCount(0);
      await vault.reload();
      await expect(page.locator('.first-steps')).toHaveCount(0);
    });

    test(`${combo} error state`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript(choice => localStorage.setItem('suite-theme', choice), theme);
      const vault = await syntheticVault(page, seededSeed());
      await page.route('**/vault/**', route => route.abort());
      await vault.open('/');
      await expect(page.getByRole('heading', { name: "Couldn't load Home." })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
      await expectNoHorizontalScroll(page);
    });
  }
}
