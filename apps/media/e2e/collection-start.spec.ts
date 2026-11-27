import { expect, test, type Locator, type Page } from '../../../tests/e2e/fixtures';
import { addItem, closeFilters, openFilters, resetMedia, savedItem } from './media-test';

const FILM = 'Paper Lantern on a very long coastal marquee';
const SERIES = 'Lantern Hour';
const BOOK = 'Glass House';
const ARTIST = 'Lantern Voice';
const PROVIDER = /tmdb|musicbrainz|openlibrary|igdb|rawg|themoviedb/i;

test.beforeEach(async ({ request }) => resetMedia(request));
test.use({ reducedMotion: 'reduce' });

async function seed(request: Parameters<typeof addItem>[0]) {
  await addItem(request, { kind: 'movie', title: FILM, status: 'want' });
  await addItem(request, { kind: 'tv', title: SERIES, status: 'in_progress' });
  await addItem(request, {
    kind: 'book',
    title: BOOK,
    status: 'in_progress',
    progress_value: 12,
    progress_unit: 'page',
  });
  const album = await request.post('/media/api/library', {
    data: {
      kind: 'album',
      title: 'Lantern Pressing',
      rating: 6,
      artist_identity: { source: 'manual', source_id: 'person-lantern-voice', name: ARTIST },
    },
  });
  expect(album.ok(), await album.text()).toBeTruthy();
}

async function enter(page: Page, name: string, kind: string) {
  await page.goto('/media');
  await page.getByRole('navigation', { name: 'Media sections' }).getByRole('link', { name, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`kind=${kind}`));
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
}

async function chromeBottom(page: Page) {
  return page.evaluate(() => {
    const header = document.querySelector('.suite-header')?.getBoundingClientRect().bottom ?? 0;
    const nav = document.querySelector('ui-section-nav')?.getBoundingClientRect().bottom ?? 0;
    return Math.max(header, nav);
  });
}

async function fullyVisible(page: Page, control: Locator, label: string, min = 44) {
  const box = await control.boundingBox();
  expect(box, label).toBeTruthy();
  const chrome = await chromeBottom(page);
  const height = page.viewportSize()!.height;
  console.log(JSON.stringify({
    label,
    top: Math.round(box!.y),
    bottom: Math.round(box!.y + box!.height),
    chrome: Math.round(chrome),
    height,
    scroll: await page.evaluate(() => window.scrollY),
  }));
  expect(box!.y, label).toBeGreaterThanOrEqual(chrome - 1);
  expect(box!.y + box!.height, label).toBeLessThanOrEqual(height + 1);
  if (min > 0) expect(Math.min(box!.width, box!.height), label).toBeGreaterThanOrEqual(min);
}

async function expectEmptyAction(page: Page) {
  const clear = page.getByRole('button', { name: 'Clear filters', exact: true });
  await expect(clear).toBeVisible();
  await fullyVisible(page, clear, 'clear filters');
  const search = page.getByRole('link', { name: 'Search Media', exact: true });
  await expect(search).toBeVisible();
}

for (const [width, height, theme] of [
  [390, 844, 'light'],
  [390, 844, 'dark'],
  [1280, 800, 'light'],
  [1280, 800, 'dark'],
] as const) {
  test.describe(`saved media starts in view at ${width} ${theme}`, () => {
    test.use({ viewport: { width, height } });

    test('first item, its action, and an empty filter action fit', async ({ page, request }) => {
      test.setTimeout(120_000);
      const providers: string[] = [];
      page.on('request', (req) => {
        if (PROVIDER.test(req.url())) providers.push(req.url());
      });
      await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
      await seed(request);

      await enter(page, 'Movies', 'movie');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const film = page.getByRole('link', { name: FILM, exact: true });
      const openFilm = page.getByRole('button', { name: `Open screening for ${FILM}` });
      await fullyVisible(page, film, `film title ${width} ${theme}`);
      await fullyVisible(page, openFilm, `film action ${width} ${theme}`);
      await page.getByRole('link', { name: 'Watched', exact: true }).click();
      await expect(page).toHaveURL(/status=completed/);
      await expect(page.getByText('Nothing in this collection matches', { exact: true })).toBeVisible();
      await expectEmptyAction(page);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);

      await enter(page, 'Series', 'tv');
      const series = page.getByRole('link', { name: SERIES, exact: true });
      const openSeries = page.getByRole('button', { name: `Open seating for ${SERIES}` });
      await fullyVisible(page, series, `series title ${width} ${theme}`);
      await fullyVisible(page, openSeries, `series action ${width} ${theme}`);
      await openFilters(page);
      await page.getByRole('dialog').getByLabel('State').selectOption('completed');
      await closeFilters(page);
      await expect(page).toHaveURL(/kind=tv/);
      await expect(page).toHaveURL(/status=completed/);
      await expect(page.getByText('Nothing in this collection matches', { exact: true })).toBeVisible();
      await expectEmptyAction(page);

      await enter(page, 'Books', 'book');
      const book = page.getByRole('link', { name: BOOK, exact: true });
      const update = page.getByRole('button', { name: `Update progress for ${BOOK}` });
      await fullyVisible(page, book, `book title ${width} ${theme}`);
      await fullyVisible(page, update, `book action ${width} ${theme}`);
      await page.getByRole('link', { name: 'Read', exact: true }).click();
      await expect(page).toHaveURL(/status=completed/);
      await expect(page.getByText('Nothing in this collection matches', { exact: true })).toBeVisible();
      await expectEmptyAction(page);

      await enter(page, 'Music', 'artist');
      const artist = page.getByRole('heading', { name: ARTIST, exact: true });
      const portrait = page.getByRole('button', { name: `Open the grouping for ${ARTIST}` });
      await fullyVisible(page, artist, `artist title ${width} ${theme}`, 0);
      await fullyVisible(page, portrait, `artist action ${width} ${theme}`);
      const wall = await page.getByRole('heading', { name: 'Artist wall', exact: true }).boundingBox();
      const stage = await page.getByRole('heading', { name: 'Song stage', exact: true }).boundingBox();
      expect(wall!.y).toBeLessThan(stage!.y);
      await openFilters(page);
      await page.getByRole('dialog').getByLabel('State').selectOption('following');
      await closeFilters(page);
      await expect(page).toHaveURL(/status=following/);
      await expect(page.getByText('Nothing in this collection matches', { exact: true })).toBeVisible();
      await expectEmptyAction(page);
      expect(providers).toEqual([]);
    });
  });
}

test('a room edit and a record return keep the filter, scroll, and artist group', async ({ page, request }) => {
  test.setTimeout(120_000);
  const providers: string[] = [];
  page.on('request', (req) => {
    if (PROVIDER.test(req.url())) providers.push(req.url());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const film = await addItem(request, { kind: 'movie', title: FILM, status: 'want', review: 'Aisle note' });
  await addItem(request, { kind: 'movie', title: 'Second Reel', status: 'want' });
  await addItem(request, { kind: 'movie', title: 'Third Reel', status: 'want' });
  const album = await request.post('/media/api/library', {
    data: {
      kind: 'album',
      title: 'Lantern Pressing',
      rating: 6,
      review: 'Pressing note',
      artist_identity: { source: 'manual', source_id: 'person-lantern-voice', name: ARTIST },
    },
  });
  expect(album.ok(), await album.text()).toBeTruthy();

  await enter(page, 'Movies', 'movie');
  await page.getByRole('link', { name: 'Planned', exact: true }).click();
  await expect(page).toHaveURL(/status=want/);
  await expect(page).toHaveURL(/kind=movie/);
  const exit = page.getByRole('link', { name: 'Exit to Hub' });
  await exit.scrollIntoViewIfNeeded();
  const scrolled = await page.evaluate(() => window.scrollY);
  expect(scrolled).toBeGreaterThan(40);
  await page.getByRole('link', { name: FILM, exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/media\/item\//);
  await page.goBack();
  await expect(page).toHaveURL(/kind=movie/);
  await expect(page).toHaveURL(/status=want/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(scrolled - 80);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(scrolled + 80);
  await expect(page.getByRole('link', { name: FILM, exact: true })).toBeVisible();

  const open = page.getByRole('button', { name: `Open screening for ${FILM}` });
  await open.focus();
  await page.keyboard.press('Enter');
  const note = page.getByRole('textbox', { name: `Note for ${FILM}` });
  await expect(note).toHaveValue('Aisle note');
  await note.fill('Aisle note kept');
  await page.getByRole('button', { name: 'Save ticket', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(open).toBeFocused();
  expect((await savedItem(request, film.id)).review).toBe('Aisle note kept');
  expect((await savedItem(request, film.id)).status).toBe('want');

  await page.setViewportSize({ width: 1280, height: 800 });
  await enter(page, 'Music', 'artist');
  const portrait = page.getByRole('button', { name: `Open the grouping for ${ARTIST}` });
  await portrait.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/group=/);
  await expect(page.getByRole('link', { name: 'Lantern Pressing', exact: true })).toBeVisible();
  const groupUrl = page.url();
  await page.getByRole('link', { name: 'Lantern Pressing', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('main h1')).toHaveText('Lantern Pressing');
  await page.goBack();
  await expect(page).toHaveURL(groupUrl);
  await expect(page.getByRole('link', { name: 'Lantern Pressing', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: ARTIST, exact: true })).toBeVisible();
  expect(providers).toEqual([]);
});

test.describe('touch and narrow text', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

test('touch opens a book and 320px with 200% text does not overflow', async ({ page, request }) => {
  test.setTimeout(90_000);
  await seed(request);
  await enter(page, 'Books', 'book');
  const update = page.getByRole('button', { name: `Update progress for ${BOOK}` });
  await update.tap();
  const progress = page.getByRole('textbox', { name: `Progress for ${BOOK}` });
  await expect(progress).toBeFocused();
  await progress.fill('18');
  await page.getByRole('button', { name: 'Save progress', exact: true }).tap();
  await expect(page.getByText('p. 18', { exact: true })).toBeVisible();
  await expect(update).toBeFocused();

  await page.setViewportSize({ width: 320, height: 844 });
  await enter(page, 'Movies', 'movie');
  await fullyVisible(page, page.getByRole('button', { name: `Open screening for ${FILM}` }), 'film action 320');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await page.getByRole('link', { name: FILM, exact: true }).scrollIntoViewIfNeeded();
  const zoomed = await page.getByRole('button', { name: `Open screening for ${FILM}` }).boundingBox();
  expect(zoomed).toBeTruthy();
  expect(Math.min(zoomed!.width, zoomed!.height)).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});
});
