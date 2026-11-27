import { expect, test } from '../../../tests/e2e/fixtures';

// Date exploration lives on the Pixels year grid. The Hub only keeps the shortcut.
// Seed `pixels` stores a birthday the Hub must not show or request.
test.describe('Hub year in pixels', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });

  test.beforeEach(async ({ page, request }) => {
    expect((await request.post('/e2e/reset?seed=pixels')).ok()).toBeTruthy();
    await page.clock.setFixedTime(new Date('2026-10-29T19:00:00Z'));
  });

  test('the shortcut opens the year grid, which still selects past and future dates', async ({ page }) => {
    const pixelUrls: string[] = [];
    const birthdayUrls: string[] = [];
    page.on('request', req => {
      const url = new URL(req.url());
      if (url.pathname === '/api/pixels') pixelUrls.push(req.url());
      if (url.pathname.includes('birthday') || url.searchParams.has('birthday') || url.searchParams.get('profile') === '1') {
        birthdayUrls.push(req.url());
      }
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/hub');
    await expect(page.locator('.pixel-strip')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Year in Pixels' })).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('1990-05-04');
    await expect(page.locator('body')).not.toContainText('1980-01-01');
    await expect(page.locator('body')).not.toContainText(/birthday/i);
    expect(pixelUrls).toEqual([]);
    expect(birthdayUrls).toEqual([]);

    const shortcut = page.getByRole('navigation', { name: 'Shortcuts' }).getByRole('link', { name: 'Pixels', exact: true });
    await expect(shortcut).toHaveAttribute('href', '/pixels');
    await shortcut.click();
    await expect(page).toHaveURL(/\/pixels/);
    const grid = page.getByRole('grid', { name: '2026' });
    await expect(grid).toBeVisible();
    expect(pixelUrls.length).toBeGreaterThan(0);
    for (const raw of pixelUrls) {
      const url = new URL(raw);
      expect(url.searchParams.has('profile')).toBe(false);
      expect(url.searchParams.get('profile')).not.toBe('1');
    }
    expect(birthdayUrls).toEqual([]);

    await grid.locator('[data-date="2026-10-22"]').click();
    await expect(page).toHaveURL(/\/pixels\?year=2026&day=2026-10-22/);
    await grid.locator('[data-date="2026-10-29"]').focus();
    await page.keyboard.press('ArrowRight');
    await expect(grid.locator('[data-date="2026-10-30"]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/pixels\?year=2026&day=2026-10-30/);
    await expect(page.locator('body')).not.toContainText('1990-05-04');
    await expect(page.locator('body')).not.toContainText('1980-01-01');
    expect(pixelUrls.every(raw => !new URL(raw).searchParams.has('profile'))).toBe(true);
    expect(birthdayUrls).toEqual([]);
  });

  for (const width of [390, 1280]) {
    for (const theme of ['light', 'dark'] as const) {
      test(`Hub stays free of the year strip at ${width} ${theme}`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
        await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
        await page.goto('/hub');
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.locator('.pixel-strip')).toHaveCount(0);
        await expect(page.getByRole('region', { name: 'Year in Pixels' })).toHaveCount(0);
        const pixels = page.getByRole('navigation', { name: 'Shortcuts' }).getByRole('link', { name: 'Pixels', exact: true });
        await expect(pixels).toHaveAttribute('href', '/pixels');
        expect(await pixels.boundingBox().then(box => box?.height ?? 0)).toBeGreaterThanOrEqual(44);
        const fits = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
        expect(fits).toBe(true);
        await info.attach(`hub-no-strip-${width}-${theme}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      });
    }
  }
});
