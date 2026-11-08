import { expect, test } from '@playwright/test';

// Hub year strip. The town Playwright project matches this file
// (tests/e2e/config.ts). Seed `pixels` stores a birthday the card must not show.
test.describe('Hub year in pixels', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });

  test.beforeEach(async ({ page, request }) => {
    expect((await request.post('/e2e/reset?seed=pixels')).ok()).toBeTruthy();
    await page.clock.setFixedTime(new Date('2026-10-29T19:00:00Z'));
  });

  test('birthday stays off the request and the card, cells are not focusable, and a click opens the day', async ({ page }) => {
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

    await expect(card.locator('.pixel[tabindex], .pixel a, .pixel button')).toHaveCount(0);
    const tabIndexes = await cells.evaluateAll(nodes => nodes.map(node => (node as HTMLElement).tabIndex));
    expect(tabIndexes.every(index => index < 0)).toBe(true);
    await card.getByRole('link', { name: 'Open Pixels' }).focus();
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.classList.contains('pixel') === true)).toBe(false);

    await card.locator('.pixel[data-date="2026-08-15"]').click();
    await page.waitForURL(/\/pixels/);
    const opened = new URL(page.url());
    expect(opened.pathname).toBe('/pixels');
    expect(opened.searchParams.get('year')).toBe('2026');
    expect(opened.searchParams.get('day')).toBe('2026-08-15');
    expect(pixelUrls.every(raw => !new URL(raw).searchParams.has('profile'))).toBe(true);
    expect(birthdayUrls).toEqual([]);
  });
});
