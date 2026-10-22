import path from 'node:path';

import { expect, test } from '@playwright/test';

const dir = process.env.SCREENSHOT_DIR;

test.describe('phase 0 screenshot matrix', () => {
  test.skip(!dir, 'Set SCREENSHOT_DIR to capture the 390/768/1280 light and dark matrix.');

  test('progress, sort, and album art at the spec widths', async ({ page, request }) => {
    const origin = process.env.MEDIA_E2E_ORIGIN || 'http://127.0.0.1:8097';
    const cover = `${origin}/synthetic-cover.png`;
    const artist = await request.post('/media/api/library', {
      data: { kind: 'artist', title: 'Synthetic Band', status: 'want' },
    });
    expect(artist.ok()).toBeTruthy();
    const artistId = (await artist.json()).id;
    const album = await request.post(`/media/api/entries/${artistId}/albums`, {
      data: { title: 'Synthetic Album', artwork_url: cover },
    });
    expect(album.ok()).toBeTruthy();

    const shots: Array<[string, string]> = [
      ['/media/#/item/1', 't02-progress'],
      ['/media/#/library?sort=title', 't04-library-sort'],
      [`/media/#/item/${artistId}`, 't08-album-art'],
      ['/media/#/item/1', 't09-contrast'],
    ];
    for (const width of [390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ['light', 'dark'] as const) {
        for (const [url, name] of shots) {
          await page.goto(url);
          await page.evaluate(value => {
            document.documentElement.setAttribute('data-theme', value);
            document.documentElement.setAttribute('data-theme-choice', value);
          }, theme);
          if (name === 't02-progress' || name === 't09-contrast') {
            await expect(page.getByLabel('Progress', { exact: true })).toBeVisible();
          }
          if (name === 't02-progress') {
            await page.getByLabel('Progress', { exact: true }).fill('120');
            await page.getByLabel('Unit').selectOption('page');
            await expect(page.locator('#progress-help')).toHaveText('p. 120');
          }
          if (name === 't04-library-sort') {
            await expect(page.getByLabel('Sort')).toHaveValue('title');
          }
          if (name === 't08-album-art') {
            await expect(page.locator('.cover-face img')).toBeVisible();
          }
          if (name === 't09-contrast') {
            await expect(page.locator('.status-mark').first()).toBeVisible();
          }
          const file = path.join(dir as string, `${name}-${width}-${theme}.png`);
          await page.screenshot({ path: file, fullPage: true });
        }
      }
    }
  });
});
