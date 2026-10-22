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
  await expect(page.getByLabel('Progress', { exact: true })).toBeVisible();
  const gap = await page.evaluate(() => {
    const row = document.querySelector('.progress-controls')?.getBoundingClientRect();
    const again = document.querySelector('[data-action="log-again"]')?.getBoundingClientRect();
    if (!row || !again) return 999;
    return again.top - row.bottom;
  });
  expect(gap).toBeLessThan(32);
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
  await expect(progress).toHaveValue('40');
  await expect(page.locator('#progress-status')).toContainText('Not saved. Try again');
  await expect(page.locator('#progress-status')).toHaveAttribute('aria-live', 'off');
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

  const reviewPatches: string[] = [];
  page.on('request', request => {
    if (request.method() !== 'PATCH') return;
    const body = request.postData() || '';
    if (body.includes('"review"')) reviewPatches.push(body);
  });
  await note.fill('from the stale tab');
  await note.blur();
  await expect(page.locator('#toast-alerts')).toContainText('This note changed in another tab. Your text is kept as a draft.');
  await expect(page.locator('#toast-alerts .toast')).toHaveCount(1);
  await expect(page.locator('#note-status')).toContainText('Not saved. This note changed elsewhere.');
  await expect(page.locator('#note-status')).toHaveAttribute('aria-live', 'off');
  await expect(page.locator('#note-status').getByRole('button', { name: 'Reload' })).toBeVisible();
  await expect(note).toHaveValue('from the stale tab');
  await note.focus();
  await note.fill('still stale');
  await note.blur();
  expect(reviewPatches).toHaveLength(1);
  await expect(note).toHaveValue('still stale');
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
  const statusSent = page.waitForRequest(request => {
    if (request.method() !== 'PATCH') return false;
    try {
      return Object.prototype.hasOwnProperty.call(request.postDataJSON() ?? {}, 'status');
    } catch {
      return false;
    }
  });
  const clicked = status.click();
  await statusSent;
  releaseSave();
  await clicked;
  await expect(progress).toHaveValue('120');
  await expect(status).toHaveClass(/is-on/);
  await expect.poll(async () => (await (await request.get(`/media/api/entries/${dune.id}`)).json()).progress_value).toBe(120);
});

async function settleControl(page: import('@playwright/test').Page, name: string, exact = false) {
  const opinion = page.locator('.opinion');
  await opinion.evaluate(node => { node.dataset.generation = 'old'; });
  const refreshed = page.waitForResponse(response => (
    response.request().method() === 'GET'
    && /\/api\/entries\/\d+$/.test(response.url())
    && response.ok()
  ));
  await page.getByRole('button', { name, exact }).click();
  await refreshed;
  await expect(opinion).not.toHaveAttribute('data-generation', 'old');
  const button = page.getByRole('button', { name, exact });
  await expect(button).toBeFocused();
  return button;
}

test('status, favorite, and again keep focus on the same control', async ({ page }) => {
  await page.goto('/media/#/library');
  await page.getByRole('link', { name: /Dune/ }).click();
  const paused = await settleControl(page, 'Paused');
  await expect(paused).toHaveClass(/is-on/);
  const favorite = await settleControl(page, 'Favorite', true);
  await expect(favorite).toHaveAttribute('aria-pressed', 'true');
  await settleControl(page, 'Again');
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
  await expect(page.locator('.error-panel')).not.toHaveAttribute('role', 'alert');

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
  await expect(page.locator('#search-results .error-panel')).toHaveAttribute('role', 'alert');
  await expect(input).toBeFocused();
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(error).toBeFocused();
  await expect(page.locator('#search-results .error-panel')).not.toHaveAttribute('role', 'alert');

  await page.unroute('**/api/search**');
  await page.route('**/api/search**', async route => {
    const url = new URL(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        query: url.searchParams.get('q'),
        results: [{
          source: 'openlibrary',
          source_id: 'synthetic-retry',
          kind: 'book',
          title: 'Retry Result',
          creator: 'Synthetic',
          year: 2001,
          overview: '',
          artwork_url: null,
          genres: [],
          external_ratings: [],
          releases: [],
          episodes: [],
          already_saved: false,
        }],
        providers: { openlibrary: 'ok' },
      }),
    });
  });
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'Retry Result' })).toBeFocused();
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
  const done = page.waitForResponse(response => (
    response.request().method() === 'PATCH'
    && response.url().includes(`/entries/${dune.id}`)
    && response.ok()
  ));
  releaseSave();
  await done;
  await expect(page.locator('#progress-draft')).toContainText('Unsaved progress from earlier');
});

test('the theme toggle names the theme it applies', async ({ page }) => {
  await page.goto('/media/');
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('[data-theme-value="dark"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-theme-value="light"]')).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(20, 19, 17)');
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('[data-theme-value="light"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(246, 243, 238)');
});

test('two quick note saves use the base from the first response', async ({ page, request }) => {
  const listed = await request.get('/media/api/library');
  const dune = (await listed.json()).items.find((item: { title: string }) => item.title === 'Dune');
  let releaseFirst: () => void = () => {};
  const gate = new Promise<void>(resolve => { releaseFirst = resolve; });
  const bases: string[] = [];
  let secondSent = false;
  await page.route('**/api/entries/**', async route => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as { review?: string; review_base?: string };
      if (typeof body.review === 'string') {
        bases.push(String(body.review_base ?? ''));
        if (bases.length === 1) await gate;
        else secondSent = true;
      }
    }
    await route.continue();
  });
  await page.goto(`/media/#/item/${dune.id}`);
  const note = page.getByLabel('Note');
  await note.fill('first draft');
  const first = note.blur();
  await expect.poll(() => bases.length).toBe(1);
  await note.focus();
  await note.fill('second draft');
  const second = note.blur();
  await new Promise<void>(resolve => {
    const timer = setInterval(() => {
      if (secondSent) {
        clearInterval(timer);
        clearTimeout(limit);
        resolve();
      }
    }, 20);
    const limit = setTimeout(() => {
      clearInterval(timer);
      resolve();
    }, 250);
  });
  expect(secondSent).toBe(false);
  releaseFirst();
  await expect.poll(() => bases.length).toBe(2);
  expect(bases[1]).not.toBe(bases[0]);
  await expect(note).toHaveValue('second draft');
  await expect(page.locator('#toast-alerts .toast')).toHaveCount(0);
  await expect.poll(async () => (await (await request.get(`/media/api/entries/${dune.id}`)).json()).review).toBe('second draft');
  await note.fill('third draft');
  await note.blur();
  await expect.poll(async () => (await (await request.get(`/media/api/entries/${dune.id}`)).json()).review).toBe('third draft');
  await expect(page.locator('#toast-alerts .toast')).toHaveCount(0);
});

test('a status click waits for the note save before drawing the new field', async ({ page, request }) => {
  const listed = await request.get('/media/api/library');
  const dune = (await listed.json()).items.find((item: { title: string }) => item.title === 'Dune');
  let releaseNote: () => void = () => {};
  const gate = new Promise<void>(resolve => { releaseNote = resolve; });
  const reviews: string[] = [];
  await page.route('**/api/entries/**', async route => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as { review?: string };
      if (typeof body.review === 'string') {
        reviews.push(body.review);
        await gate;
      }
    }
    await route.continue();
  });
  await page.goto(`/media/#/item/${dune.id}`);
  const note = page.getByLabel('Note');
  await note.fill('typed before pause');
  const paused = page.getByRole('button', { name: 'Paused' });
  const clicked = paused.click();
  await expect.poll(() => reviews.length).toBe(1);
  releaseNote();
  await clicked;
  await expect(page.getByRole('button', { name: 'Paused' })).toHaveClass(/is-on/);
  await expect(page.getByLabel('Note')).toHaveValue('typed before pause');
  const entry = await (await request.get(`/media/api/entries/${dune.id}`)).json();
  expect(entry.review).toBe('typed before pause');
  await expect(page.locator('textarea[data-review]')).toHaveAttribute('data-review-base', entry.review_updated_at || '');
  await expect(page.locator('#toast-alerts .toast')).toHaveCount(0);
  await page.getByLabel('Note').fill('after pause');
  await page.getByLabel('Note').blur();
  await expect.poll(async () => (await (await request.get(`/media/api/entries/${dune.id}`)).json()).review).toBe('after pause');
  await expect(page.locator('#toast-alerts .toast')).toHaveCount(0);
});

test('progress can change back to the previous value while a save is in flight', async ({ page, request }) => {
  const listed = await request.get('/media/api/library');
  const dune = (await listed.json()).items.find((item: { title: string }) => item.title === 'Dune');
  await page.goto(`/media/#/item/${dune.id}`);
  const progress = page.getByLabel('Progress', { exact: true });
  await progress.fill('120');
  await progress.press('Enter');
  await expect(page.locator('#progress-status')).toHaveText('Saved ✓');
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  let held = false;
  await page.route('**/api/entries/**', async route => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      if (Object.prototype.hasOwnProperty.call(body, 'progress_value') && !held) {
        held = true;
        await gate;
      }
    }
    await route.continue();
  });
  const sent = page.waitForRequest(req => req.method() === 'PATCH' && (req.postData() || '').includes('130'));
  await progress.fill('130');
  await progress.press('Enter');
  await sent;
  await progress.fill('120');
  await progress.press('Enter');
  release();
  await expect.poll(async () => (await (await request.get(`/media/api/entries/${dune.id}`)).json()).progress_value).toBe(120);
  await expect(progress).toHaveValue('120');
});

test('a failed note save keeps the typed text', async ({ page, request }) => {
  const listed = await request.get('/media/api/library');
  const dune = (await listed.json()).items.find((item: { title: string }) => item.title === 'Dune');
  const before = await (await request.get(`/media/api/entries/${dune.id}`)).json();
  await page.route('**/api/entries/**', async route => {
    if (route.request().method() === 'PATCH' && (route.request().postData() || '').includes('"review"')) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      return;
    }
    await route.continue();
  });
  await page.goto(`/media/#/item/${dune.id}`);
  const note = page.getByLabel('Note');
  await note.fill('keep this draft');
  await note.blur();
  await expect(note).toHaveValue('keep this draft');
  await expect(page.locator('#note-status')).toContainText('Not saved. Try again');
  await expect(page.locator('#note-status')).toHaveAttribute('aria-live', 'off');
  await expect(page.locator('#toast-alerts')).toContainText('Request failed (500).');
  const kept = await (await request.get(`/media/api/entries/${dune.id}`)).json();
  expect(kept.review).toBe(before.review);
});

test('a retry toast stays until it is dismissed', async ({ page, request }) => {
  await page.clock.install();
  const listed = await request.get('/media/api/library');
  const dune = (await listed.json()).items.find((item: { title: string }) => item.title === 'Dune');
  await page.route('**/api/entries/**', route => {
    if (route.request().method() === 'PATCH') {
      route.abort('failed');
      return;
    }
    route.continue();
  });
  await page.goto(`/media/#/item/${dune.id}`);
  await page.getByLabel('Progress', { exact: true }).fill('40');
  await page.getByLabel('Progress', { exact: true }).press('Enter');
  const retry = page.locator('#toast-alerts').getByRole('button', { name: 'Retry' });
  await expect(retry).toBeVisible();
  await page.clock.runFor(12_000);
  await expect(retry).toBeVisible();
  await page.locator('#toast-alerts').getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.locator('#toast-alerts .toast')).toHaveCount(0);
});

test('at most three toasts are visible and the newest sits last', async ({ page, request }) => {
  const listed = await request.get('/media/api/library');
  const dune = (await listed.json()).items.find((item: { title: string }) => item.title === 'Dune');
  let n = 0;
  await page.route('**/api/entries/**', async route => {
    if (route.request().method() === 'PATCH' && (route.request().postData() || '').includes('"review"')) {
      n += 1;
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: `Note failed ${n}` }),
      });
      return;
    }
    await route.continue();
  });
  await page.goto(`/media/#/item/${dune.id}`);
  const note = page.getByLabel('Note');
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await note.fill(`draft ${attempt}`);
    await note.blur();
    await expect(page.locator('#toast-alerts')).toContainText(`Note failed ${attempt}`);
  }
  await expect(page.locator('.toast')).toHaveCount(3);
  await expect(page.locator('#toast-alerts')).not.toContainText('Note failed 1');
  await page.evaluate(() => { location.hash = '#/library?sort=nope'; });
  await expect(page.locator('#toasts')).toContainText("That sort isn't available. Showing recently active.");
  await expect(page.locator('.toast')).toHaveCount(3);
  await expect(page.locator('#toast-alerts')).not.toContainText('Note failed 2');
  const order = await page.locator('.toast').evaluateAll(nodes => nodes
    .map(node => ({ top: node.getBoundingClientRect().top, text: node.textContent || '' }))
    .sort((a, b) => a.top - b.top));
  expect(order[order.length - 1].text).toContain("That sort isn't available");
  await expect(page.locator('.toast.is-alert .toast-icon').first()).toHaveText('⚠');
});
