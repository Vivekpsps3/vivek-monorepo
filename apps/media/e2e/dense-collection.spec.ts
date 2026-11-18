import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../../../tests/e2e/fixtures';
import { addItem, deferred, expectSectionHeading, resetMedia, savedItem } from './media-test';

const shortTitle = 'Tide';
const longTitle = 'The Coastal Almanac of Harbors, Weather, Lighthouses and the People Who Keep Them';
const unbrokenTitle = 'HarborBookWithAnUnusuallyLongUnbrokenTitleAndASecondLongUnbrokenWord';

test.beforeEach(async ({ request }) => resetMedia(request));

test.use({ hasTouch: true });

for (const [width, theme, zoom] of [
  [390, 'light', false], [390, 'dark', false],
  [1280, 'light', false], [1280, 'dark', false], [320, 'light', false], [390, 'dark', true],
] as const) {
  test('dense library at ' + width + ' ' + theme + (zoom ? ' with 200% text' : ''), async ({ page, request }, info) => {
    await page.setViewportSize({ width, height: width === 1280 ? 800 : 844 });
    await page.addInitScript(choice => localStorage.setItem('suite-theme', choice), theme);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const short = await addItem(request, { kind: 'book', title: shortTitle, creator: 'Mara', rating: 7 });
    await addItem(request, { kind: 'book', title: longTitle, creator: 'Coastal Geography Society', rating: 10, favorite: true });
    await addItem(request, { kind: 'book', title: unbrokenTitle, creator: 'MaritimeArchiveResidentsAndResearchers' });
    await page.goto('/media/library?kind=book&sort=title');
    await expectSectionHeading(page, 'Books');
    if (zoom) await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    const grid = page.locator('media-book-shelf');
    for (const title of [shortTitle, longTitle, unbrokenTitle]) {
      await expect(grid.getByRole('link', { name: title, exact: true })).toBeVisible();
    }
    const shortLink = grid.getByRole('link', { name: shortTitle, exact: true });
    const longCard = grid.locator('article').filter({ hasText: longTitle });
    await expect(longCard).toContainText('Coastal Geography Society');
    await expect(longCard).toContainText('10 / 10');
    await expect(longCard).toContainText('Favorite');
    expect(await grid.evaluate(el => {
      return document.documentElement.scrollWidth <= innerWidth &&
        [...el.querySelectorAll('article')].every(box => box.scrollWidth <= box.clientWidth + 1);
    })).toBe(true);
    for (const link of [shortLink, grid.getByRole('link', { name: longTitle, exact: true })]) {
      const box = await link.boundingBox();
      expect(Math.min(box!.height, box!.width)).toBeGreaterThanOrEqual(44);
    }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await info.attach('media-books', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

    await shortLink.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: shortTitle, exact: true })).toBeVisible();
    if (width === 390 && theme === 'light') {
      await page.getByRole('checkbox', { name: 'Favorite', exact: true }).check();
      await page.getByRole('button', { name: 'Save changes', exact: true }).tap();
      await expect(page.getByText('Changes saved.', { exact: true })).toBeVisible();
      expect((await savedItem(request, short.id)).favorite).toBe(true);
    }
    await page.goBack();
    await expect(page).toHaveURL(/kind=book&sort=title/);
    await expect(shortLink).toBeVisible();
    if (width === 390 && theme === 'light') {
      await expect(grid.locator('article[data-book]').filter({ has: page.getByRole('link', { name: shortTitle, exact: true }) })).toContainText('Favorite');
    }
  });
}

test('a held library response cannot repopulate cards after the collection filter changes', async ({ page, request }) => {
  await addItem(request, { title: 'Harbor collection marker' });
  await addItem(request, { title: 'Tide collection marker' });
  const arrived = deferred();
  const release = deferred();
  const sent = deferred();
  await page.route('**/media/api/library?*', async route => {
    const q = new URL(route.request().url()).searchParams.get('q');
    if (q !== 'Harbor') return route.continue();
    const response = await route.fetch();
    arrived.resolve();
    await release.promise;
    await route.fulfill({ response }).catch(() => {});
    sent.resolve();
  });
  await page.goto('/media/library');
  const search = page.getByRole('searchbox');
  await search.fill('Harbor');
  await arrived.promise;
  try {
    await search.fill('Tide');
    await expect(page.getByRole('link', { name: 'Tide collection marker', exact: true })).toBeVisible();
  } finally {
    release.resolve();
    await sent.promise;
  }
  await expect(page.getByRole('link', { name: 'Harbor collection marker', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Tide collection marker', exact: true })).toBeVisible();
  await expect(search).toHaveValue('Tide');
});

test('a late category read cannot publish after switching and retry only reads the selected category', async ({ page, request }) => {
  await addItem(request, { kind: 'movie', title: 'Harbor Matinee' });
  await addItem(request, { kind: 'book', title: 'Harbor Logbook' });
  await addItem(request, { kind: 'game', title: 'Harbor Tactics' });
  const arrived = deferred();
  const release = deferred();
  const sent = deferred();
  const reads: string[] = [];
  await page.route('**/media/api/library?*', async route => {
    const kind = new URL(route.request().url()).searchParams.get('kind') || '';
    reads.push(kind);
    if (kind === 'book') {
      const response = await route.fetch();
      arrived.resolve();
      await release.promise;
      await route.fulfill({ response }).catch(() => {});
      sent.resolve();
      return;
    }
    if (kind === 'game' && reads.filter(value => value === 'game').length === 1) {
      await route.fulfill({ status: 503, json: {} });
      return;
    }
    await route.continue();
  });

  await page.goto('/media/library?kind=movie');
  await expect(page.getByRole('link', { name: 'Harbor Matinee', exact: true })).toBeVisible();
  const sections = page.getByRole('navigation', { name: 'Media sections' });
  const books = sections.getByRole('link', { name: 'Books', exact: true });
  const games = sections.getByRole('link', { name: 'Games', exact: true });
  await books.click();
  try {
    await arrived.promise;
    await expect(books).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('status').filter({ hasText: 'Loading your library' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Harbor Matinee', exact: true })).toHaveCount(0);
    await games.click();
    await expect(page.getByRole('button', { name: 'Retry library' })).toBeVisible();
    await expect(games).toHaveAttribute('aria-current', 'page');
  } finally {
    release.resolve();
    await sent.promise;
  }
  await expect(page.getByRole('link', { name: 'Harbor Logbook', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Retry library' }).click();
  await expect(page.getByRole('link', { name: 'Harbor Tactics', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Games', exact: true })).toBeFocused();
  await expect(page).toHaveURL(/kind=game$/);
  expect(reads).toEqual(['movie', 'book', 'game', 'game']);
});
