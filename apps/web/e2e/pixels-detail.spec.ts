import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Day panel, phone sheet, and the persisted By app choice. The year page
// owns ?year/?day and passes phone from the viewport.
test.describe('Pixels day detail', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });

  test.beforeEach(async ({ page, request }) => {
    expect((await request.post('/e2e/reset?seed=pixels')).ok()).toBeTruthy();
    await page.clock.setFixedTime(new Date('2026-10-29T19:00:00Z'));
  });

  test('390 opens the Portland day in a bottom sheet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/pixels?year=2026&day=2026-08-15');
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('Portland, day 2 of 4');
    await expect(sheet.getByRole('button', { name: 'Close' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(page.locator('[data-date="2026-08-15"]')).toBeFocused();
  });

  test('1280 shows the same day in a side panel', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/pixels?year=2026&day=2026-08-15');
    const panel = page.locator('app-day-detail');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Portland, day 2 of 4');
    await expect(panel).toContainText('Sat, Aug 15, 2026');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(page.locator('[data-date="2026-08-15"]')).toBeFocused();
  });

  test('By app persists across a reload', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/pixels?year=2026');
    const colour = page.getByRole('radiogroup', { name: 'Colour' });
    await colour.getByRole('radio', { name: 'By app' }).click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('pixels.colorBy'))).toBe('app');
    await page.reload();
    await expect(colour.getByRole('radio', { name: 'By app' })).toHaveAttribute('aria-checked', 'true');
    expect(await page.evaluate(() => localStorage.getItem('pixels.colorBy'))).toBe('app');
  });

  for (const [width, height] of [[390, 844], [1280, 800]] as const) {
    for (const theme of ['light', 'dark'] as const) {
      test(`axe with the day open at ${width} [${theme}]`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
        await page.goto('/pixels?year=2026&day=2026-08-15');
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.locator('app-day-detail')).toBeVisible();
        const scan = await new AxeBuilder({ page }).analyze();
        expect(scan.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
      });
    }
  }
});
