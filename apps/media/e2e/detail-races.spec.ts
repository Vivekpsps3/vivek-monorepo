import { expect, test } from '../../../tests/e2e/fixtures';
import { addItem, deferred, openItem, resetMedia, savedItem } from './media-test';

test.beforeEach(async ({ request }) => resetMedia(request));
test('a late portrait save cannot replace the saved album opened from its artist', async ({ page, request }) => {
  const artist = await (await request.post('/media/api/library', { data: { kind: 'artist', title: 'Portrait artist', status: 'following' } })).json();
  const withAlbum = await (await request.post(`/media/api/entries/${artist.id}/albums`, { data: { title: 'Independent album' } })).json();
  const album = withAlbum.music.saved_children.find((item: { title: string }) => item.title === 'Independent album');
  expect(album).toBeTruthy();
  await page.route('https://upload.wikimedia.org/**', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64') }));
  let release!: () => void;
  let stored!: () => void;
  let delivered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const saved = new Promise<void>(resolve => { stored = resolve; });
  const returned = new Promise<void>(resolve => { delivered = resolve; });
  await page.route(`**/media/api/entries/${artist.id}/portrait`, async route => {
    const response = await route.fetch();
    stored();
    await gate;
    await route.fulfill({ response });
    delivered();
  });
  await page.goto(`/media/item/${artist.id}`);
  await page.getByRole('button', { name: 'Choose photo', exact: true }).click();
  await page.getByRole('button', { name: 'File:Synthetic portrait.jpg' }).click();
  await page.getByRole('button', { name: 'Use this photo', exact: true }).click();
  await saved;
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('link', { name: 'Independent album', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Independent album', exact: true })).toBeVisible();
  await page.getByLabel('Note', { exact: false }).fill('Keep the album draft');
  release();
  await returned;
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.getByRole('heading', { level: 1, name: 'Independent album', exact: true })).toBeVisible();
  await expect(page.getByLabel('Note', { exact: false })).toHaveValue('Keep the album draft');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Changes saved.', { exact: true })).toBeVisible();
  const result = await (await request.get(`/media/api/entries/${album.id}`)).json();
  expect(result.review).toBe('Keep the album draft');
  expect(result.title).toBe('Independent album');
});

test('selecting the third item before an old failure resolves keeps that item and its draft', async ({ page, request }) => {
  const first = await addItem(request, { title: 'First story', review: 'Kept note' });
  await addItem(request, { title: 'Second story' });
  const third = await addItem(request, { title: 'Third story' });
  await openItem(page, first.id, 'First story');
  const release = deferred();
  const entered = deferred();
  await page.route('**/media/api/entries/' + first.id, async route => {
    if (route.request().method() !== 'PATCH') return route.continue();
    entered.resolve();
    await release.promise;
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Save failed for First story.' }),
    }).catch(() => undefined);
  });
  await page.getByLabel('Note', { exact: false }).fill('First draft that must stay put');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await entered.promise;
  await page.getByRole('link', { name: '← Library' }).click();
  await page.getByRole('button', { name: 'Leave item', exact: true }).click();
  await page.getByRole('link', { name: 'Third story', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Third story', exact: true })).toBeVisible();
  await page.getByLabel('Note', { exact: false }).fill('Third draft');
  release.resolve();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.getByRole('heading', { level: 1, name: 'Third story', exact: true })).toBeVisible();
  await expect(page.getByLabel('Note', { exact: false })).toHaveValue('Third draft');
  await expect(page.locator('main [role=alert]')).toHaveCount(0);
  await expect(page.locator('.toast')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Changes saved.', { exact: true })).toBeVisible();
  expect((await savedItem(request, third.id)).review).toBe('Third draft');
  expect((await savedItem(request, first.id)).review).toBe('Kept note');
  await page.goto('/media/item/' + first.id);
  await expect(page.getByRole('heading', { level: 1, name: 'First story', exact: true })).toBeVisible();
  await expect(page.getByLabel('Note', { exact: false })).toHaveValue('First draft that must stay put');
  await expect(page.locator('main [role=alert]')).toHaveCount(0);
  await expect(page.locator('.toast')).toHaveCount(0);
});

test('a failed save stays inline and the next success retires it without a toast', async ({ page, request }) => {
  const item = await addItem(request, { title: 'Toast story' });
  await openItem(page, item.id, 'Toast story');
  let fail = true;
  await page.route('**/media/api/entries/' + item.id, async route => {
    if (route.request().method() !== 'PATCH') return route.continue();
    if (!fail) return route.continue();
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Save failed.' }),
    });
  });
  await page.getByLabel('Note', { exact: false }).fill('Recovered note');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.locator('main [role=alert]')).toContainText('Save failed.');
  await expect(page.getByLabel('Note', { exact: false })).toHaveValue('Recovered note');
  await expect(page.locator('.toast')).toHaveCount(0);
  fail = false;
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Changes saved.', { exact: true })).toBeVisible();
  await expect(page.locator('main [role=alert]')).toHaveCount(0);
  await expect(page.locator('.toast')).toHaveCount(0);
  expect((await savedItem(request, item.id)).review).toBe('Recovered note');
});

test('a held save times out without a summary preflight and keeps the draft', async ({ page, request }) => {
  test.setTimeout(45_000);
  const item = await addItem(request, { title: 'Preflight story' });
  await openItem(page, item.id, 'Preflight story');
  const seen: string[] = [];
  page.on('request', req => {
    const url = new URL(req.url());
    if (url.pathname.includes('/api/summary') || url.pathname.includes('/api/auth/csrf') || url.pathname.includes('/media/api/entries/'))
      seen.push(`${req.method()} ${url.pathname}`);
  });
  const blocked = deferred();
  const entered = deferred();
  let pending: { abort: () => Promise<void> } | undefined;
  await page.route('**/media/api/entries/' + item.id, async route => {
    if (route.request().method() !== 'PATCH') return route.continue();
    pending = route;
    entered.resolve();
    await blocked.promise;
  });
  await page.getByLabel('Note', { exact: false }).fill('Held through the deadline');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await entered.promise;
  await expect(page.locator('main [role=alert]')).toContainText('timed out', { timeout: 15_000 });
  await expect(page.getByLabel('Note', { exact: false })).toHaveValue('Held through the deadline');
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
  await expect(page.locator('.toast')).toHaveCount(0);
  expect(seen.filter(line => line.includes('/api/summary') || line.includes('/api/auth/csrf'))).toEqual([]);
  expect(seen.filter(line => line.startsWith('PATCH '))).toEqual([`PATCH /media/api/entries/${item.id}`]);
  await page.unroute('**/media/api/entries/' + item.id);
  await pending?.abort().catch(() => undefined);
  blocked.resolve();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Changes saved.', { exact: true })).toBeVisible();
  await expect(page.locator('main [role=alert]')).toHaveCount(0);
  await expect(page.locator('.toast')).toHaveCount(0);
  expect((await savedItem(request, item.id)).review).toBe('Held through the deadline');
  expect(seen.filter(line => line.startsWith('PATCH '))).toHaveLength(2);
});
