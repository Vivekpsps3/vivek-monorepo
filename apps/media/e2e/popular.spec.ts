import { expect, type Page, test } from '../../../tests/e2e/fixtures';
import { deferred, resetMedia } from './media-test';

test.beforeEach(async ({ request }) => {
  await resetMedia(request);
});

function watchMovies(page: Page): string[] {
  const hits: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET') return;
    if (new URL(request.url()).pathname === '/media/api/movies') hits.push(request.url());
  });
  return hits;
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 200));
}

function movie(title: string, sourceId: string, artwork: string | null = null) {
  return {
    title,
    source: 'tmdb',
    source_id: sourceId,
    kind: 'movie',
    year: 2024,
    artwork_url: artwork,
  };
}

test('popular waits for an explicit click and restores the same cards on back', async ({ page }) => {
  const movies = watchMovies(page);
  const rows = [
    movie('Kept One', '1', 'https://evil.example/a.jpg'),
    movie('Kept One duplicate', '1'),
    { title: '', source: 'tmdb', source_id: 'blank', kind: 'movie' },
    null,
    movie('Poster', '2', 'https://image.tmdb.org/t/p/w500/p.jpg'),
    ...Array.from({ length: 23 }, (_, index) => movie('Movie ' + index, String(index + 10), 'javascript:alert(1)')),
  ];
  await page.route('**/media/api/movies', (route) => route.fulfill({ json: { results: rows } }));
  await page.goto('/media/search');
  await expect(page.getByRole('button', { name: 'Popular', exact: true })).toBeVisible();
  await expect(page.locator('.popular-card')).toHaveCount(0);
  await settle();
  expect(movies).toEqual([]);

  await page.getByRole('button', { name: 'Popular', exact: true }).click();
  await expect(page.locator('.popular-card')).toHaveCount(20);
  await expect(page.getByRole('heading', { name: 'Kept One', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Movie 17', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Movie 18', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Kept One duplicate', exact: true })).toHaveCount(0);
  const srcs = await page.locator('.popular img').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('src')));
  expect(srcs).toEqual(['https://image.tmdb.org/t/p/w500/p.jpg']);
  expect(movies).toHaveLength(1);

  await page.locator('ui-page-header').getByRole('link', { name: 'Add manually', exact: true }).click();
  await expect(page).toHaveURL(/\/media\/add/);
  await page.goBack();
  await expect(page).toHaveURL(/\/media\/search$/);
  await expect(page.locator('.popular-card')).toHaveCount(20);
  await expect(page.getByRole('heading', { name: 'Poster', exact: true })).toBeVisible();
  expect(movies).toHaveLength(1);
});

test('popular add keeps one saved item and recovers after a failed attempt', async ({ page, request }) => {
  const posts: Record<string, unknown>[] = [];
  const release = deferred();
  await page.route('**/media/api/movies', (route) => route.fulfill({
    json: {
      results: [
        {
          ...movie('Saved Popular', 'saved', 'javascript:alert(1)'),
          already_saved: true,
          saved_id: 42,
        },
        movie('Needs add', 'popular-add-1', 'https://image.tmdb.org/t/p/w500/needs.jpg'),
      ],
    },
  }));
  await page.route('**/media/api/library/from-provider', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    posts.push(route.request().postDataJSON());
    if (posts.length === 1) {
      await release.promise;
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Save failed' }),
      });
    }
    return route.continue();
  });

  await page.goto('/media/search');
  await page.getByRole('button', { name: 'Popular', exact: true }).click();
  const saved = page.locator('.popular-card', { hasText: 'Saved Popular' });
  const card = page.locator('.popular-card', { hasText: 'Needs add' });
  await expect(saved.getByRole('link', { name: 'Open saved item', exact: true })).toHaveAttribute('href', '/media/item/42');
  await expect(card.getByRole('button', { name: 'Add to library', exact: true })).toBeVisible();
  expect(posts).toEqual([]);
  const srcs = await page.locator('.popular img').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('src')));
  expect(srcs).toEqual(['https://image.tmdb.org/t/p/w500/needs.jpg']);

  await card.locator('button').evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toEqual({
    source: 'tmdb',
    source_id: 'popular-add-1',
    kind: 'movie',
    title: 'Needs add',
  });
  release.resolve();
  await expect(card.getByRole('alert')).toHaveText('Save failed');
  await expect(card.getByRole('heading', { name: 'Needs add', exact: true })).toBeVisible();
  await expect(saved.getByRole('link', { name: 'Open saved item', exact: true })).toHaveAttribute('href', '/media/item/42');
  const retry = card.getByRole('button', { name: 'Add to library', exact: true });
  await expect(retry).toBeEnabled();
  await retry.click();
  await expect(card.getByRole('link', { name: 'Open saved item', exact: true })).toHaveAttribute('href', /\/media\/item\/\d+$/);
  await expect(card.getByRole('alert')).toHaveCount(0);
  expect(posts).toHaveLength(2);
  expect(posts[1]).toEqual(posts[0]);

  const href = await card.getByRole('link', { name: 'Open saved item', exact: true }).getAttribute('href');
  const savedId = Number(href?.split('/').pop());
  const detail = await request.get('/media/api/entries/' + savedId);
  expect(detail.ok(), await detail.text()).toBeTruthy();
  const body = await detail.json();
  expect(body.catalog.source).toBe('tmdb');
  expect(body.catalog.source_id).toBe('popular-add-1');
  expect(body.title).toBe('Needs add');
  const library = await request.get('/media/api/library?q=' + encodeURIComponent('Needs add'));
  expect(library.ok()).toBeTruthy();
  const listed = await library.json();
  expect(listed.items.filter((item: { title: string }) => item.title === 'Needs add')).toHaveLength(1);
});

test('popular failure retries from the keyboard without unsafe artwork', async ({ page }) => {
  let calls = 0;
  const release = deferred();
  await page.route('**/media/api/movies', async (route) => {
    calls++;
    if (calls === 1) {
      return route.fulfill({ status: 502, json: { detail: 'down' } });
    }
    await release.promise;
    return route.fulfill({
      json: {
        results: [
          movie('After retry', '9', 'https://evil.example/x.jpg'),
          movie('Safe retry', '10', 'https://image.tmdb.org/t/p/w500/safe.jpg'),
        ],
      },
    });
  });
  await page.goto('/media/search');
  await page.getByRole('button', { name: 'Popular', exact: true }).click();
  const alert = page.locator('.popular-error');
  await expect(alert).toContainText("Can't reach the movie service.");
  await expect(page.locator('.popular img')).toHaveCount(0);
  const retry = page.locator('#popular-retry button');
  await expect(retry).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#popular-status')).toBeFocused();
  await expect(page.locator('#popular-status')).toHaveText('Loading popular movies…');
  await expect(page.locator('.popular-skeleton')).toHaveCount(4);
  await expect(page.locator('.popular img')).toHaveCount(0);
  expect(calls).toBe(2);
  release.resolve();
  await expect(page.locator('.popular-card')).toHaveCount(2);
  await expect(page.locator('#popular-heading')).toBeFocused();
  const srcs = await page.locator('.popular img').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('src')));
  expect(srcs).toEqual(['https://image.tmdb.org/t/p/w500/safe.jpg']);
  await expect(page.locator('.popular-card', { hasText: 'After retry' }).locator('.media-art span')).toHaveText('AF');
});

test('an empty popular list retries from the keyboard', async ({ page }) => {
  let calls = 0;
  const release = deferred();
  await page.route('**/media/api/movies', async (route) => {
    calls++;
    if (calls === 1) return route.fulfill({ json: { results: [] } });
    await release.promise;
    return route.fulfill({
      json: { results: [movie('After empty', '8', 'javascript:alert(1)')] },
    });
  });
  await page.goto('/media/search');
  await page.getByRole('button', { name: 'Popular', exact: true }).click();
  await expect(page.getByText('No popular movies', { exact: true })).toBeVisible();
  await expect(page.getByText('The movie service returned nothing. Retry, or search for a title.')).toBeVisible();
  await expect(page.locator('.popular img')).toHaveCount(0);
  const retry = page.locator('#popular-retry button');
  await expect(retry).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#popular-status')).toBeFocused();
  await expect(page.locator('.popular-skeleton')).toHaveCount(4);
  await expect(page.locator('.popular img')).toHaveCount(0);
  expect(calls).toBe(2);
  release.resolve();
  await expect(page.locator('.popular-card')).toHaveCount(1);
  await expect(page.locator('.popular img')).toHaveCount(0);
  await expect(page.locator('.popular-card .media-art span')).toHaveText('AF');
  await expect(page.locator('#popular-heading')).toBeFocused();
});
