import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '../../../tests/e2e/fixtures';

// Life poster. Seeds and the town domain come from the shared web Playwright harness.
// Birthday values here are synthetic.
test.describe('Pixels Life', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });

  test.beforeEach(async ({ page, request }) => {
    expect((await request.post('/e2e/reset?seed=pixels')).ok()).toBeTruthy();
    await page.clock.setFixedTime(new Date('2026-10-29T19:00:00Z'));
    await page.addInitScript(() => localStorage.removeItem('pixels.view'));
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

  async function openLife(page: Page, width: number, theme: 'light' | 'dark'): Promise<void> {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
    await page.goto('/pixels/life');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('app-pixels-life svg')).toBeVisible();
  }

  for (const width of [390, 1280]) {
    for (const theme of ['light', 'dark'] as const) {
      test(`poster, scroll, and axe at ${width} ${theme}`, async ({ page }) => {
        const nonSelf = watchNonSelf(page);
        await openLife(page, width, theme);
        await expect(page.locator('app-pixels-life')).not.toContainText('1990-05-04');
        await expect(page.locator('app-pixels-life')).not.toContainText('1980-01-01');
        await expect(page.locator('app-pixels-life')).not.toContainText('Other trip');
        await expect(page.locator('app-pixels-life svg text').first()).toContainText('1990');
        expect(await page.locator('app-life-poster path, app-life-poster rect').count()).toBeLessThanOrEqual(10);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBeTruthy();
        const scan = await new AxeBuilder({ page }).include('.pixels').analyze();
        expect(scan.violations.filter(violation => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([]);
        expect(nonSelf).toEqual([]);
      });
    }
  }

  for (const width of [390, 1280]) {
    test(`keyboard moves the selected week at ${width}`, async ({ page }) => {
      await openLife(page, width, 'light');
      const group = page.getByRole('group', { name: /Life in weeks/ });
      const live = page.locator('app-pixels-life [aria-live="polite"]');
      await expect(live).toContainText(/Week of/);
      const before = (await live.innerText()).trim();
      await group.press('ArrowRight');
      await group.press('ArrowRight');
      await expect(live).not.toHaveText(before);
      await group.press('t');
      await expect(live).toContainText('This week.');
      if (width === 390) {
        await page.getByRole('button', { name: 'Next year' }).click();
        await expect(live).not.toContainText('This week.');
      }
      await page.getByRole('button', { name: 'View as table' }).click();
      await expect(page.getByRole('table')).toBeVisible();
      await expect(page.locator('app-pixels-life')).not.toContainText('1990-05-04');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBeTruthy();
    });
  }

  test('no birthday offers profile settings', async ({ page, request }) => {
    expect((await request.post('/e2e/reset?seed=pixels-empty')).ok()).toBeTruthy();
    await page.goto('/pixels/life');
    await expect(page.getByRole('link', { name: 'Add your birthday' })).toHaveAttribute('href', '/settings/profile');
    await expect(page.getByText('Your birthday stays private.')).toBeVisible();
    await expect(page.locator('app-life-poster')).toHaveCount(0);
  });
});
