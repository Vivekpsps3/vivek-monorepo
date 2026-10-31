import { expect, test } from '@playwright/test';
import { addItem, deferred, openItem, reloadDraft, resetMedia, savedItem } from './media-test';

test.beforeEach(async ({ request }) => resetMedia(request));

test('legacy screen and hash bookmarks resolve to canonical journal screens', async ({ page, request }) => {
  expect((await request.get('/media/library', { maxRedirects: 0 })).status()).toBe(200);
  expect((await request.get('/media/new', { maxRedirects: 0 })).status()).toBe(308);
  expect((await request.get('/screen/library', { maxRedirects: 0 })).status()).toBe(404);
  await page.goto('/media/#/library?sort=title');
  await expect(page).toHaveURL(/\/media\/library\?sort=title$/);
  await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeVisible();
});

test('progress and its unit survive explicit save, state changes and reload', async ({ page, request }) => {
  const item = await addItem(request);
  await openItem(page, item.id);
  await page.getByLabel('Progress', { exact: true }).fill('120');
  await page.getByRole('combobox', { name: 'Unit', exact: true }).selectOption('page');
  await page.getByRole('combobox', { name: 'State', exact: true }).selectOption('in_progress');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Progress', { exact: true })).toHaveValue('120');
  await expect(page.getByRole('combobox', { name: 'Unit', exact: true })).toHaveValue('page');
  await expect(page.getByRole('combobox', { name: 'State', exact: true })).toHaveValue('in_progress');
});

test('title sort and an unknown sort preserve membership without crashing', async ({ page }) => {
  await page.goto('/media/library?sort=title');
  await expect(page.locator('media-card h2')).toHaveText(['Alpha', 'Dune', 'Zebra']);
  await page.goto('/media/library?sort=unknown');
  await expect(page.locator('media-card h2')).toHaveCount(3);
  await expect(page.locator('main [role=alert]')).toHaveCount(0);
});

test('saving a note clears its recovery copy and a same-version draft restores after reload', async ({ page, request }) => {
  const item = await addItem(request);
  await openItem(page, item.id);
  await page.getByLabel('Note').fill('Unsaved browser note');
  await reloadDraft(page);
  await expect(page.getByLabel('Note')).toHaveValue('Unsaved browser note');
  expect((await savedItem(request, item.id)).review).toBeNull();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved.', { exact: true })).toBeVisible();
  expect(await page.evaluate(id => sessionStorage.getItem('media-item-draft:1:' + id), item.id)).toBeNull();
  await page.reload();
  await expect(page.getByLabel('Note')).toHaveValue('Unsaved browser note');
});

test('an older draft is offered explicitly and never overwrites newer saved text', async ({ page, request }) => {
  const item = await addItem(request, { review: 'First saved note' });
  await openItem(page, item.id);
  await page.getByLabel('Note').fill('Older local draft');
  await request.patch('/media/api/entries/' + item.id, { data: { review: 'Newer server note' } });
  await reloadDraft(page);
  await expect(page.getByLabel('Note')).toHaveValue('Newer server note');
  await expect(page.getByRole('button', { name: 'Restore earlier draft' })).toBeVisible();
  await page.getByRole('button', { name: 'Restore earlier draft' }).click();
  await expect(page.getByLabel('Note')).toHaveValue('Older local draft');
  expect((await savedItem(request, item.id)).review).toBe('Newer server note');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved.', { exact: true })).toBeVisible();
  expect((await savedItem(request, item.id)).review).toBe('Older local draft');
});

test('discarding a stale draft keeps the saved note and removes only its recovery copy', async ({ page, request }) => {
  const item = await addItem(request, { review: 'Saved note' });
  await openItem(page, item.id);
  await page.getByLabel('Note').fill('Discard me');
  await request.patch('/media/api/entries/' + item.id, { data: { favorite: true } });
  await reloadDraft(page);
  await page.getByRole('button', { name: 'Discard earlier draft' }).click();
  await expect(page.getByLabel('Note')).toHaveValue('Saved note');
  await expect(page.getByRole('button', { name: 'Restore earlier draft' })).toHaveCount(0);
  expect(await page.evaluate(id => sessionStorage.getItem('media-item-draft:1:' + id), item.id)).toBeNull();
});

test('an invalid progress draft unit cannot silently become a saved null unit', async ({ page, request }) => {
  const item = await addItem(request);
  await openItem(page, item.id);
  await page.evaluate(({ id, base }) => sessionStorage.setItem('media-item-draft:1:' + id, JSON.stringify({
    base, fields: { review: '', rating: null, status: 'want', progress: 120, unit: 'unknown-unit', favorite: false, anticipated: false },
  })), { id: item.id, base: item.updated_at });
  await page.reload();
  await expect(page.getByLabel('Progress', { exact: true })).toHaveValue('');
  expect((await savedItem(request, item.id)).progress_value).toBeNull();
});

test('an unchanged note does not ride along with a favorite update and overwrite another tab', async ({ page, request }) => {
  const item = await addItem(request, { review: 'Original' });
  await openItem(page, item.id);
  await request.patch('/media/api/entries/' + item.id, { data: { review: 'Saved in another tab' } });
  const patches: object[] = [];
  await page.route('**/media/api/entries/' + item.id, route => {
    if (route.request().method() === 'PATCH') patches.push(route.request().postDataJSON());
    return route.continue();
  });
  await page.getByRole('checkbox', { name: 'Favorite', exact: true }).check();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved.', { exact: true })).toBeVisible();
  expect(patches).toEqual([{ favorite: true }]);
  expect((await savedItem(request, item.id)).review).toBe('Saved in another tab');
});

test('a conflicting note remains editable and can be compared with a reloaded saved item', async ({ page, request }) => {
  const item = await addItem(request, { review: 'Original' });
  await openItem(page, item.id);
  await request.patch('/media/api/entries/' + item.id, { data: { review: 'Another tab' } });
  await page.getByLabel('Note').fill('My retained draft');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('main [role=alert]')).toContainText('changed in another tab');
  await expect(page.getByLabel('Note')).toHaveValue('My retained draft');
  await page.getByRole('button', { name: 'Reload saved item' }).click();
  await expect(page.getByLabel('Note')).toHaveValue('Another tab');
  await expect(page.getByRole('button', { name: 'Restore earlier draft' })).toBeVisible();
});

test('a stalled save times out, retains the draft and leaves an explicit retry', async ({ page, request }) => {
  test.setTimeout(30_000);
  const item = await addItem(request);
  await openItem(page, item.id);
  const blocked = deferred();
  const entered = deferred();
  let pending: any;
  await page.route('**/media/api/entries/' + item.id, async route => {
    if (route.request().method() !== 'PATCH') return route.continue();
    pending = route; entered.resolve(); await blocked.promise;
  });
  await page.getByLabel('Note').fill('Retained through timeout');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await entered.promise;
  await expect(page.locator('main [role=alert]')).toContainText('timed out', { timeout: 15_000 });
  await expect(page.getByLabel('Note')).toHaveValue('Retained through timeout');
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  await page.unroute('**/media/api/entries/' + item.id);
  await pending.abort().catch(() => {});
  blocked.resolve();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved.', { exact: true })).toBeVisible();
  await expect(page.locator('main [role=alert]')).toHaveCount(0);
});

test('typing during an in-flight save is retained and the next save uses the returned base', async ({ page, request }) => {
  const item = await addItem(request);
  await openItem(page, item.id);
  const entered = deferred(), release = deferred();
  const patches: any[] = [];
  await page.route('**/media/api/entries/' + item.id, async route => {
    if (route.request().method() !== 'PATCH') return route.continue();
    patches.push(route.request().postDataJSON());
    const response = await route.fetch();
    if (patches.length === 1) { entered.resolve(); await release.promise; }
    await route.fulfill({ response });
  });
  await page.getByLabel('Note').fill('First version');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await entered.promise;
  await page.getByLabel('Note').fill('Second version');
  release.resolve();
  await expect(page.getByText('Submitted changes saved. Your newer edits still need saving.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Note')).toHaveValue('Second version');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved.', { exact: true })).toBeVisible();
  expect((await savedItem(request, item.id)).review).toBe('Second version');
  expect(patches[1].review_base).toBeTruthy();
  expect(patches[1].review_base).not.toBe(patches[0].review_base);
});

test('progress typed during an in-flight save is kept and the next save sends it', async ({ page, request }) => {
  const item = await addItem(request, { kind: 'book', title: 'Page counter' });
  await openItem(page, item.id, 'Page counter');
  const entered = deferred(), release = deferred();
  const patches: any[] = [];
  await page.route('**/media/api/entries/' + item.id, async route => {
    if (route.request().method() !== 'PATCH') return route.continue();
    patches.push(route.request().postDataJSON());
    const response = await route.fetch();
    if (patches.length === 1) { entered.resolve(); await release.promise; }
    await route.fulfill({ response });
  });
  const progress = page.getByLabel('Progress', { exact: true });
  const unit = page.getByRole('combobox', { name: 'Unit', exact: true });
  await progress.fill('40');
  await unit.selectOption('page');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await entered.promise;
  await progress.fill('55');
  await unit.selectOption('percent');
  release.resolve();
  await expect(page.getByText('Submitted changes saved. Your newer edits still need saving.', { exact: true })).toBeVisible();
  await expect(progress).toHaveValue('55');
  await expect(unit).toHaveValue('percent');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved.', { exact: true })).toBeVisible();
  const saved = await savedItem(request, item.id);
  expect(saved.progress_value).toBe(55);
  expect(saved.progress_unit).toBe('percent');
  expect(patches[0].progress_value).toBe(40);
  expect(patches[0].progress_unit).toBe('page');
  expect(patches[1].progress_value).toBe(55);
  expect(patches[1].progress_unit).toBe('percent');
});

test('leaving a slow save is deliberate and does not block the next screen', async ({ page, request }) => {
  const item = await addItem(request);
  await openItem(page, item.id);
  const entered = deferred(), release = deferred();
  await page.route('**/media/api/entries/' + item.id, async route => {
    if (route.request().method() !== 'PATCH') return route.continue();
    entered.resolve(); await release.promise; await route.abort().catch(() => {});
  });
  await page.getByLabel('Note').fill('Draft on the first item');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await entered.promise;
  await page.getByRole('navigation', { name: 'Media sections', exact: true }).getByRole('link', { name: 'Now', exact: true }).click();
  await page.getByRole('button', { name: 'Leave item', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Now/ })).toBeVisible();
  release.resolve();
  await expect(page.locator('main [role=alert]')).toHaveCount(0);
});

test('a late library response cannot replace Search and a late old-type search cannot replace the current type', async ({ page }) => {
  const libraryEntered = deferred(), libraryRelease = deferred();
  await page.route('**/media/api/library?**', async route => { libraryEntered.resolve(); await libraryRelease.promise; await route.fulfill({ json: { items: [], total: 0, offset: 0, limit: 24, has_more: false, continue: [] } }).catch(() => {}); });
  await page.goto('/media/library');
  await libraryEntered.promise;
  await page.getByRole('navigation', { name: 'Media sections', exact: true }).getByRole('link', { name: 'Search', exact: true }).click();
  libraryRelease.resolve();
  await expect(page.getByRole('heading', { name: 'Search Media', exact: true })).toBeVisible();
  const oldEntered = deferred(), oldRelease = deferred();
  await page.route('**/media/api/search?**', async route => {
    const kind = new URL(route.request().url()).searchParams.get('kind');
    if (kind === 'book') { oldEntered.resolve(); await oldRelease.promise; }
    await route.fulfill({ json: { results: [{ kind, title: kind === 'book' ? 'Old book result' : 'Current series result', source: 'fixture', source_id: kind }], sources: [], partial: false, total: 1, offset: 0, has_more: false } }).catch(() => {});
  });
  await page.getByRole('combobox', { name: 'Type', exact: true }).selectOption('book');
  await page.getByRole('searchbox').fill('a title');
  await oldEntered.promise;
  await page.getByRole('combobox', { name: 'Type', exact: true }).selectOption('tv');
  await expect(page.getByRole('heading', { name: 'Current series result' })).toBeVisible();
  oldRelease.resolve();
  await expect(page.getByRole('heading', { name: 'Old book result' })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Type', exact: true })).toHaveValue('tv');
});

test('typing a failed search retains focus in the query and a retry recovers locally', async ({ page }) => {
  let failed = true;
  await page.route('**/media/api/search?**', route => failed
    ? route.fulfill({ status: 502, json: { message: 'Source connection failed' } })
    : route.fulfill({ json: { results: [], sources: [], partial: false, total: 0, offset: 0, has_more: false } }));
  await page.goto('/media/search');
  await page.getByRole('searchbox').fill('No match');
  await expect(page.locator('main [role=alert]')).toContainText('Source connection failed');
  await expect(page.getByRole('searchbox')).toBeFocused();
  failed = false;
  await page.getByRole('button', { name: 'Retry search' }).click();
  await expect(page.getByText('No matching titles', { exact: true })).toBeVisible();
  await expect(page.locator('main [role=alert]')).toHaveCount(0);
});

test('a missing item is one local error and its retry can recover', async ({ page, request }) => {
  const item = await addItem(request);
  let missing = true;
  await page.route('**/media/api/entries/' + item.id, route => missing
    ? route.fulfill({ status: 404, json: { detail: 'That item is not in your library.' } }) : route.continue());
  await page.goto('/media/item/' + item.id);
  await expect(page.locator('main [role=alert]')).toHaveCount(1);
  await expect(page.locator('.toast.error')).toHaveCount(0);
  missing = false;
  await page.getByRole('button', { name: 'Retry item' }).click();
  await expect(page.getByRole('heading', { name: 'Browser story', exact: true })).toBeVisible();
  await expect(page.locator('main [role=alert]')).toHaveCount(0);
});

test('a slow item shows loading after the delay and a quick item does not flash it', async ({ page, request }) => {
  const item = await addItem(request);
  const entered = deferred(), release = deferred();
  await page.route('**/media/api/entries/' + item.id, async route => { entered.resolve(); await release.promise; await route.continue(); });
  await page.goto('/media/item/' + item.id);
  await entered.promise;
  await expect(page.getByText('Loading saved item…', { exact: true })).toBeVisible();
  release.resolve();
  await expect(page.getByRole('heading', { name: 'Browser story', exact: true })).toBeVisible();
  await expect(page.getByText('Loading saved item…', { exact: true })).toHaveCount(0);
  await page.unroute('**/media/api/entries/' + item.id);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Browser story', exact: true })).toBeVisible();
  await expect(page.getByText('Loading saved item…', { exact: true })).toHaveCount(0);
});

test('saving status, favorite and rating keeps the controls mounted and clears local errors', async ({ page, request }) => {
  const item = await addItem(request);
  await openItem(page, item.id);
  const note = page.getByLabel('Note');
  const original = await note.elementHandle();
  let failed = true;
  await page.route('**/media/api/entries/' + item.id, route => route.request().method() === 'PATCH' && failed
    ? route.fulfill({ status: 502, json: { message: 'Save unavailable' } }) : route.continue());
  await page.getByRole('combobox', { name: 'State', exact: true }).selectOption('completed');
  await page.getByRole('checkbox', { name: 'Favorite', exact: true }).check();
  await page.getByLabel('Rating').fill('0');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('main [role=alert]')).toContainText('Save unavailable');
  failed = false;
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved.', { exact: true })).toBeVisible();
  expect(await note.evaluate((node, saved) => node === saved, original)).toBe(true);
  const saved = await savedItem(request, item.id);
  expect([saved.status, saved.favorite, saved.rating]).toEqual(['completed', true, 0]);
  await expect(page.locator('main [role=alert]')).toHaveCount(0);
});

test('Media screens stay quiet under the production content security policy', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    (window as any).policyFailures = [];
    document.addEventListener('securitypolicyviolation', event => (window as any).policyFailures.push(event.violatedDirective));
  });
  for (const route of ['/media', '/media/library', '/media/calendar', '/media/search', '/media/add']) {
    await page.goto(route);
    await expect(page.locator('main h1')).toBeVisible();
    expect(await page.evaluate(() => (window as any).policyFailures)).toEqual([]);
  }
  expect(errors).toEqual([]);
});
