import { expect, type Page, test } from '../../../tests/e2e/fixtures';
import { addItem, deferred, openItem, resetMedia } from './media-test';

test.beforeEach(async ({ request }) => {
  await resetMedia(request);
});

function webPath(url: string): string {
  return new URL(url).pathname;
}

function watchWeb(page: Page): string[] {
  const paths: string[] = [];
  page.on('request', (req) => {
    if (req.method() !== 'GET') return;
    const path = webPath(req.url());
    if (/\/media\/api\/entries\/\d+\/web$/.test(path)) paths.push(path);
  });
  return paths;
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 100));
}

async function sentinelBelow(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => {
    const node = document.querySelector('[data-related-sentinel]');
    if (!(node instanceof HTMLElement)) return -1;
    return node.getBoundingClientRect().top;
  })).toBeGreaterThanOrEqual(page.viewportSize()?.height ?? 0);
}

async function scrollSentinel(page: Page): Promise<void> {
  const sentinel = page.locator('[data-related-sentinel]');
  await sentinel.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, 0));
  await sentinel.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
}

test('related loads once from a distant sentinel and an artist never requests it', async ({ page, request }) => {
  await page.setViewportSize({ width: 1100, height: 640 });
  const web = watchWeb(page);
  const accent = 'Amélie & Co?';
  const scheme = 'javascript:alert(1)';
  const markup = '"><script>';
  const nodes = [
    { title: 'Dune Part Two', relation: 'sequel', year: 2024, url: 'javascript:alert(1)' },
    { title: 'Dune Part Two', relation: 'sequel', year: 2024 },
    { title: accent, relation: 'series', year: null },
    { title: scheme, relation: 'sequel', year: 2001, href: 'javascript:alert(1)' },
    { title: markup, relation: 'spinoff', year: 2002 },
    { title: 'Dune', relation: 'series', year: 1984 },
    { title: 'Dune', relation: 'series', year: 2021 },
    { title: '', relation: 'sequel', year: 2000 },
    null,
    { title: 42, relation: 'sequel', year: 2000 },
    ...Array.from({ length: 8 }, (_, index) => ({ title: 'Extra ' + index, relation: 'series', year: 2100 + index })),
  ];
  const movie = await addItem(request, { kind: 'movie', title: 'Browser film', rating: 7.5 });
  const empty = await addItem(request, { kind: 'movie', title: 'Empty film' });
  const artist = await addItem(request, { kind: 'artist', title: 'Browser artist', status: 'following' });
  await page.route('**/media/api/entries/*/web', async (route) => {
    const id = webPath(route.request().url()).match(/entries\/(\d+)\/web$/)?.[1];
    const body = id === String(movie.id) ? nodes : [];
    await route.fulfill({ json: { kind: 'movie', nodes: body } });
  });

  await openItem(page, movie.id, 'Browser film');
  await expect(page.getByText('Current rating: 7.5. Pick a whole number to change it.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Tags', exact: true })).toBeVisible();
  await sentinelBelow(page);
  await settle();
  expect(web).toEqual([]);

  await scrollSentinel(page);
  await expect.poll(() => web.filter((path) => path.endsWith('/' + movie.id + '/web')).length).toBe(1);
  await scrollSentinel(page);
  await settle();
  expect(web.filter((path) => path.endsWith('/' + movie.id + '/web'))).toHaveLength(1);

  const links = page.locator('.related-card a');
  await expect(links).toHaveCount(12);
  await expect(page.getByRole('heading', { name: 'Related', exact: true })).toBeVisible();
  const hrefs = await links.evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute('href')));
  const labels = await links.evaluateAll((anchors) => anchors.map((anchor) => anchor.textContent));
  expect(labels).toEqual([
    'Dune Part Two',
    accent,
    scheme,
    markup,
    'Dune',
    'Dune',
    'Extra 0',
    'Extra 1',
    'Extra 2',
    'Extra 3',
    'Extra 4',
    'Extra 5',
  ]);
  expect(labels.filter((label) => label === 'Dune Part Two')).toHaveLength(1);
  expect(hrefs.every((href) => href?.startsWith('/media/add?title='))).toBe(true);
  expect(hrefs[1]).toBe('/media/add?title=' + encodeURIComponent(accent));
  expect(hrefs[2]).toBe('/media/add?title=' + encodeURIComponent(scheme));
  expect(hrefs[3]).toBe('/media/add?title=' + encodeURIComponent(markup));
  expect(hrefs.some((href) => href?.toLowerCase().includes('javascript:'))).toBe(false);
  await expect(page.locator('.related-card').nth(0)).toContainText('Sequel · 2024');
  await expect(page.getByRole('link', { name: 'Extra 6', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Extra 7', exact: true })).toHaveCount(0);

  await openItem(page, empty.id, 'Empty film');
  await sentinelBelow(page);
  await settle();
  expect(web.filter((path) => path.endsWith('/' + empty.id + '/web'))).toEqual([]);
  await scrollSentinel(page);
  await expect.poll(() => web.filter((path) => path.endsWith('/' + empty.id + '/web')).length).toBe(1);
  await scrollSentinel(page);
  await settle();
  expect(web.filter((path) => path.endsWith('/' + empty.id + '/web'))).toHaveLength(1);
  await expect(page.getByRole('heading', { name: 'Related', exact: true })).toHaveCount(0);
  await expect(page.locator('.related-card')).toHaveCount(0);

  await openItem(page, artist.id, 'Browser artist');
  await expect(page.locator('[data-related-sentinel]')).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await settle();
  expect(web.filter((path) => path.endsWith('/' + artist.id + '/web'))).toEqual([]);
  await expect(page.getByRole('heading', { name: 'Related', exact: true })).toHaveCount(0);
});

test('a related provider failure stays on the item and retry stops at three requests', async ({ page, request }) => {
  await page.setViewportSize({ width: 1100, height: 640 });
  const web = watchWeb(page);
  const movie = await addItem(request, { kind: 'movie', title: 'Failed film', rating: 7.5 });
  await page.route('**/media/api/entries/' + movie.id + '/web', (route) => route.fulfill({
    status: 502,
    json: { detail: 'Related items are unavailable.' },
  }));
  await openItem(page, movie.id, 'Failed film');
  await sentinelBelow(page);
  await settle();
  expect(web).toEqual([]);
  await page.locator('[data-related-sentinel]').scrollIntoViewIfNeeded();
  const alert = page.locator('.related-error');
  await expect(alert).toContainText('Related items are unavailable.');
  await expect(page.getByRole('heading', { level: 1, name: 'Failed film', exact: true })).toBeVisible();
  await expect(page.getByText('Current rating: 7.5. Pick a whole number to change it.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Tags', exact: true })).toBeVisible();
  await expect(page.locator('.related-card')).toHaveCount(0);
  const retry = page.getByRole('button', { name: 'Retry related', exact: true });
  await retry.click();
  await expect.poll(() => web.length).toBe(2);
  await retry.click();
  await expect.poll(() => web.length).toBe(3);
  await expect(retry).toHaveCount(0);
  await expect(alert).toContainText('Related items are unavailable.');
  await scrollSentinel(page);
  await settle();
  expect(web).toHaveLength(3);
});

test('a held related response cannot publish after leaving and the observer is disposed', async ({ page, request }) => {
  await page.setViewportSize({ width: 1100, height: 640 });
  await page.addInitScript(() => {
    const tracked: Array<IntersectionObserver & { __disconnected?: boolean }> = [];
    const view = window as Window & { __relatedObservers?: typeof tracked };
    view.__relatedObservers = tracked;
    const observe = IntersectionObserver.prototype.observe;
    const disconnect = IntersectionObserver.prototype.disconnect;
    IntersectionObserver.prototype.observe = function (this: IntersectionObserver, target: Element) {
      tracked.push(this);
      return observe.call(this, target);
    };
    IntersectionObserver.prototype.disconnect = function (this: IntersectionObserver & { __disconnected?: boolean }) {
      this.__disconnected = true;
      return disconnect.call(this);
    };
  });
  const web = watchWeb(page);
  const movie = await addItem(request, { kind: 'movie', title: 'Held film' });
  const artist = await addItem(request, { kind: 'artist', title: 'Held artist', status: 'following' });
  const gate = deferred();
  const entered = deferred();
  await page.route('**/media/api/entries/' + movie.id + '/web', async (route) => {
    entered.resolve();
    await gate.promise;
    await route.fulfill({
      json: { kind: 'movie', nodes: [{ title: 'Stale Sequel', relation: 'sequel', year: 1999 }] },
    }).catch(() => undefined);
  });

  await openItem(page, movie.id, 'Held film');
  await sentinelBelow(page);
  await settle();
  expect(web).toEqual([]);
  await expect.poll(() => page.evaluate(() => {
    const observers = (window as Window & { __relatedObservers?: Array<{ __disconnected?: boolean }> }).__relatedObservers ?? [];
    return observers.length === 1 && observers[0].__disconnected !== true;
  })).toBe(true);
  await page.getByRole('link', { name: '← Library' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Library', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const observers = (window as Window & { __relatedObservers?: Array<{ __disconnected?: boolean }> }).__relatedObservers ?? [];
    return observers.length === 1 && observers.every((observer) => observer.__disconnected === true);
  })).toBe(true);
  expect(web).toEqual([]);

  await page.getByRole('link', { name: 'Held film', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Held film', exact: true })).toBeVisible();
  await page.locator('[data-related-sentinel]').scrollIntoViewIfNeeded();
  await entered.promise;
  expect(web.filter((path) => path.endsWith('/' + movie.id + '/web'))).toHaveLength(1);
  await page.evaluate((id) => {
    history.pushState(history.state, '', '/media/item/' + id);
    window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
  }, artist.id);
  await expect(page.getByRole('heading', { level: 1, name: 'Held artist', exact: true })).toBeVisible();
  gate.resolve();
  await settle();
  await expect(page.getByRole('heading', { level: 1, name: 'Held artist', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Stale Sequel', exact: true })).toHaveCount(0);
  await expect(page.locator('.related-card')).toHaveCount(0);
  await expect(page.locator('[data-related-sentinel]')).toHaveCount(0);
  expect(web.filter((path) => path.endsWith('/' + artist.id + '/web'))).toEqual([]);
});
