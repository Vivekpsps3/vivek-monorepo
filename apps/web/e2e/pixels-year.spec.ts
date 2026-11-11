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

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

  function center(rect: { x: number; y: number; width: number; height: number }, axis: 'x' | 'y'): number {
    return axis === 'x' ? rect.x + rect.width / 2 : rect.y + rect.height / 2;
  }

  async function axisText(page: Page, kind: 'month' | 'day', index: number): Promise<string> {
    const selector = kind === 'month'
      ? `.year-axis--month[data-month="${index}"]`
      : `.year-axis--day[data-day="${index}"]`;
    const content = await page.locator(selector).evaluate(element => getComputedStyle(element, '::before').content);
    return content.replace(/^['"]|['"]$/g, '');
  }

  /** Month names and day numbers are read off the same metadata as the dated squares. */
  async function expectDateAxis(page: Page, date: string, width: number): Promise<void> {
    const month = Number(date.slice(5, 7));
    const day = Number(date.slice(8, 10));
    const cell = page.locator(`[data-date="${date}"]`);
    await expectDateParts(page, cell, month, day, width);
  }

  async function expectDateParts(
    page: Page,
    cell: ReturnType<Page['locator']>,
    month: number,
    day: number,
    width: number,
  ): Promise<void> {
    expect(await axisText(page, 'month', month)).toBe(months[month - 1]);
    expect(await axisText(page, 'day', day)).toBe(String(day));
    const cellBox = await cell.boundingBox();
    const monthBox = await page.locator(`.year-axis--month[data-month="${month}"]`).boundingBox();
    const dayBox = await page.locator(`.year-axis--day[data-day="${day}"]`).boundingBox();
    expect(cellBox).not.toBeNull();
    expect(monthBox).not.toBeNull();
    expect(dayBox).not.toBeNull();
    expect(monthBox!.width).toBeGreaterThan(0);
    expect(dayBox!.height).toBeGreaterThan(0);
    const shared = width === 1280 ? 'y' : 'x';
    const crossed = width === 1280 ? 'x' : 'y';
    expect(Math.abs(center(monthBox!, shared) - center(cellBox!, shared)), `month ${month}`).toBeLessThanOrEqual(5);
    expect(Math.abs(center(dayBox!, crossed) - center(cellBox!, crossed)), `day ${day}`).toBeLessThanOrEqual(5);
    if (width === 1280) {
      expect(monthBox!.x + monthBox!.width).toBeLessThanOrEqual(cellBox!.x + 2);
      expect(dayBox!.y + dayBox!.height).toBeLessThanOrEqual(cellBox!.y + 2);
    } else {
      expect(monthBox!.y + monthBox!.height).toBeLessThanOrEqual(cellBox!.y + 2);
      expect(dayBox!.x + dayBox!.width).toBeLessThanOrEqual(cellBox!.x + 2);
    }
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

        await expect(page.getByRole('grid')).toHaveCount(1);
        await expect(page.locator('[role="grid"] .year-axis')).toHaveCount(0);
        await expect(page.locator('.year-axis--month')).toHaveCount(12);
        await expect(page.locator('.year-axis--day')).toHaveCount(31);
        for (const date of ['2026-01-01', '2026-02-01', '2026-08-15', '2026-12-31']) {
          await expectDateAxis(page, date, width);
        }

        const legend = page.getByRole('list', { name: 'Legend' });
        await expect(legend).toBeVisible();
        await expect(legend.getByText('Trip day', { exact: true })).toBeVisible();
        if (width === 390) {
          expect(await page.evaluate(() => window.scrollY)).toBe(0);
          const legendBox = await legend.boundingBox();
          expect(legendBox).not.toBeNull();
          expect(legendBox!.y).toBeGreaterThanOrEqual(0);
          expect(legendBox!.y + legendBox!.height).toBeLessThanOrEqual(844);
        }

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

        await page.locator('[data-date="2026-08-15"]').click();
        await expect(page.getByRole('heading', { name: 'Sat, Aug 15, 2026' })).toBeVisible();
        await expect(page.locator('[data-date="2026-08-15"]')).toHaveAttribute('aria-selected', 'true');
        await page.getByRole('button', { name: 'Close' }).click();
        await expect(page.getByRole('heading', { name: 'Sat, Aug 15, 2026' })).toHaveCount(0);

        if (width === 390) {
          const scroller = page.locator('.year-scroll');
          await scroller.evaluate(node => {
            node.scrollTop = node.scrollHeight;
          });
          const scrollBox = await scroller.boundingBox();
          const august = await page.locator('.year-axis--month[data-month="8"]').boundingBox();
          const augustDay = await box(page, '2026-08-31');
          const dayLabel = await page.locator('.year-axis--day[data-day="31"]').boundingBox();
          expect(scrollBox).not.toBeNull();
          expect(august).not.toBeNull();
          expect(dayLabel).not.toBeNull();
          expect(august!.y + august!.height).toBeLessThanOrEqual(scrollBox!.y + 2);
          expect(dayLabel!.y).toBeGreaterThanOrEqual(scrollBox!.y - 1);
          expect(dayLabel!.y + dayLabel!.height).toBeLessThanOrEqual(scrollBox!.y + scrollBox!.height + 1);
          expect(Math.abs(center(august!, 'x') - center(augustDay, 'x'))).toBeLessThanOrEqual(5);
          expect(Math.abs(center(dayLabel!, 'y') - center(augustDay, 'y'))).toBeLessThanOrEqual(5);
          expect(await axisText(page, 'month', 8)).toBe('Aug');
        }

        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
        const scan = await new AxeBuilder({ page }).analyze();
        expect(scan.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
        expect(nonSelf).toEqual([]);
      });
    }
  }

  for (const width of [390, 1280]) {
    test(`year axes agree with leap and non-leap dates at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
      await page.goto('/pixels?year=2024');
      await expect(page.locator('[data-date="2024-02-29"]')).toHaveCount(1);
      await expectDateAxis(page, '2024-02-01', width);
      await expectDateAxis(page, '2024-02-29', width);
      const leapStart = await box(page, '2024-02-01');
      const leapDay = await box(page, '2024-02-29');
      if (width === 1280) expect(Math.abs(leapDay.y - leapStart.y)).toBeLessThanOrEqual(2);
      else expect(Math.abs(leapDay.x - leapStart.x)).toBeLessThanOrEqual(2);

      await page.goto('/pixels?year=2100');
      await expect(page.locator('[data-date="2100-02-29"]')).toHaveCount(0);
      await expectDateAxis(page, '2100-02-01', width);
      await expectDateAxis(page, '2100-02-28', width);
      const missing = page.locator('[data-month="2"][data-day="29"]');
      await expect(missing).toHaveClass(/none/);
      await expectDateParts(page, missing, 2, 29, width);
    });
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
        await expect(page.getByRole('grid')).toHaveCount(0);
        await expect(page.getByRole('list', { name: 'Legend' })).toBeVisible();
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
