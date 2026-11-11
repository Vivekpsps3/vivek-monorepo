import { expect, test } from '../../../tests/e2e/fixtures';

// Hub year strip. The town Playwright project matches this file
// (tests/e2e/config.ts). Seed `pixels` stores a birthday the card must not show.
test.describe('Hub year in pixels', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });

  test.beforeEach(async ({ page, request }) => {
    expect((await request.post('/e2e/reset?seed=pixels')).ok()).toBeTruthy();
    await page.clock.setFixedTime(new Date('2026-10-29T19:00:00Z'));
  });

  test('birthday stays off the card, and pointer and keyboard open the same past and future dates', async ({ page }) => {
    const pixelUrls: string[] = [];
    const birthdayUrls: string[] = [];
    page.on('request', req => {
      const url = new URL(req.url());
      if (url.pathname === '/api/pixels') pixelUrls.push(req.url());
      if (url.pathname.includes('birthday') || url.searchParams.has('birthday') || url.searchParams.get('profile') === '1') {
        birthdayUrls.push(req.url());
      }
    });

    await page.goto('/hub');
    const card = page.getByRole('region', { name: 'Year in Pixels' });
    await expect(card.getByRole('heading', { name: 'Year in Pixels' })).toBeVisible();
    await expect(card.getByRole('link', { name: 'Open Pixels' })).toHaveAttribute('href', '/pixels');
    await expect(card.getByRole('link')).toHaveCount(1);
    const cells = card.locator('.pixel');
    await expect(cells).toHaveCount(91);
    await expect(card).toContainText(/\d+ active days in the last 13 weeks/);
    await expect(card).toContainText(/Longest run: \d+ days/);
    await expect(card).not.toContainText('Finance');
    await expect(page.locator('body')).not.toContainText('1990-05-04');
    await expect(page.locator('body')).not.toContainText('1980-01-01');
    await expect(page.locator('body')).not.toContainText(/birthday/i);
    expect(await card.innerHTML()).not.toContain('1990-05-04');

    expect(pixelUrls.length).toBeGreaterThan(0);
    for (const raw of pixelUrls) {
      const url = new URL(raw);
      expect(url.searchParams.has('profile')).toBe(false);
      expect(url.searchParams.get('profile')).not.toBe('1');
    }
    expect(birthdayUrls).toEqual([]);

    await expect(card.locator('.pixel[aria-hidden="true"]')).toHaveCount(0);
    await expect(card.locator('[role="gridcell"]')).toHaveCount(91);
    await expect(card.locator('[role="gridcell"][tabindex="0"]')).toHaveCount(1);
    await expect(card.locator('[role="gridcell"][tabindex="-1"]')).toHaveCount(90);
    await expect(card.locator('[role="gridcell"][tabindex="0"]')).toHaveAttribute('data-date', '2026-10-29');

    await card.getByRole('link', { name: 'Open Pixels' }).focus();
    await page.keyboard.press('Tab');
    await expect(card.locator('[role="gridcell"][tabindex="0"]')).toBeFocused();
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.getAttribute('role') === 'gridcell')).toBe(false);

    const past = card.locator('[data-date="2026-10-22"]');
    const pastName = await past.getAttribute('aria-label');
    expect(pastName).toContain('2026');
    expect(pastName).not.toContain('future');
    await past.click();
    await expect(page).toHaveURL(/\/pixels/);
    expect(page.url()).toContain('year=2026');
    expect(page.url()).toContain('day=2026-10-22');

    await page.goto('/hub');
    const pastCard = page.getByRole('region', { name: 'Year in Pixels' });
    await expect(pastCard.locator('[data-date="2026-10-22"]')).toHaveAttribute('aria-label', pastName ?? '');
    await pastCard.locator('[role="gridcell"][tabindex="0"]').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(pastCard.locator('[data-date="2026-10-22"]')).toBeFocused();
    await expect(pastCard.locator('[role="gridcell"][tabindex="0"]')).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/pixels\?year=2026&day=2026-10-22/);

    await page.goto('/hub');
    const futureCard = page.getByRole('region', { name: 'Year in Pixels' });
    const future = futureCard.locator('[data-date="2026-10-30"]');
    const futureName = await future.getAttribute('aria-label');
    expect(futureName).toContain('future');
    expect(futureName).toContain('2026');
    await future.click();
    await expect(page).toHaveURL(/\/pixels\?year=2026&day=2026-10-30/);

    await page.goto('/hub');
    const futureAgain = page.getByRole('region', { name: 'Year in Pixels' });
    await expect(futureAgain.locator('[data-date="2026-10-30"]')).toHaveAttribute('aria-label', futureName ?? '');
    await futureAgain.locator('[role="gridcell"][tabindex="0"]').focus();
    await page.keyboard.press('ArrowDown');
    await expect(futureAgain.locator('[data-date="2026-10-30"]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/pixels\?year=2026&day=2026-10-30/);
    expect(pixelUrls.every(raw => !new URL(raw).searchParams.has('profile'))).toBe(true);
    expect(birthdayUrls).toEqual([]);
  });

  for (const width of [390, 1280]) {
    for (const theme of ['light', 'dark'] as const) {
      test(`13-week strip stays within 180px at ${width} ${theme}`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
        await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
        await page.goto('/hub');
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        const card = page.getByRole('region', { name: 'Year in Pixels' });
        const strip = card.locator('.pixel-strip');
        await expect(card.getByRole('link', { name: 'Open Pixels' })).toHaveAttribute('href', '/pixels');
        await expect(strip.locator('.pixel')).toHaveCount(91);
        await expect(card).toContainText(/\d+ active days in the last 13 weeks/);
        await expect(card).toContainText(/Longest run: \d+ days/);
        const box = await strip.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.height).toBeLessThanOrEqual(180);
        expect(box!.height).toBeGreaterThan(40);
        expect(box!.width).toBeLessThanOrEqual(width);
        const fits = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
        expect(fits).toBe(true);
        await info.attach(`hub-strip-${width}-${theme}`, { body: await strip.screenshot(), contentType: 'image/png' });
      });
    }
  }
});
