import { expect, test } from '@playwright/test';

test('hub and screen URLs redirect into the journal', async ({ page, request }) => {
  const library = await request.get('/media/library?sort=title', { maxRedirects: 0 });
  expect(library.status()).toBe(302);
  expect(library.headers()['location']).toBe('/media/#/library?sort=title');

  const hub = await request.get('/hub/media/extra', { maxRedirects: 0 });
  expect(hub.status()).toBe(302);
  expect(hub.headers()['location']).toBe('/media/');

  await page.goto('/hub/media');
  await expect(page).toHaveURL(/\/media\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.screenshot({ path: '/opt/cursor/artifacts/screenshots/after-hub-media.png', fullPage: true });
});

test('progress saves with a unit and survives reload and Again', async ({ page }) => {
  await page.goto('/media/#/library');
  await page.getByRole('link', { name: /Dune/ }).click();
  const progress = page.getByLabel('Progress', { exact: true });
  await progress.fill('120');
  await page.getByLabel('Unit').selectOption('page');
  await progress.press('Enter');
  await expect(page.locator('#progress-status')).toHaveText('Saved');
  await expect(page.locator('#progress-help')).toHaveText('p. 120');
  await page.screenshot({ path: '/opt/cursor/artifacts/screenshots/after-progress.png', fullPage: true });

  await page.reload();
  await expect(page.getByLabel('Progress', { exact: true })).toHaveValue('120');
  await expect(page.getByLabel('Unit')).toHaveValue('page');

  await page.getByRole('button', { name: 'Again' }).click();
  await expect(page.getByLabel('Progress', { exact: true })).toHaveValue('120');
  await expect(page.getByLabel('Unit')).toHaveValue('page');
});

test('title sort works and an unknown sort does not fail the page', async ({ page }) => {
  const rejected: string[] = [];
  page.on('response', response => {
    if (response.status() === 422) rejected.push(response.url());
  });

  await page.goto('/media/#/library?sort=title');
  await expect(page.getByLabel('Sort')).toHaveValue('title');
  await expect(page.locator('.card-title')).toHaveText(['Alpha', 'Dune', 'Zebra']);
  await page.screenshot({ path: '/opt/cursor/artifacts/screenshots/after-library-sort.png', fullPage: true });

  await page.goto('/media/#/library?sort=nope');
  await expect(page.getByRole('heading', { name: 'Saved' })).toBeVisible();
  await expect(page.locator('#notice')).toHaveText("That sort isn't available. Showing recently active.");
  await expect(page).not.toHaveURL(/sort=nope/);
  expect(rejected).toEqual([]);
});

test('a saved note clears its draft and an older draft loses', async ({ page }) => {
  await page.goto('/media/#/library');
  await page.getByRole('link', { name: /Dune/ }).click();
  const note = page.getByLabel('Note');
  const id = await page.locator('.opinion').getAttribute('data-id');
  await note.fill('A fresh note');
  await note.blur();
  await expect.poll(async () => page.evaluate(entryId => localStorage.getItem(`media-review-draft:${entryId}`), id)).toBeNull();
  await page.reload();
  await expect(page.getByLabel('Note')).toHaveValue('A fresh note');

  await page.evaluate(entryId => {
    localStorage.setItem(`media-review-draft:${entryId}`, JSON.stringify({
      text: 'OLD',
      at: '2000-01-01T00:00:00.000Z',
    }));
  }, id);
  await page.reload();
  await expect(page.getByLabel('Note')).toHaveValue('A fresh note');

  await page.evaluate(entryId => {
    localStorage.setItem(`media-review-draft:${entryId}`, JSON.stringify({
      text: '',
      at: '2099-01-01T00:00:00.000Z',
    }));
  }, id);
  await page.reload();
  await expect(page.getByLabel('Note')).toHaveValue('A fresh note');

  await page.evaluate(entryId => {
    localStorage.setItem(`media-review-draft:${entryId}`, JSON.stringify({
      text: 'NEWER',
      at: '2099-01-01T00:00:00.000Z',
    }));
  }, id);
  await page.reload();
  await expect(page.getByLabel('Note')).toHaveValue('NEWER');
  await page.screenshot({ path: '/opt/cursor/artifacts/screenshots/after-review-draft.png', fullPage: true });
});

test('calendar marks today in the browser timezone', async ({ page }) => {
  await page.goto('/media/#/calendar');
  const today = await page.evaluate(() => {
    const parts = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const pick = (type) => parts.find((part) => part.type === type).value;
    return `${pick('year')}-${pick('month')}-${pick('day')}`;
  });
  await expect(page.locator('.cal-day.is-today time')).toHaveAttribute('datetime', today);
  await page.screenshot({ path: '/opt/cursor/artifacts/screenshots/after-calendar-today.png', fullPage: true });
});

test('a slower library response cannot replace a newer screen', async ({ page }) => {
  await page.goto('/media/#/');
  await page.route('**/api/library**', async route => {
    await new Promise(resolve => setTimeout(resolve, 800));
    await route.continue();
  });
  await page.getByRole('navigation', { name: 'Media' }).getByRole('link', { name: 'Library', exact: true }).click();
  await page.getByRole('navigation', { name: 'Media' }).getByRole('link', { name: 'Now', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('Saved');
  await page.waitForTimeout(1200);
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('Saved');
  await expect(page.locator('nav [aria-current="page"]')).toHaveText('Now');
});

test('a slower search for the previous type cannot replace the current one', async ({ page }) => {
  let releaseMovies: () => void = () => {};
  const moviesGate = new Promise<void>(resolve => {
    releaseMovies = resolve;
  });
  await page.route('**/api/search**', async route => {
    const url = new URL(route.request().url());
    const kind = url.searchParams.get('kind') || 'all';
    if (kind === 'movie') await moviesGate;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        query: url.searchParams.get('q'),
        results: [{
          source: 'openlibrary',
          source_id: `synthetic-${kind}`,
          kind: kind === 'book' ? 'book' : 'movie',
          title: `Result ${kind}`,
          creator: 'Synthetic',
          year: 2000,
          overview: '',
          artwork_url: null,
          genres: [],
          external_ratings: [],
          extra: {},
          releases: [],
          episodes: [],
          already_saved: false,
        }],
        providers: { openlibrary: 'ok' },
      }),
    });
  });

  await page.goto('/media/#/search');
  await page.getByLabel('Search').fill('dune');
  await page.getByLabel('Type').selectOption('movie');
  await page.getByLabel('Type').selectOption('book');
  await expect(page.getByRole('heading', { name: 'Result book' })).toBeVisible();
  releaseMovies();
  await page.waitForTimeout(400);
  await expect(page.getByRole('heading', { name: 'Result book' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Result movie' })).toHaveCount(0);
  await expect(page.getByLabel('Type')).toHaveValue('book');
});
