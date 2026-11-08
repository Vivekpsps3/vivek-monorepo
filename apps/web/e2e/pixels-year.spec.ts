import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '../../../tests/e2e/fixtures';

// Town Playwright project (apps/web/e2e/playwright.config.ts). Seed `pixels`.
test.describe('Pixels year', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });

  test.beforeEach(async ({ page, request }) => {
    expect((await request.post('/e2e/reset?seed=pixels')).ok()).toBeTruthy();
    await page.clock.setFixedTime(new Date('2026-10-29T19:00:00Z'));
  });

  function watchNonSelf(page: Page): string[] {
    const nonSelf: string[] = [];
    page.on('request', req => {
      if (req.url().startsWith('data:')) return;
      const url = new URL(req.url());
      const here = page.url();
      const origin = here && here !== 'about:blank' ? new URL(here).origin : url.origin;
      if (url.origin !== origin) nonSelf.push(req.url());
    });
    return nonSelf;
  }

  async function box(page: Page, date: string) {
    const found = await page.locator(`[data-date="${date}"]`).boundingBox();
    expect(found).not.toBeNull();
    return found!;
  }

  test('clamp notice replaces an unusable year', async ({ page }) => {
    const nonSelf = watchNonSelf(page);
    await page.goto('/pixels?year=nope');
    await expect(page.locator('.pixels-notice')).toContainText('Showing 2026. nope is not a year.');
    await expect(page).toHaveURL(/\/pixels\?year=2026$/);
    await expect(page.getByRole('grid', { name: '2026' })).toBeVisible();
    expect(nonSelf).toEqual([]);
  });

  test('leap day exists in 2024 and not in 2100', async ({ page }) => {
    await page.goto('/pixels?year=2024');
    await expect(page.locator('[data-date="2024-02-29"]')).toHaveCount(1);
    await page.goto('/pixels?year=2100');
    await expect(page.locator('[data-date="2100-02-29"]')).toHaveCount(0);
    await expect(page.locator('[data-month="2"][data-day="29"]')).toHaveClass(/none/);
  });

  for (const width of [390, 1280]) {
    for (const theme of ['light', 'dark'] as const) {
      test(`year grid at ${width} ${theme}`, async ({ page }) => {
        const nonSelf = watchNonSelf(page);
        await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
        await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
        await page.goto('/pixels?year=2026');
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        const grid = page.getByRole('grid', { name: '2026' });
        await expect(grid).toBeVisible();
        await expect(page.getByRole('button', { name: 'Previous year' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Next year' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Finance locked · Unlock' })).toHaveAttribute('href', /\/finance\/vault\/unlock\?next=%2Fpixels$/);
        await expect(page.getByText('Active days')).toBeVisible();
        await expect(page.getByText('Longest run')).toBeVisible();
        await expect(page.getByText('Trip days')).toBeVisible();
        await expect(page.getByText('Budget kept')).toBeVisible();
        await expect(page.locator('[data-stat="budget-kept"]')).not.toContainText(/\d/);
        await expect(page.getByText('Trip day', { exact: true })).toBeVisible();
        await expect(page.locator('[data-date="2026-08-15"]')).toHaveClass(/trip/);
        await expect(page.locator('[data-date="2026-04-31"]')).toHaveCount(0);
        await expect(grid.locator('[role="gridcell"][tabindex="0"]')).toHaveCount(1);

        const jan1 = await box(page, '2026-01-01');
        const jan2 = await box(page, '2026-01-02');
        const feb1 = await box(page, '2026-02-01');
        if (width === 1280) {
          expect(jan2.x).toBeGreaterThan(jan1.x);
          expect(feb1.y).toBeGreaterThan(jan1.y);
          await page.locator('[data-date="2026-10-29"]').focus();
          await page.keyboard.press('ArrowRight');
          await expect(page.locator('[data-date="2026-10-30"]')).toBeFocused();
          await page.keyboard.press('End');
          await expect(page.locator('[data-date="2026-10-31"]')).toBeFocused();
          await page.keyboard.press('Home');
          await expect(page.locator('[data-date="2026-10-01"]')).toBeFocused();
        } else {
          expect(feb1.x).toBeGreaterThan(jan1.x);
          expect(jan2.y).toBeGreaterThan(jan1.y);
          await page.locator('[data-date="2026-10-29"]').focus();
          await page.keyboard.press('ArrowRight');
          await expect(page.locator('[data-date="2026-11-29"]')).toBeFocused();
          await page.keyboard.press('ArrowDown');
          await expect(page.locator('[data-date="2026-11-30"]')).toBeFocused();
        }

        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
        const scan = await new AxeBuilder({ page }).analyze();
        expect(scan.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
        expect(nonSelf).toEqual([]);
      });
    }
  }

  for (const width of [390, 1280]) {
    for (const theme of ['light', 'dark'] as const) {
      test(`year table at ${width} ${theme}`, async ({ page }) => {
        const nonSelf = watchNonSelf(page);
        await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
        await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
        await page.addInitScript(() => localStorage.removeItem('pixels.view'));
        await page.goto('/pixels?year=2026');
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await page.getByRole('button', { name: 'View as table' }).click();
        const table = page.getByRole('table', { name: 'Year in a table' });
        await expect(table).toBeVisible();
        const portland = table.getByRole('row', { name: /Aug 15, 2026/ });
        await expect(portland).toContainText('Portland, day 2 of 4');
        await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('Pixels');
        await portland.focus();
        await expect(portland).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(/day=2026-08-15/);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
        const scan = await new AxeBuilder({ page }).analyze();
        expect(scan.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
        expect(nonSelf).toEqual([]);
      });
    }
  }
});
