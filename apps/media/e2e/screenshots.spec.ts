import path from 'node:path';

import { expect, type Page, test } from '@playwright/test';

const dir = process.env.SCREENSHOT_DIR;
const backgrounds = {
  light: 'rgb(246, 243, 238)',
  dark: 'rgb(20, 19, 17)',
} as const;

async function assertTheme(page: Page, theme: 'light' | 'dark') {
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await expect(page.locator(`.topbar [data-theme-value="${theme}"]`)).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(backgrounds[theme]);
}

async function openThemed(page: Page, hash: string, theme: 'light' | 'dark') {
  await page.goto('/media/');
  await page.evaluate(value => {
    localStorage.setItem('suite-theme', value);
    localStorage.setItem('media-theme', value);
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('media-review-draft:') || key.startsWith('media-progress-draft:')) localStorage.removeItem(key);
    }
  }, theme);
  await page.reload();
  await assertTheme(page, theme);
  if (hash) await page.evaluate(value => { location.hash = value; }, hash);
}

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
          const hash = url.includes('#') ? url.slice(url.indexOf('#')) : '';
          await openThemed(page, hash, theme);
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
          await assertTheme(page, theme);
          const file = path.join(dir as string, `${name}-${width}-${theme}.png`);
          await page.screenshot({ path: file, fullPage: true });
        }
      }
    }
  });

  test('batch 1 views at 390, 768, and 1280 in light and dark', async ({ page, request }) => {
    test.setTimeout(180_000);
    const listed = await request.get('/media/api/library');
    const dune = (await listed.json()).items.find((item: { title: string }) => item.title === 'Dune');
    const capture = async (name: string, width: number, theme: 'light' | 'dark') => {
      await assertTheme(page, theme);
      const file = path.join(dir as string, `batch1-${name}-${width}-${theme}.png`);
      await page.screenshot({ path: file, fullPage: true });
    };
    for (const width of [390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ['light', 'dark'] as const) {
        await openThemed(page, `#/item/${dune.id}`, theme);
        await expect(page.getByRole('heading', { name: 'Dune' })).toBeVisible();
        await expect(page.locator('.mark').first()).toBeVisible();
        await capture('item', width, theme);

        await page.route('**/api/entries/**', async route => {
          if (route.request().method() === 'PATCH' && (route.request().postData() || '').includes('"review"')) {
            await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: "Couldn't save your note." }) });
            return;
          }
          await route.continue();
        });
        const note = page.getByLabel('Note');
        await note.fill('A note that could not be saved');
        await note.blur();
        await expect(page.locator('#toast-alerts .toast-icon')).toHaveText('⚠');
        await page.unroute('**/api/entries/**');
        await page.evaluate(() => { location.hash = '#/library?sort=nope'; });
        await expect(page.locator('#toasts')).toContainText("That sort isn't available. Showing recently active.");
        await expect(page.locator('.toast')).toHaveCount(2);
        await capture('toast', width, theme);
        while (await page.locator('.toast-dismiss').count()) {
          await page.locator('.toast-dismiss').first().click();
        }

        await page.evaluate(() => { location.hash = '#/item/999'; });
        await expect(page.getByRole('heading', { name: "This item isn't in your library" })).toBeVisible();
        await capture('error', width, theme);

        await page.route('**/api/library**', async route => {
          await new Promise(resolve => setTimeout(resolve, 1200));
          try { await route.continue(); } catch { /* the shot is already taken */ }
        });
        await page.evaluate(() => { location.hash = '#/library'; });
        await expect(page.locator('[data-library-body] .skeleton').first()).toBeVisible();
        await capture('skeleton', width, theme);
        await page.unroute('**/api/library**');
      }
    }
  });

  test('travel form borders at 390, 768, and 1280 in light and dark', async ({ page }) => {
    test.setTimeout(120_000);
    const travelCss = path.resolve('apps/travel/backend/static/app.css');
    await page.route('**/travel-preview/app.css', route => route.fulfill({
      contentType: 'text/css',
      path: travelCss,
    }));
    await page.route('**/travel-preview', route => route.fulfill({
      contentType: 'text/html',
      body: `<!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Travel</title>
          <script>
            (function () {
              var choice = "light";
              try {
                var stored = localStorage.getItem("media-theme");
                if (stored === "light" || stored === "dark") choice = stored;
              } catch (error) {}
              document.documentElement.setAttribute("data-theme", choice);
              document.documentElement.setAttribute("data-theme-choice", choice);
            })();
          </script>
          <link rel="stylesheet" href="/media/tokens.css">
          <link rel="stylesheet" href="/media/controls.css">
          <link rel="stylesheet" href="/travel-preview/app.css">
        </head>
        <body>
          <header class="topbar"><div class="topbar-inner"><a class="brand" href="#/">Travel</a>
            <div class="theme-switch" role="group" aria-label="Color mode">
              <button class="btn" type="button" data-theme-value="light" aria-pressed="false">Light</button>
              <button class="btn" type="button" data-theme-value="dark" aria-pressed="false">Dark</button>
            </div>
          </div></header>
          <main class="shell">
            <h1>New trip</h1>
            <form>
              <label>City <input value="Lisbon"></label>
              <label>When <input type="date" value="2026-11-03"></label>
              <label>Notes <textarea>Window seat</textarea></label>
              <button class="btn btn-primary" type="button">Save trip</button>
            </form>
          </main>
          <script>
            document.querySelectorAll("[data-theme-value]").forEach(function (button) {
              button.setAttribute("aria-pressed", String(button.getAttribute("data-theme-value") === document.documentElement.getAttribute("data-theme")));
            });
          </script>
        </body>
        </html>`,
    }));
    for (const width of [390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ['light', 'dark'] as const) {
        await page.goto('/media/');
        await page.evaluate(value => localStorage.setItem('media-theme', value), theme);
        await page.goto('/travel-preview');
        await expect(page.getByRole('heading', { name: 'New trip' })).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.locator(`[data-theme-value="${theme}"]`)).toHaveAttribute('aria-pressed', 'true');
        expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(backgrounds[theme]);
        const border = await page.locator('input').first().evaluate(node => getComputedStyle(node).borderTopColor);
        expect(border).toBe(theme === 'light' ? 'rgb(128, 120, 111)' : 'rgb(132, 126, 117)');
        const file = path.join(dir as string, `batch1-travel-${width}-${theme}.png`);
        await page.screenshot({ path: file, fullPage: true });
      }
    }
  });

  test('bundle M screens at 390, 768, and 1280 in light and dark', async ({ page }) => {
    test.setTimeout(180_000);
    const shots: Array<[string, string]> = [
      ['#/', 'now'],
      ['#/library', 'library'],
      ['#/search', 'search'],
      ['#/calendar', 'calendar'],
      ['#/item/1', 'item'],
      ['#/new', 'add'],
    ];
    const ready = async (name: string) => {
      await expect(page.locator('.toast')).toHaveCount(0);
      if (name === 'now') {
        await expect(page.getByRole('heading', { name: 'Now' })).toBeVisible();
        await expect(page.locator('.grid .card, .next-list, .empty, .quiet').first()).toBeVisible();
      }
      if (name === 'library') await expect(page.locator('.grid .card').first()).toBeVisible();
      if (name === 'search') await expect(page.getByText('Results come from public catalogs.')).toBeVisible();
      if (name === 'calendar') {
        await expect(page.getByRole('link', { name: 'Today' })).toBeVisible();
        await expect(page.locator('.calendar-grid [role="gridcell"][data-date]')).not.toHaveCount(0);
      }
      if (name === 'item') await expect(page.locator('.opinion .status-mark').first()).toBeVisible();
      if (name === 'add') await expect(page.getByLabel('Title')).toBeVisible();
    };
    for (const width of [390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ['light', 'dark'] as const) {
        for (const [hash, name] of shots) {
          await openThemed(page, hash, theme);
          if (name === 'item') await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
          await ready(name);
          await assertTheme(page, theme);
          await page.screenshot({ path: path.join(dir as string, `bundle-${name}-${width}-${theme}.png`), fullPage: true });
        }
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await openThemed(page, '#/library', theme);
        await ready('library');
        const duration = await page.locator('.card').first().evaluate(node => getComputedStyle(node).transitionDuration);
        expect(duration === '0s' || duration.startsWith('0s')).toBeTruthy();
        await expect(page.locator('.toast')).toHaveCount(0);
        await page.screenshot({ path: path.join(dir as string, `bundle-reduced-${width}-${theme}.png`), fullPage: true });
        await page.emulateMedia({ reducedMotion: 'no-preference' });
      }
    }
  });
});
