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
  await expect(page.locator('#progress-status')).toHaveText('Saved ✓');
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
  await expect(page.locator('#toasts')).toContainText("That sort isn't available. Showing recently active.");
  await expect(page.locator('#notice')).toHaveCount(0);
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
  const noteDraft = page.locator('#note-draft');
  await expect(noteDraft).toContainText('Unsaved note from earlier.');
  await expect(noteDraft.getByRole('button', { name: 'Restore' })).toBeVisible();
  await expect(noteDraft.getByRole('button', { name: 'Discard' })).toBeVisible();

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
  await progress.press('Enter');
  await expect(page.locator('#progress-status')).toContainText('Not saved. Try again');
  await expect(page.locator('#toast-alerts')).toContainText("Couldn't save your progress. Try again.");
  await expect(page.locator('#toast-alerts').getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect.poll(() => page.evaluate(id => localStorage.getItem(`media-progress-draft:${id}`), dune.id)).toContain('40');

  const newer = await request.patch(`/media/api/entries/${dune.id}`, {
    data: { progress_value: 200, progress_unit: 'page' },
  });
  expect(newer.ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByLabel('Progress', { exact: true })).toHaveValue('200');
  const choice = page.locator('#progress-draft');
  await expect(choice).toContainText("Unsaved progress from earlier (p. 40).");
  await expect(choice).toContainText('Saved elsewhere since: p. 200.');
  await expect(choice.getByRole('button', { name: 'Restore' })).toBeVisible();
  await expect(choice.getByRole('button', { name: 'Discard' })).toBeVisible();

  await page.getByRole('navigation', { name: 'Media' }).getByRole('link', { name: 'Calendar', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/20\d\d/);
  const after = await request.get(`/media/api/entries/${dune.id}`);
  expect((await after.json()).progress_value).toBe(200);
});

test('restoring a progress draft saves on blur and navigation', async ({ page, request }) => {
  const listed = await request.get('/media/api/library');
  const dune = (await listed.json()).items.find((item: { title: string }) => item.title === 'Dune');
  const seeded = await request.patch(`/media/api/entries/${dune.id}`, {
    data: { progress_value: 200, progress_unit: 'page' },
  });
  expect(seeded.ok()).toBeTruthy();

  const plant = (base: string) => page.evaluate(({ id, base }) => {
    localStorage.setItem(`media-progress-draft:${id}`, JSON.stringify({
      value: '40',
      unit: 'page',
      base,
    }));
  }, { id: dune.id, base });

  await page.goto(`/media/#/item/${dune.id}`);
  await plant('10|page');
  await page.reload();
  const progress = page.getByLabel('Progress', { exact: true });
  await expect(progress).toHaveValue('200');
  const choice = page.locator('#progress-draft');
  await expect(choice).toContainText("Unsaved progress from earlier (p. 40).");
  await expect(choice).toContainText('Saved elsewhere since: p. 200.');
  await choice.getByRole('button', { name: 'Restore' }).click();
  await expect(progress).toHaveValue('40');
  await progress.blur();
  await expect(page.locator('#progress-draft')).toHaveCount(0);
  await expect(page.locator('#progress-status')).toHaveText('Saved ✓');
  await expect.poll(async () => (await (await request.get(`/media/api/entries/${dune.id}`)).json()).progress_value).toBe(40);

  const again = await request.patch(`/media/api/entries/${dune.id}`, {
    data: { progress_value: 200, progress_unit: 'page' },
  });
  expect(again.ok()).toBeTruthy();
  await plant('10|page');
  await page.reload();
  await expect(page.getByLabel('Progress', { exact: true })).toHaveValue('200');
  await page.locator('#progress-draft').getByRole('button', { name: 'Restore' }).click();
  await page.evaluate(() => { location.hash = '#/calendar'; });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/20\d\d/);
  await expect.poll(async () => (await (await request.get(`/media/api/entries/${dune.id}`)).json()).progress_value).toBe(40);
  await page.goto(`/media/#/item/${dune.id}`);
  await expect(page.getByLabel('Progress', { exact: true })).toHaveValue('40');
  await expect(page.locator('#progress-draft')).toHaveCount(0);
});

test('an unknown progress draft unit is not saved as null', async ({ page, request }) => {
  const listed = await request.get('/media/api/library');
  const dune = (await listed.json()).items.find((item: { title: string }) => item.title === 'Dune');
  await page.goto(`/media/#/item/${dune.id}`);
  await page.evaluate(id => {
    localStorage.setItem(`media-progress-draft:${id}`, JSON.stringify({
      value: '7',
      unit: 'hours',
      base: '40|page',
    }));
  }, dune.id);
  await page.reload();
  const unit = page.getByLabel('Unit');
  await expect(unit).toHaveValue('page');
  const choice = page.locator('#progress-draft');
  await choice.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByLabel('Progress', { exact: true })).toHaveValue('7');
  await expect(unit).toHaveValue('page');
  await page.getByLabel('Progress', { exact: true }).blur();
  await expect(page.locator('#progress-draft')).toHaveCount(0);
  await expect(page.locator('#progress-status')).toHaveText('Saved ✓');
  await expect.poll(async () => (await (await request.get(`/media/api/entries/${dune.id}`)).json()).progress_value).toBe(7);
  const saved = await (await request.get(`/media/api/entries/${dune.id}`)).json();
  expect(saved.progress_unit).toBe('page');

  await page.evaluate(id => {
    localStorage.setItem(`media-progress-draft:${id}`, JSON.stringify({
      value: '8',
      unit: 'page',
      base: '7|page',
    }));
  }, dune.id);
  await page.reload();
  await page.locator('#progress-draft').getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByLabel('Progress', { exact: true })).toBeFocused();
  await expect(page.locator('#progress-draft')).toHaveCount(0);
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
  await expect(page.locator('#toast-alerts')).toContainText('This note changed in another tab. Your text is kept as a draft.');
  await expect(page.locator('#toast-alerts .toast')).toHaveCount(1);
  await note.blur();
  await expect(page.locator('#toast-alerts .toast')).toHaveCount(1);
  await page.locator('#toast-alerts').getByRole('button', { name: 'Reload' }).click();
  await expect(page.locator('#note-draft')).toContainText('Unsaved note from earlier.');
  await expect(page.locator('#notice')).toHaveCount(0);
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

test('progress stays 120 after a status change re-renders the item', async ({ page, request }) => {
  const listed = await request.get('/media/api/library');
  const dune = (await listed.json()).items.find((item: { title: string }) => item.title === 'Dune');
  await page.goto(`/media/#/item/${dune.id}`);
  let releaseSave: () => void = () => {};
  const gate = new Promise<void>(resolve => {
    releaseSave = resolve;
  });
  await page.route('**/api/entries/**', async route => {
    if (route.request().method() !== 'PATCH') {
      await route.continue();
      return;
    }
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(body, 'progress_value')) await gate;
    await route.continue();
  });
  const progress = page.getByLabel('Progress', { exact: true });
  await progress.fill('120');
  const status = page.getByRole('button', { name: 'Paused' });
  const clicked = status.click();
  await page.waitForTimeout(200);
  releaseSave();
  await clicked;
  await expect(progress).toHaveValue('120');
  await expect(status).toHaveClass(/is-on/);
  await expect.poll(async () => (await (await request.get(`/media/api/entries/${dune.id}`)).json()).progress_value).toBe(120);
});

test('status, favorite, and again keep focus on the same control', async ({ page }) => {
  await page.goto('/media/#/library');
  await page.getByRole('link', { name: /Dune/ }).click();
  const paused = page.getByRole('button', { name: 'Paused' });
  await paused.click();
  await expect(paused).toBeFocused();
  const favorite = page.getByRole('button', { name: 'Favorite', exact: true });
  await favorite.click();
  await expect(favorite).toBeFocused();
  const again = page.getByRole('button', { name: 'Again' });
  await again.click();
  await expect(again).toBeFocused();
});

test('a missing item is one error panel and a success toast survives navigation', async ({ page }) => {
  await page.goto('/media/#/item/999');
  const panel = page.locator('.error-panel');
  await expect(panel).toHaveCount(1);
  await expect(panel.getByRole('heading', { name: "This item isn't in your library" })).toBeFocused();
  await expect(panel.getByText('It may have been removed.')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(panel.getByRole('link', { name: 'Open library' })).toBeVisible();
  await expect(panel.getByRole('link', { name: 'Search' })).toBeVisible();
  await expect(page.locator('#toasts')).toBeEmpty();
  await expect(page.locator('#toast-alerts')).toBeEmpty();
  await expect(page.locator('.error-panel[role="alert"]')).toHaveCount(1);

  await page.goto('/media/#/new');
  await page.getByLabel('Title').fill('Synthetic Toast Title');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page).toHaveURL(/#\/item\//);
  await expect(page.locator('#toasts')).toContainText('Saved in your library.');
});

test('a slow route shows a skeleton and a fast one does not flash', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __skeletonShown: boolean }).__skeletonShown = false;
    const observer = new MutationObserver(() => {
      if (document.querySelector('.skeleton')) {
        (window as unknown as { __skeletonShown: boolean }).__skeletonShown = true;
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
  await page.goto('/media/#/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __skeletonShown: boolean }).__skeletonShown)).toBe(false);
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');

  await page.goto('/media/#/calendar');
  await expect(page.locator('.calendar-grid')).toBeVisible();
  await page.route('**/api/summary', async route => {
    await new Promise(resolve => setTimeout(resolve, 400));
    await route.continue();
  });
  await page.evaluate(() => { location.hash = '#/'; });
  await expect(page.locator('.skeleton').first()).toBeVisible();
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('.skeleton-home')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('.skeleton')).toHaveCount(0);
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
});

test('try again focuses the page heading when the route recovers', async ({ page }) => {
  let failed = false;
  await page.route('**/api/summary', async route => {
    if (!failed) {
      failed = true;
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'nope' }) });
      return;
    }
    await route.continue();
  });
  await page.goto('/media/#/');
  await expect(page.getByRole('heading', { name: "Couldn't load your journal" })).toBeFocused();
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('.error-panel')).toHaveCount(0);
  await expect(page.locator('#app h1')).toBeFocused();
});

test('a slow status change does not skeleton the open item', async ({ page, request }) => {
  const listed = await request.get('/media/api/library');
  const dune = (await listed.json()).items.find((item: { title: string }) => item.title === 'Dune');
  await page.goto(`/media/#/item/${dune.id}`);
  await expect(page.getByRole('heading', { name: 'Dune' })).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { __skeletonShown: boolean }).__skeletonShown = false;
    const observer = new MutationObserver(() => {
      if (document.querySelector('.skeleton')) {
        (window as unknown as { __skeletonShown: boolean }).__skeletonShown = true;
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
  await page.route(`**/api/entries/${dune.id}`, async route => {
    await new Promise(resolve => setTimeout(resolve, 400));
    await route.continue();
  });
  await page.getByRole('button', { name: 'Paused' }).click();
  await expect(page.getByRole('button', { name: 'Paused' })).toHaveClass(/is-on/);
  await expect(page.locator('.skeleton')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __skeletonShown: boolean }).__skeletonShown)).toBe(false);
});

test('library keeps the current cards until the skeleton delay', async ({ page }) => {
  await page.goto('/media/#/library');
  await expect(page.locator('[data-library-body] .card').first()).toBeVisible();
  await page.route('**/api/library**', async route => {
    await new Promise(resolve => setTimeout(resolve, 400));
    await route.continue();
  });
  await page.evaluate(() => {
    const state = { sawCards: false, sawSkeleton: false, blanked: false };
    (window as unknown as { __library: typeof state }).__library = state;
    const observer = new MutationObserver(() => {
      const slot = document.querySelector('[data-library-body]');
      if (!slot) return;
      const cards = slot.querySelectorAll('.card').length;
      const skeletons = slot.querySelectorAll('.skeleton').length;
      if (cards > 0 && skeletons === 0) state.sawCards = true;
      if (skeletons > 0) state.sawSkeleton = true;
      if (cards === 0 && skeletons === 0) state.blanked = true;
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
  await page.locator('a.status-mark', { hasText: /^Book$/ }).click();
  await expect(page.locator('[data-library-body] .skeleton').first()).toBeVisible();
  const trace = await page.evaluate(() => (window as unknown as { __library: { sawCards: boolean, sawSkeleton: boolean, blanked: boolean } }).__library);
  expect(trace.sawCards).toBe(true);
  expect(trace.sawSkeleton).toBe(true);
  expect(trace.blanked).toBe(false);
});

test('typing a search does not move focus onto the error', async ({ page }) => {
  await page.route('**/api/search**', async route => {
    await new Promise(resolve => setTimeout(resolve, 250));
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'nope' }) });
  });
  await page.goto('/media/#/search');
  const input = page.getByLabel('Search');
  await input.fill('du');
  await expect(page.locator('#search-results')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('main')).not.toHaveAttribute('aria-busy', 'true');
  const error = page.getByRole('heading', { name: "Search isn't working right now" });
  await expect(error).toBeVisible();
  await expect(input).toBeFocused();
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(error).toBeFocused();
});

test('media routes stay quiet under the enforced content security policy', async ({ page }) => {
  const nonce = 'cspchecknonce';
  const policy = [
    "default-src 'self'",
    `script-src 'nonce-${nonce}' 'strict-dynamic' 'self'`,
    "script-src-attr 'none'",
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  await page.route(url => {
    const path = new URL(url).pathname;
    return path === '/media' || path === '/media/';
  }, async route => {
    const response = await route.fetch();
    const body = (await response.text()).replaceAll('<script', `<script nonce="${nonce}"`);
    const headers = response.headers();
    headers['content-security-policy'] = policy;
    await route.fulfill({ response, body, headers });
  });
  const problems: string[] = [];
  page.on('console', message => {
    const text = message.text();
    if (/content security policy|refused to/i.test(text)) problems.push(text);
  });
  page.on('pageerror', error => problems.push(String(error)));
  await page.goto('/media/#/library');
  await expect(page.getByRole('heading', { name: 'Saved' })).toBeVisible();
  await page.goto('/media/#/search');
  await expect(page.getByRole('heading', { name: 'Search' })).toBeVisible();
  await page.goto('/media/#/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.goto('/media/#/library');
  await page.getByRole('link', { name: /Dune/ }).click();
  await expect(page.getByRole('heading', { name: 'Dune' })).toBeVisible();
  await page.goto('/media/#/calendar');
  await expect(page.locator('.calendar-grid')).toBeVisible();
  await page.goto('/media/#/library?sort=nope');
  await expect(page.locator('#toasts')).toContainText("That sort isn't available. Showing recently active.");
  await page.goto('/media/#/item/999');
  await expect(page.getByRole('heading', { name: "This item isn't in your library" })).toBeVisible();
  expect(problems).toEqual([]);
});

test('a finished progress save does not dismiss another item draft', async ({ page, request }) => {
  const listed = await request.get('/media/api/library');
  const items = (await listed.json()).items;
  const dune = items.find((item: { title: string }) => item.title === 'Dune');
  const alpha = items.find((item: { title: string }) => item.title === 'Alpha');
  await page.goto(`/media/#/item/${dune.id}`);
  let releaseSave: () => void = () => {};
  const gate = new Promise<void>(resolve => {
    releaseSave = resolve;
  });
  await page.route('**/api/entries/**', async route => {
    const url = route.request().url();
    if (route.request().method() === 'PATCH' && url.includes(`/entries/${dune.id}`)) await gate;
    await route.continue();
  });
  await page.getByLabel('Progress', { exact: true }).fill('15');
  await page.getByLabel('Progress', { exact: true }).press('Enter');
  await page.evaluate(id => {
    localStorage.setItem(`media-progress-draft:${id}`, JSON.stringify({
      value: '3',
      unit: 'page',
      base: '|page',
    }));
  }, alpha.id);
  await page.goto(`/media/#/item/${alpha.id}`);
  await expect(page.locator('#progress-draft')).toContainText('Unsaved progress from earlier');
  releaseSave();
  await page.waitForTimeout(400);
  await expect(page.locator('#progress-draft')).toContainText('Unsaved progress from earlier');
});
