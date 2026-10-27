import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('axe on all native Travel screens in light and dark at phone and desktop widths', async ({ page, request }) => {
  test.setTimeout(180_000);
  await request.post('/e2e/reset');
  const created = await (await request.post('/travel/api/trips', { data: {
    title: 'Kyoto', start_date: '2026-10-24', end_date: '2026-10-30',
    stays: [{ city: 'Kyoto', arrive_on: '2026-10-24', leave_on: '2026-10-30' }],
  } })).json();
  const routes = ['/travel', '/travel/calendar?month=2026-10', '/travel/trips/new', '/travel/trips/' + created.id, '/travel/pto', '/travel/settings'];
  for (const width of [390, 1280]) for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      const endpoint=route.includes('/trips/new')?null:route.includes('/trips/')?'/travel/api/trips/':route.includes('/calendar')?'/travel/api/calendar':route.includes('/pto')?'/travel/api/pto':route.includes('/settings')?'/travel/api/settings':'/travel/api/home';
      const ready=endpoint?page.waitForResponse(response=>response.url().includes(endpoint)&&response.ok()):Promise.resolve();
      await page.goto(route);await ready;
      await page.getByRole('combobox', { name: 'Color theme' }).selectOption(theme);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect.poll(()=>page.locator('body').evaluate(node=>getComputedStyle(node).color)).toBe(theme==='dark'?'rgb(246, 241, 234)':'rgb(28, 25, 22)');
      await expect(page.locator('main h1')).toBeVisible();
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
      const result = await new AxeBuilder({ page }).analyze();
      expect(result.violations.filter(item => ['serious', 'critical'].includes(item.impact)), route + ' ' + theme + ' ' + width).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
});

test('the shared theme choice replaces an earlier choice and persists on reload', async ({ page }) => {
  await page.goto('/travel');
  const theme = page.getByRole('combobox', { name: 'Color theme' });
  await theme.selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await theme.selectOption('dark');
  await page.reload();
  await expect(theme).toHaveValue('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme-choice', 'dark');
});
