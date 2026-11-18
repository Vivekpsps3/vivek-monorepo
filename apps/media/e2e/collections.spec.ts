import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '../../../tests/e2e/fixtures';
import { addItem, deferred, openFilters, resetMedia } from './media-test';

test.beforeEach(async ({ request }) => resetMedia(request));

async function seedCollections(request: Parameters<typeof addItem>[0]) {
  await addItem(request, { kind: 'movie', title: 'Harbor Matinee' });
  await addItem(request, { kind: 'tv', title: 'Harbor Season' });
  await addItem(request, { kind: 'book', title: 'Harbor Field Guide', status: 'want' });
  const artist = await addItem(request, { kind: 'artist', title: 'Harbor Ensemble', status: 'following' });
  const created = await (await request.post(`/media/api/entries/${artist.id}/albums`, { data: { title: 'Harbor Pressing' } })).json();
  const album = created.music.saved_children.find((child: { kind: string }) => child.kind === 'album');
  expect(album, 'saved album').toBeTruthy();
  expect((await request.post(`/media/api/entries/${artist.id}/albums/${album.id}/tracks`, { data: { title: 'Harbor Single' } })).ok()).toBeTruthy();
  await addItem(request, { kind: 'game', title: 'Harbor Tactics' });
  return artist;
}

function sections(page: Page) {
  return page.getByRole('navigation', { name: 'Media sections' });
}

test('each collection shows its own saved items and All items stays deliberate', async ({ page, request }) => {
  await seedCollections(request);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/media/library?kind=artist&status=following&sort=title');
  await expect(page.getByRole('link', { name: 'Harbor Ensemble', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Harbor Field Guide', exact: true })).toHaveCount(0);
  await expect(page.getByText('Music. Artists you have saved', { exact: false })).toBeVisible();

  const reads: string[] = [];
  page.on('request', (req) => {
    if (req.method() === 'GET' && req.url().includes('/media/api/library')) reads.push(req.url());
  });
  await sections(page).getByRole('link', { name: 'Books', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Following does not apply to Books. Showing every state.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Harbor Field Guide', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Harbor Matinee', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Harbor Ensemble', exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/kind=book/);
  await expect(page).toHaveURL(/sort=title/);
  await expect(page).not.toHaveURL(/status=/);
  expect(reads.some((url) => url.includes('kind=book') && url.includes('status=following'))).toBe(false);
  await openFilters(page);
  await expect(page.getByRole('dialog').getByLabel('Type')).toHaveCount(0);
  const state = page.getByRole('dialog').getByLabel('State');
  await expect(state).toHaveValue('');
  await expect(state.locator('option', { hasText: 'Following' })).toHaveCount(0);
  await expect(state.locator('option', { hasText: 'Want to read' })).toHaveCount(1);
  await page.keyboard.press('Escape');

  for (const [name, title, summary] of [
    ['Movies', 'Harbor Matinee', 'Movies. Films you want to watch'],
    ['Series', 'Harbor Season', 'Series. Shows and the episodes'],
    ['Games', 'Harbor Tactics', 'Games. What you want to play'],
  ] as const) {
    await sections(page).getByRole('link', { name, exact: true }).click();
    await expect(page.getByRole('link', { name: title, exact: true })).toBeVisible();
    await expect(page.getByText(summary, { exact: false })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Harbor Field Guide', exact: true })).toHaveCount(0);
  }

  await sections(page).getByRole('link', { name: 'All items', exact: true }).click();
  await expect(page).toHaveURL(/\/media\/library$/);
  await expect(page.getByText('All activity: movies, series, books', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Harbor Field Guide', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Harbor Matinee', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Harbor Tactics', exact: true })).toBeVisible();
});

test('Music views keep albums and songs distinct from Following', async ({ page, request }) => {
  await seedCollections(request);
  await page.goto('/media/library?kind=artist&status=following');
  await page.getByRole('navigation', { name: 'Music views' }).getByRole('link', { name: 'Albums', exact: true }).click();
  await expect(page).toHaveURL(/kind=album/);
  await expect(page).not.toHaveURL(/status=following/);
  await expect(page.getByRole('status').filter({ hasText: 'Following does not apply to Albums' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Harbor Pressing', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Harbor Ensemble', exact: true })).toHaveCount(0);
  await page.getByRole('navigation', { name: 'Music views' }).getByRole('link', { name: 'Songs', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Harbor Single', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Harbor Pressing', exact: true })).toHaveCount(0);
  const artists = page.getByRole('navigation', { name: 'Music views' }).getByRole('link', { name: 'Artists', exact: true });
  expect(Math.min((await artists.boundingBox())!.height, (await artists.boundingBox())!.width)).toBeGreaterThanOrEqual(44);
});

test('a bookmarked Following filter on Books is rewritten before the read', async ({ page, request }) => {
  await addItem(request, { kind: 'book', title: 'Harbor Field Guide' });
  const reads: string[] = [];
  page.on('request', (req) => {
    if (req.method() === 'GET' && req.url().includes('/media/api/library')) reads.push(new URL(req.url()).search);
  });
  await page.goto('/media/library?kind=book&status=following&sort=title&offset=0');
  await expect(page.getByRole('link', { name: 'Harbor Field Guide', exact: true })).toBeVisible();
  await expect(page.getByText('Following does not apply to Books. Showing every state.', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/kind=book/);
  await expect(page).toHaveURL(/sort=title/);
  await expect(page).not.toHaveURL(/status=/);
  expect(reads.some((query) => query.includes('status=following'))).toBe(false);
});

test('reload and back keep the collection, sort, page and favorite filter', async ({ page, request }) => {
  for (let index = 0; index < 25; index += 1) {
    await addItem(request, {
      kind: 'book',
      title: `Shelf ${String(index).padStart(2, '0')}`,
      favorite: index === 24,
    });
  }
  await page.goto('/media/library?kind=book&sort=title');
  await page.getByRole('button', { name: 'Next items' }).click();
  await expect(page).toHaveURL(/kind=book/);
  await expect(page).toHaveURL(/sort=title/);
  await expect(page).toHaveURL(/offset=24/);
  await page.reload();
  await expect(page).toHaveURL(/kind=book&sort=title&offset=24|kind=book&offset=24&sort=title/);
  await expect(page).toHaveURL(/offset=24/);
  await expect(page.getByText('Shelf 24', { exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/kind=book/);
  await expect(page).toHaveURL(/sort=title/);
  await expect(page).not.toHaveURL(/offset=24/);
  await openFilters(page);
  await page.getByRole('dialog').getByRole('checkbox', { name: 'Favorites only' }).check();
  await expect(page).toHaveURL(/fav=1/);
  await expect(page).toHaveURL(/kind=book/);
  await expect(page).toHaveURL(/sort=title/);
  await page.reload();
  await expect(page).toHaveURL(/kind=book/);
  await expect(page).toHaveURL(/sort=title/);
  await expect(page).toHaveURL(/fav=1/);
  await expect(page.getByRole('link', { name: 'Shelf 24', exact: true })).toBeVisible();
});

test('a failed read keeps the search and a losing collection cannot replace the current one', async ({ page, request }) => {
  await addItem(request, { kind: 'book', title: 'Harbor Field Guide' });
  await addItem(request, { kind: 'game', title: 'Harbor Tactics' });
  let failed = false;
  await page.route('**/media/api/library?*', async (route) => {
    const q = new URL(route.request().url()).searchParams.get('q');
    if (q === 'Harbor' && !failed) {
      failed = true;
      return route.fulfill({ status: 503, json: { message: 'Library offline' } });
    }
    return route.continue();
  });
  await page.goto('/media/library?kind=book');
  await page.locator('#library-q').fill('Harbor');
  await expect(page.locator('main [role=alert]')).toContainText('Library offline');
  await expect(page.locator('#library-q')).toHaveValue('Harbor');
  await expect(page).toHaveURL(/kind=book/);
  await page.unroute('**/media/api/library?*');
  await page.getByRole('button', { name: 'Retry library' }).click();
  await expect(page.getByRole('link', { name: 'Harbor Field Guide', exact: true })).toBeVisible();
  await expect(page.locator('#library-q')).toHaveValue('Harbor');

  const arrived = deferred();
  const release = deferred();
  await page.route('**/media/api/library?*', async (route) => {
    const kind = new URL(route.request().url()).searchParams.get('kind');
    if (kind !== 'book') return route.continue();
    const response = await route.fetch();
    arrived.resolve();
    await release.promise;
    await route.fulfill({ response }).catch(() => {});
  });
  await sections(page).getByRole('link', { name: 'Games', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Harbor Tactics', exact: true })).toBeVisible();
  await sections(page).getByRole('link', { name: 'Books', exact: true }).click();
  await arrived.promise;
  try {
    await sections(page).getByRole('link', { name: 'Games', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Harbor Tactics', exact: true })).toBeVisible();
  } finally {
    release.resolve();
  }
  await expect(page.getByRole('link', { name: 'Harbor Field Guide', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Harbor Tactics', exact: true })).toBeVisible();
  await expect(page.locator('#library-q')).toHaveValue('Harbor');
  await expect(page).toHaveURL(/kind=game/);
});

async function expectCollectionChrome(
  page: Page,
  request: Parameters<typeof addItem>[0],
  width: number,
  height: number,
  theme: 'light' | 'dark',
  touch: boolean,
  info: { attach: (name: string, options: { body: Buffer; contentType: string }) => Promise<void> },
) {
  await seedCollections(request);
  await page.setViewportSize({ width, height });
  await page.addInitScript((choice) => localStorage.setItem('suite-theme', choice), theme);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/media/library?kind=book&sort=title');
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
  await expect(page.locator('main')).toHaveAttribute('data-collection', 'book');
  await expect(page.getByText('Books. What you want to read', { exact: false })).toBeVisible();
  const books = sections(page).getByRole('link', { name: 'Books', exact: true });
  await expect(books).toHaveAttribute('aria-current', 'page');
  const box = await books.boundingBox();
  expect(Math.min(box!.height, box!.width)).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const games = sections(page).getByRole('link', { name: 'Games', exact: true });
  if (touch) await games.tap();
  else {
    await games.focus();
    await page.keyboard.press('Enter');
  }
  await expect(page.locator('main')).toHaveAttribute('data-collection', 'game');
  await expect(page.getByRole('link', { name: 'Harbor Tactics', exact: true })).toBeVisible();
  const scan = await new AxeBuilder({ page }).include('.media-workspace').analyze();
  expect(scan.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
  await info.attach(`collections-${width}-${theme}`, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
}

for (const [width, height, theme] of [
  [1280, 800, 'light'],
  [1280, 800, 'dark'],
] as const) {
  test(`collection chrome at ${width}×${height} ${theme}`, async ({ page, request }, info) => {
    await expectCollectionChrome(page, request, width, height, theme, false, info);
  });
}

test.describe('phone collections', () => {
  test.use({ hasTouch: true });
  for (const [width, height, theme] of [
    [390, 844, 'light'],
    [390, 844, 'dark'],
  ] as const) {
    test(`collection chrome at ${width}×${height} ${theme}`, async ({ page, request }, info) => {
      await expectCollectionChrome(page, request, width, height, theme, true, info);
    });
  }
});
