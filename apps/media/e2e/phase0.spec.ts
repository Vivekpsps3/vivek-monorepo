import path from 'node:path';

import { expect, test } from '@playwright/test';

function shot(name: string) {
  const dir = process.env.SCREENSHOT_DIR;
  if (dir) return path.join(dir, name);
  return test.info().outputPath(name);
}

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
  await page.screenshot({ path: shot('after-hub-media.png'), fullPage: true });
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
  await page.screenshot({ path: shot('after-progress.png'), fullPage: true });

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
  await page.screenshot({ path: shot('after-library-sort.png'), fullPage: true });

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

  const base = await page.getByLabel('Note').evaluate(node => (node as HTMLTextAreaElement).dataset.reviewBase || '');
  await page.evaluate(({ entryId, reviewBase }) => {
    localStorage.setItem(`media-review-draft:${entryId}`, JSON.stringify({
      text: 'OLD',
      base: '2000-01-01T00:00:00+00:00',
    }));
    return reviewBase;
  }, { entryId: id, reviewBase: base });
  await page.reload();
  await expect(page.getByLabel('Note')).toHaveValue('A fresh note');
  await expect(page.getByRole('button', { name: 'Restore unsaved note' })).toBeVisible();

  await page.evaluate(entryId => {
    localStorage.setItem(`media-review-draft:${entryId}`, JSON.stringify({
      text: '',
      base: '2099-01-01T00:00:00+00:00',
    }));
  }, id);
  await page.reload();
  await expect(page.getByLabel('Note')).toHaveValue('A fresh note');

  await page.evaluate(({ entryId, reviewBase }) => {
    localStorage.setItem(`media-review-draft:${entryId}`, JSON.stringify({
      text: 'NEWER',
      base: reviewBase,
    }));
  }, { entryId: id, reviewBase: base });
  await page.reload();
  await expect(page.getByLabel('Note')).toHaveValue('NEWER');
  await page.screenshot({ path: shot('after-review-draft.png'), fullPage: true });
});

test('calendar marks today in the browser timezone', async ({ page }) => {
  await page.goto('/media/#/calendar');
  const today = await page.evaluate(() => {
    const parts = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const pick = (type) => parts.find((part) => part.type === type).value;
    return `${pick('year')}-${pick('month')}-${pick('day')}`;
  });
  await expect(page.locator('.cal-day.is-today time')).toHaveAttribute('datetime', today);
  await expect(page.locator('.cal-day.is-today')).toHaveAttribute('aria-current', 'date');
  await page.screenshot({ path: shot('after-calendar-today.png'), fullPage: true });
});

test('navigation does not wait for a slow progress save', async ({ page }) => {
  await page.goto('/media/#/library');
  await page.getByRole('link', { name: /Dune/ }).click();
  let releaseSave: () => void = () => {};
  const gate = new Promise<void>(resolve => {
    releaseSave = resolve;
  });
  await page.route('**/api/entries/**', async route => {
    if (route.request().method() === 'PATCH') await gate;
    await route.continue();
  });
  await page.getByLabel('Progress', { exact: true }).fill('15');
  await page.getByRole('navigation', { name: 'Media' }).getByRole('link', { name: 'Calendar', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/20\d\d/, { timeout: 3000 });
  releaseSave();
});

test('a failed progress draft does not overwrite a newer save', async ({ page, request }) => {
  const listed = await request.get('/media/api/library');
  const dune = (await listed.json()).items.find((item: { title: string }) => item.title === 'Dune');
  await page.goto(`/media/#/item/${dune.id}`);
  const progress = page.getByLabel('Progress', { exact: true });
  await expect(progress).toBeVisible();
  await page.route('**/api/entries/**', route => {
    if (route.request().method() === 'PATCH') {
      route.abort('failed');
      return;
    }
    route.continue();
  });
  await progress.fill('40');
  await page.getByLabel('Unit').selectOption('page');
  await progress.press('Enter');
  await expect(page.locator('#progress-status')).toContainText("Progress wasn't saved");
  await expect.poll(() => page.evaluate(id => localStorage.getItem(`media-progress-draft:${id}`), dune.id)).toContain('40');

  const newer = await request.patch(`/media/api/entries/${dune.id}`, {
    data: { progress_value: 200, progress_unit: 'page' },
  });
  expect(newer.ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByLabel('Progress', { exact: true })).toHaveValue('200');
  const choice = page.locator('#progress-draft');
  await expect(choice).toContainText("Progress wasn't saved (p. 40).");
  await expect(choice.getByRole('button', { name: 'Restore' })).toBeVisible();
  await expect(choice.getByRole('button', { name: 'Discard' })).toBeVisible();

  await page.getByRole('navigation', { name: 'Media' }).getByRole('link', { name: 'Calendar', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/20\d\d/);
  const after = await request.get(`/media/api/entries/${dune.id}`);
  expect((await after.json()).progress_value).toBe(200);
});

test('blurring an unchanged note does not overwrite a newer save', async ({ page, request }) => {
  const listed = await request.get('/media/api/library');
  const dune = (await listed.json()).items.find((item: { title: string }) => item.title === 'Dune');
  await page.goto(`/media/#/item/${dune.id}`);
  const note = page.getByLabel('Note');
  await expect(note).toBeVisible();
  const changed = await request.patch(`/media/api/entries/${dune.id}`, { data: { review: 'Newer note from the other tab' } });
  expect(changed.ok()).toBeTruthy();
  await note.focus();
  await note.blur();
  const after = await request.get(`/media/api/entries/${dune.id}`);
  expect((await after.json()).review).toBe('Newer note from the other tab');

  await note.fill('from the stale tab');
  await note.blur();
  await expect(page.locator('#notice')).toHaveText('This note changed in another tab.');
  const kept = await request.get(`/media/api/entries/${dune.id}`);
  expect((await kept.json()).review).toBe('Newer note from the other tab');
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
