import { expect, test } from '@playwright/test';
import { addItem, resetMedia } from './media-test';

test.beforeEach(async ({ request }) => resetMedia(request));

test('a failed library load returns focus to the heading when retry succeeds', async ({ page }) => {
  let failed = false;
  await page.route('**/media/api/library**', route => {
    if (!failed && route.request().method() === 'GET') {
      failed = true;
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Library offline' }) });
    }
    return route.continue();
  });
  await page.goto('/media/library');
  const retry = page.getByRole('button', { name: 'Retry library' });
  await expect(retry).toBeVisible();
  await retry.click();
  const heading = page.getByRole('heading', { name: 'Library', exact: true });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
  await expect(page.getByRole('button', { name: 'Retry library' })).toHaveCount(0);
});

test('returning from an item restores the library scroll position', async ({ page, request }) => {
  for (let index = 0; index < 18; index += 1) {
    await addItem(request, { title: 'Scroll story ' + String(index).padStart(2, '0') });
  }
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto('/media/library?sort=title');
  await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 900));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(800);
  const scrolled = await page.evaluate(() => window.scrollY);
  await page.evaluate(() => {
    const link = [...document.querySelectorAll('h2 a')].find(anchor => anchor.textContent?.trim() === 'Zebra');
    if (!(link instanceof HTMLAnchorElement)) throw new Error('Zebra link missing');
    link.click();
  });
  await expect(page).toHaveURL(/\/media\/item\//);
  await expect(page.getByRole('heading', { level: 1, name: 'Zebra', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/media\/library/);
  await expect(page.getByRole('heading', { level: 1, name: 'Library', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(scrolled - 80);
});
