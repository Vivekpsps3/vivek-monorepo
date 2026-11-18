import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '../../../tests/e2e/fixtures';
import { deferred, expectSectionHeading, resetMedia, savedItem } from './media-test';

test.use({ reducedMotion: 'reduce' });
test.beforeEach(async ({ request }) => resetMedia(request));

const PROVIDER_HOST = /openlibrary\.org|themoviedb\.org|rawg\.io|steampowered\.com|tvmaze\.com|musicbrainz\.org|itunes\.apple\.com|coverartarchive\.org/i;

function watchProviders(page: Page): string[] {
  const hits: string[] = [];
  page.on('request', (request) => {
    if (PROVIDER_HOST.test(request.url())) hits.push(request.url());
  });
  return hits;
}

async function expectTarget(control: Locator) {
  await control.scrollIntoViewIfNeeded();
  const bounds = await control.boundingBox();
  expect(bounds).toBeTruthy();
  expect(Math.min(bounds!.width, bounds!.height)).toBeGreaterThanOrEqual(44);
}

async function activate(control: Locator, pointer: 'keyboard' | 'touch') {
  await control.scrollIntoViewIfNeeded();
  if (pointer === 'touch') {
    await control.tap();
    return;
  }
  await control.focus();
  await control.press('Enter');
}

for (const [width, height, theme, pointer] of [
  [390, 844, 'light', 'keyboard'],
  [390, 844, 'dark', 'touch'],
  [1280, 800, 'light', 'touch'],
  [1280, 800, 'dark', 'keyboard'],
] as const) {
  test.describe(`capture type at ${width} ${theme} ${pointer}`, () => {
    test.use({ viewport: { width, height }, hasTouch: pointer === 'touch' });

    test('carries the open collection through search and keeps shelves honest', async ({ page }, info) => {
      test.setTimeout(90_000);
      const providers = watchProviders(page);
      await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/media/library?kind=book&sort=title');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('media-book-shelf')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Current', exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Dune', exact: true })).toBeVisible();
      const search = page.getByRole('navigation', { name: 'Media sections', exact: true }).getByRole('link', { name: 'Search', exact: true });
      await activate(search, pointer);
      await expect(page).toHaveURL(/\/media\/search\?kind=book/);
      await expectSectionHeading(page, 'Search Media');
      const type = page.getByRole('combobox', { name: 'Type', exact: true });
      await expect(type).toHaveCount(1);
      await expect(type).toHaveValue('book');
      await expect(page.getByText('This capture stays on Books.', { exact: false })).toBeVisible();
      await expect(page.getByText('Open Library can search book (official).', { exact: true })).toBeVisible();
      await expect(page.locator('.search-results article')).toHaveCount(0);
      await expectTarget(type);
      await expectTarget(page.locator('main').getByRole('button', { name: 'Search', exact: true }));
      await expectTarget(page.locator('.capture-manual').getByRole('button', { name: 'Add to library', exact: true }));
      if (pointer === 'keyboard') {
        await page.getByRole('searchbox', { name: 'Title or artist' }).focus();
        await page.keyboard.press('Tab');
        await expect(type).toBeFocused();
      } else {
        await type.tap();
      }
      await type.selectOption('tv');
      await expect(page).toHaveURL(/kind=tv/);
      await expect(type).toHaveValue('tv');
      await expect(page.getByText('This capture stays on Series.', { exact: false })).toBeVisible();
      await expect(page.getByText('TVMaze can search tv (official).', { exact: true })).toBeVisible();
      await expect(page.getByText('TMDB (tv) is not configured.', { exact: false })).toBeVisible();
      await page.goto('/media/library?kind=game');
      await expect(page.getByRole('navigation', { name: 'Game cabinet', exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Want to play', exact: true })).toBeVisible();
      await expect(page.locator('media-book-shelf')).toHaveCount(0);
      const gamesSearch = page.getByRole('navigation', { name: 'Media sections', exact: true }).getByRole('link', { name: 'Search', exact: true });
      await activate(gamesSearch, pointer);
      await expect(page).toHaveURL(/\/media\/search\?kind=game/);
      await expect(type).toHaveValue('game');
      await expect(page.getByText('RAWG (game) is not configured.', { exact: false })).toBeVisible();
      await expect(page.getByText('Steam can search game (keyless).', { exact: false })).toBeVisible();
      await expect(page.getByText('No hosted game account is connected.', { exact: false })).toBeVisible();
      await expect(page.getByText('does not prove a Steam account', { exact: false })).toBeVisible();
      await expect(page.locator('.search-results article')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const scan = await new AxeBuilder({ page }).include('main').analyze();
      expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
      expect(providers).toEqual([]);
      const shot = info.outputPath(`capture-${width}-${theme}-${pointer}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      await info.attach(`capture-${width}-${theme}-${pointer}`, { path: shot, contentType: 'image/png' });
    });
  });
}

test('synthetic search keeps one membership per provider id and drops a losing save', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('suite-theme', 'dark'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const providers = watchProviders(page);
  const posts: { source?: string; source_id?: string; kind?: string; title?: string }[] = [];
  const release = deferred();
  let held = false;
  await page.route('**/media/api/search?**', route => {
    const url = new URL(route.request().url());
    const kind = url.searchParams.get('kind');
    const query = (url.searchParams.get('q') || '').toLowerCase();
    const harbor = query.includes('harbor') && (kind === 'book' || kind === 'all')
      ? [
          { source: 'fixture', source_id: 'OL-HARBOR-1', kind: 'book', title: 'Paper Harbor', creator: 'Synthetic' },
          { source: 'fixture', source_id: 'OL-HARBOR-2', kind: 'book', title: 'Paper Harbor', creator: 'Synthetic' },
        ]
      : [];
    const results = kind === 'tv'
      ? [{ source: 'fixture', source_id: 'TV-OTHER', kind: 'tv', title: 'Current series result', creator: 'Synthetic' }]
      : harbor;
    return route.fulfill({
      json: { results, sources: [], partial: false, total: results.length, offset: 0, has_more: false },
    });
  });
  await page.route('**/media/api/library/from-provider', async route => {
    const body = route.request().postDataJSON() as { source?: string; source_id?: string; kind?: string; title?: string };
    posts.push(body);
    if (!held) {
      held = true;
      await release.promise;
    }
    const id = body.source_id === 'OL-HARBOR-1' ? 501 : 502;
    await route.fulfill({
      json: {
        id,
        kind: body.kind,
        title: body.title,
        catalog: { extra: { metadata_pending: body.source_id === 'OL-HARBOR-1' } },
      },
    });
  });
  await page.goto('/media/search?kind=book&q=Paper%20Harbor');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const cards = page.locator('.search-results article');
  await expect(cards).toHaveCount(2);
  await cards.first().locator('button').evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0].source_id).toBe('OL-HARBOR-1');
  await page.getByRole('combobox', { name: 'Type', exact: true }).selectOption('tv');
  await expect(page.getByRole('heading', { name: 'Current series result', exact: true })).toBeVisible();
  release.resolve();
  await expect(page.getByRole('link', { name: /Open saved/ })).toHaveCount(0);
  await expect(page.getByText('Metadata is still pending', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Paper Harbor', exact: true })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Type', exact: true }).selectOption('book');
  await expect(cards).toHaveCount(2);
  await cards.nth(0).getByRole('button', { name: 'Add to library', exact: true }).click();
  await expect(cards.nth(0).getByRole('link', { name: 'Open saved item', exact: true })).toHaveAttribute('href', '/media/item/501');
  await expect(cards.nth(0).getByText('Metadata is still pending. Saved item is editable.', { exact: true })).toBeVisible();
  await cards.nth(1).getByRole('button', { name: 'Add to library', exact: true }).click();
  await expect(cards.nth(1).getByRole('link', { name: 'Open saved item', exact: true })).toHaveAttribute('href', '/media/item/502');
  await expect(cards.nth(1).getByText('Metadata is still pending', { exact: false })).toHaveCount(0);
  expect(posts.filter(item => item.source_id === 'OL-HARBOR-1').length).toBeGreaterThan(0);
  expect(posts.filter(item => item.source_id === 'OL-HARBOR-2')).toHaveLength(1);
  expect(providers).toEqual([]);
});

test('a down provider keeps manual capture, and pending metadata retries on the saved item', async ({ page, request }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const providers = watchProviders(page);
  let searches = 0;
  await page.route('**/media/api/search?**', route => {
    searches += 1;
    return route.fulfill({ status: 502, json: { message: 'Synthetic source timeout' } });
  });
  await page.goto('/media/search?kind=book');
  const query = page.getByRole('searchbox', { name: 'Title or artist' });
  await query.fill('down');
  await expect(page.locator('main [role=alert]')).toContainText('Synthetic source timeout');
  await expect(query).toHaveValue('down');
  await expect(query).toBeFocused();
  await expectTarget(page.getByRole('button', { name: 'Retry search', exact: true }));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.getByRole('button', { name: 'Retry search', exact: true }).click();
    await expect.poll(() => searches).toBe(attempt + 2);
  }
  await expect(page.getByRole('button', { name: 'Retry search', exact: true })).toHaveCount(0);
  await expect(page.getByText('Search retry limit reached.', { exact: false })).toBeVisible();
  expect(searches).toBe(4);

  let failSave = true;
  await page.route('**/media/api/library', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path !== '/media/api/library' || route.request().method() !== 'POST') return route.continue();
    if (failSave) {
      failSave = false;
      return route.fulfill({ status: 503, json: { message: 'Synthetic save failure' } });
    }
    return route.continue();
  });
  const manual = page.locator('.capture-manual');
  const title = manual.getByRole('textbox', { name: 'Title', exact: true });
  await title.fill('Shelf Harbor');
  await manual.getByText('Optional details', { exact: true }).click();
  await manual.getByLabel('Release year').fill('2026');
  await manual.getByLabel('Note').fill('Still on the form');
  await manual.getByRole('button', { name: 'Add to library', exact: true }).click();
  await expect(manual.locator('.local-error')).toHaveText('Synthetic save failure');
  await expect(title).toHaveValue('Shelf Harbor');
  await expect(manual.getByLabel('Release year')).toHaveValue('2026');
  await expect(manual.getByLabel('Note')).toHaveValue('Still on the form');
  await expect(page).toHaveURL(/\/media\/search\?/);
  await manual.getByRole('button', { name: 'Add to library', exact: true }).click();
  await expect(page).toHaveURL(/\/media\/item\/\d+$/);
  const id = Number(page.url().match(/item\/(\d+)/)?.[1]);
  const saved = await savedItem(request, id);
  expect(saved.kind).toBe('book');
  expect(saved.title).toBe('Shelf Harbor');
  expect(saved.catalog.source).toBe('manual');
  await page.goto('/media/library?kind=book&sort=title');
  await expect(page.locator('media-book-shelf').getByRole('link', { name: 'Shelf Harbor', exact: true })).toBeVisible();
  await page.goto('/media/library?kind=movie&sort=title');
  await expect(page.getByRole('link', { name: 'Shelf Harbor', exact: true })).toHaveCount(0);

  let refreshes = 0;
  await page.route('**/media/api/entries/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'POST' && path === `/media/api/entries/${id}/refresh`) {
      refreshes += 1;
      await route.fulfill({ status: 502, json: { message: 'Synthetic metadata timeout' } });
      return;
    }
    if (route.request().method() === 'GET' && path === `/media/api/entries/${id}`) {
      const response = await route.fetch();
      const body = await response.json();
      body.catalog.extra = { ...(body.catalog.extra || {}), metadata_pending: true, metadata_retries: 0 };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      return;
    }
    await route.continue();
  });
  await page.goto('/media/item/' + id);
  await expect(page.getByText('Metadata is still pending. This saved item stays editable.', { exact: true })).toBeVisible();
  expect(refreshes).toBe(0);
  const note = page.getByLabel('Note');
  await note.fill('Still editable.');
  await expectTarget(page.getByRole('button', { name: 'Retry metadata', exact: true }));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.getByRole('button', { name: 'Retry metadata', exact: true }).click();
    await expect.poll(() => refreshes).toBe(attempt + 1);
  }
  await expect(page.getByRole('button', { name: 'Retry metadata', exact: true })).toHaveCount(0);
  await expect(page.getByText('Metadata retry limit reached.', { exact: false })).toBeVisible();
  await expect(note).toHaveValue('Still editable.');
  expect(refreshes).toBe(3);
  expect(providers).toEqual([]);
});

test('sign-out clears an unsaved capture draft', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/media/add?kind=book');
  await expectSectionHeading(page, 'Add manually');
  await expect(page.getByRole('combobox', { name: 'Type', exact: true })).toHaveValue('book');
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Private Harbor');
  const ended = await page.request.post('/api/auth/logout', {
    headers: { 'X-CSRF-Token': 'synthetic-csrf', Origin: new URL(page.url()).origin },
  });
  expect(ended.ok(), await ended.text()).toBeTruthy();
  await page.route('**/media/api/capture/coverage**', route =>
    route.fulfill({ status: 401, json: { detail: 'Session expired' } }),
  );
  await page.getByRole('combobox', { name: 'Type', exact: true }).selectOption('game');
  await expect(page).toHaveURL(/\/auth\/login/);
  await expect(page.getByRole('button', { name: 'Leave draft', exact: true })).toHaveCount(0);
});
