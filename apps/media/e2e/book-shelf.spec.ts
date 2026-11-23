import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Locator, type Page } from '../../../tests/e2e/fixtures';
import {
  addItem,
  deferred,
  expectCleanMediaPage,
  expectSectionHeading,
  resetMedia,
  savedItem,
  watchMediaConsole,
} from './media-test';

test.beforeEach(async ({ request }) => resetMedia(request));
test.use({ reducedMotion: 'reduce' });

const COVER = 'https://covers.openlibrary.org/b/id/1-M.jpg';
const BROKEN = 'https://covers.openlibrary.org/b/id/404-M.jpg';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function seedBooks(request: APIRequestContext) {
  for (let index = 1; index <= 10; index += 1) {
    await addItem(request, {
      kind: 'book',
      title: `Aisle ${String(index).padStart(2, '0')}`,
      creator: 'Shelf Keeper',
      status: 'in_progress',
    });
  }
  const current = await addItem(request, {
    kind: 'book',
    title: 'Glass House',
    creator: 'Ada Writer',
    status: 'in_progress',
    progress_value: 40,
    progress_unit: 'page',
    review: 'A synthetic margin about the glass house.',
    artwork_url: COVER,
    extra: { authors: [{ id: 'openlibrary:OL10A', name: 'Ada Writer' }] },
  });
  await addItem(request, {
    kind: 'book',
    title: 'Second Glass',
    creator: 'Ada Writer',
    status: 'in_progress',
    extra: { authors: [{ id: 'openlibrary:OL10A', name: 'Ada Writer' }] },
  });
  await addItem(request, {
    kind: 'book',
    title: 'Other Glass House',
    creator: 'Ada Writer',
    status: 'in_progress',
    artwork_url: BROKEN,
    extra: { authors: [{ id: 'Ada Writer', name: 'Ada Writer' }] },
  });
  await addItem(request, {
    kind: 'book',
    title: 'Glass House',
    creator: 'Ada Writer',
    status: 'want',
  });
  await addItem(request, { kind: 'book', title: 'Missing Cover Tale', status: 'want' });
  await addItem(request, {
    kind: 'book',
    title: 'Harbor Cycle One',
    creator: 'Nia Binder',
    status: 'completed',
    extra: {
      authors: [{ id: 'openlibrary:OL20A', name: 'Nia Binder' }],
      series: [{ id: 'openlibrary:OL55S', name: 'Harbor Cycle' }],
    },
  });
  await addItem(request, {
    kind: 'book',
    title: 'Harbor Cycle Two',
    creator: 'Nia Binder',
    status: 'completed',
    progress_value: 12,
    progress_unit: 'percent',
    extra: {
      authors: [{ id: 'openlibrary:OL20A', name: 'Nia Binder' }],
      series: [{ id: 'openlibrary:OL55S', name: 'Harbor Cycle' }],
    },
  });
  await addItem(request, {
    kind: 'book',
    title: 'Harbor Cycle Three',
    creator: 'Nia Binder',
    status: 'completed',
    extra: {
      authors: [{ id: 'openlibrary:OL20A', name: 'Nia Binder' }],
      series: 'Harbor Cycle',
    },
  });
  await addItem(request, { kind: 'book', title: 'Quiet Index', status: 'completed' });
  return current;
}

function volume(page: Page, title: string) {
  return page.locator('article[data-book]').filter({
    has: page.getByRole('link', { name: title, exact: true }),
  });
}

async function installCovers(page: Page) {
  await page.route('https://covers.openlibrary.org/**', async route => {
    if (route.request().url().includes('/404-')) {
      await route.fulfill({ status: 404, body: 'missing' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
  });
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

async function expectTarget(control: Locator) {
  await control.scrollIntoViewIfNeeded();
  const box = await control.boundingBox();
  expect(box).toBeTruthy();
  expect(Math.min(box!.width, box!.height)).toBeGreaterThanOrEqual(44);
}

for (const [width, height, theme, pointer] of [
  [390, 844, 'light', 'keyboard'],
  [390, 844, 'dark', 'touch'],
  [1280, 800, 'light', 'touch'],
  [1280, 800, 'dark', 'keyboard'],
] as const) {
  test.describe(`book shelves at ${width} ${theme} ${pointer}`, () => {
    test.use({ viewport: { width, height }, hasTouch: pointer === 'touch' });

    test('reads titles, authors, and progress without a poster grid', async ({ page, request }, info) => {
      test.setTimeout(120_000);
      const violations: string[] = [];
      watchMediaConsole(page, violations);
      await installCovers(page);
      await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const current = await seedBooks(request);
      await page.goto('/media/library?kind=book&sort=title');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expectSectionHeading(page, 'Books');
      await expect(page.getByText('Books. Current, read, and to-read shelves', { exact: false })).toBeVisible();
      await expect(page.locator('.media-card--poster, media-card')).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Current', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Read', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'To read', exact: true })).toBeVisible();

      const author = page.locator('[data-author="openlibrary:OL10A"]');
      await expect(author.getByRole('link', { name: 'Glass House', exact: true })).toBeVisible();
      await expect(author.getByRole('link', { name: 'Second Glass', exact: true })).toBeVisible();
      await expect(author.getByRole('link', { name: 'Other Glass House', exact: true })).toHaveCount(0);
      await expect(author.getByText('Same author', { exact: true })).toBeVisible();
      const series = page.locator('[data-series="openlibrary:OL55S"]');
      await expect(series.getByRole('link', { name: 'Harbor Cycle One', exact: true })).toBeVisible();
      await expect(series.getByRole('link', { name: 'Harbor Cycle Two', exact: true })).toBeVisible();
      await expect(series.getByRole('link', { name: 'Harbor Cycle Three', exact: true })).toHaveCount(0);
      await expect(series.getByText('Same series', { exact: true })).toBeVisible();
      const looseCycle = volume(page, 'Harbor Cycle Three');
      await expect(looseCycle).toHaveAttribute('data-author', 'linked');
      await expect(looseCycle).not.toContainText('Same series');

      const missing = volume(page, 'Missing Cover Tale');
      await expect(missing).toHaveAttribute('data-cover', 'missing');
      await expect(missing).toHaveAttribute('data-author', 'unlinked');
      await expect(missing.locator('img')).toHaveCount(0);
      await expect(missing.getByText('Author not linked', { exact: true })).toBeVisible();
      await expect(missing.locator('.spine-title')).toHaveText('Missing Cover Tale');
      const unlinked = volume(page, 'Other Glass House');
      await expect(unlinked).toHaveAttribute('data-author', 'unlinked');
      await expect(unlinked.getByText('Ada Writer · not linked', { exact: true })).toBeVisible();
      await expect(unlinked).toHaveAttribute('data-cover', 'missing');
      const quiet = volume(page, 'Quiet Index');
      await expect(quiet.getByText('Progress unknown', { exact: true })).toBeVisible();
      await expect(quiet).not.toContainText('100%');
      await expect(quiet).not.toContainText(/\b20\d{2}\b/);
      const glass = page.locator('article[data-author="linked"]').filter({
        has: page.getByRole('link', { name: 'Glass House', exact: true }),
      });
      await expect(glass.getByText('p. 40', { exact: true })).toBeVisible();
      await expect(glass.getByText('A synthetic margin about the glass house.', { exact: false })).toBeVisible();
      await expect(glass.locator('img')).toBeVisible();
      await expect(glass.locator('.spine-title')).toHaveText('Glass House');
      await expect(page.getByRole('heading', { name: 'Reading hall', exact: true })).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Shelf signs' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Reading desk', exact: true })).toBeVisible();

      const text = page.getByRole('link', { name: 'Text', exact: true });
      await expectTarget(text);
      await activate(text, pointer);
      await expect(page).toHaveURL(/face=text/);
      await expect(page.locator('.book-hall')).toHaveAttribute('data-face', 'text');
      await expect(page.locator('.book-hall img')).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Missing Cover Tale', exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Glass House', exact: true }).first()).toBeVisible();
      await page.reload();
      await expect(page).toHaveURL(/kind=book/);
      await expect(page).toHaveURL(/sort=title/);
      await expect(page).toHaveURL(/face=text/);
      await expect(page.locator('.book-hall')).toHaveAttribute('data-face', 'text');

      const update = glass.getByRole('button', { name: 'Update progress for Glass House' });
      await expectTarget(update);
      await activate(update, pointer);
      const progress = page.getByRole('textbox', { name: 'Progress for Glass House' });
      await expect(progress).toBeFocused();
      await expect(progress).toHaveValue('40');
      await progress.fill('41');
      await page.getByRole('textbox', { name: 'Note for Glass House' }).fill('A revised synthetic note.');
      const save = page.getByRole('button', { name: 'Save progress', exact: true });
      await save.scrollIntoViewIfNeeded();
      const savedTop = await page.evaluate(() => window.scrollY);
      await activate(save, pointer);
      await expect(page.getByText('p. 41', { exact: true })).toBeVisible();
      await expect(page.getByText('A revised synthetic note.', { exact: false })).toBeVisible();
      await expect(page.locator('.book-desk')).toHaveCount(0);
      expect(Math.abs((await page.evaluate(() => window.scrollY)) - savedTop)).toBeLessThan(80);
      expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toContain(
        'Update progress for Glass House',
      );
      const stored = await savedItem(request, current.id);
      expect(stored.progress_value).toBe(41);
      expect(stored.progress_unit).toBe('page');
      expect(stored.review).toBe('A revised synthetic note.');
      expect(stored.completed_on).toBeUndefined();

      const undo = page.getByRole('button', { name: 'Undo completion for Quiet Index' });
      await expectTarget(undo);
      const keepsake = page.locator('[data-keepsake]').filter({ has: page.getByRole('heading', { name: 'Quiet Index', exact: true }) });
      await expect(keepsake).toContainText('Completed book on');
      await expect(keepsake).toContainText('A watched episode is a separate record and is not this keepsake.');

      const scan = await new AxeBuilder({ page }).include('main').analyze();
      expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
      await expectCleanMediaPage(page, violations);
      const shot = info.outputPath(`books-${width}-${theme}-${pointer}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      await info.attach(`books-${width}-${theme}-${pointer}`, { path: shot, contentType: 'image/png' });
    });
  });
}

test('updating a current book and coming back keeps progress and scroll', async ({ page, request }) => {
  test.setTimeout(90_000);
  await installCovers(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const current = await seedBooks(request);
  await page.goto('/media/library?kind=book&sort=title&face=text');
  const link = page.locator('article[data-author="linked"]').getByRole('link', { name: 'Glass House', exact: true });
  await link.scrollIntoViewIfNeeded();
  const top = await page.evaluate(() => window.scrollY);
  expect(top).toBeGreaterThan(200);
  await link.click();
  await expect(page).toHaveURL(/\/media\/item\//);
  await expect(page.getByRole('heading', { level: 1, name: 'Glass House', exact: true })).toBeVisible();
  await page.getByLabel('Progress', { exact: true }).fill('88');
  await page.getByLabel('Note (optional)').fill('Returned from the reading desk.');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved.', { exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/kind=book/);
  await expect(page).toHaveURL(/face=text/);
  await expect(page).toHaveURL(/sort=title/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(top - 80);
  await expect(page.getByText('p. 88', { exact: true })).toBeVisible();
  await expect(page.getByText('Returned from the reading desk.', { exact: false })).toBeVisible();
  const stored = await savedItem(request, current.id);
  expect(stored.progress_value).toBe(88);
  expect(stored.progress_label).toBe('p. 88');
  expect(stored.review).toBe('Returned from the reading desk.');

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/media/library?kind=book&sort=title&status=in_progress&face=text');
  await expect(page.getByRole('heading', { name: 'To read', exact: true })).toHaveCount(0);
  await link.scrollIntoViewIfNeeded();
  const wide = await page.evaluate(() => window.scrollY);
  await link.click();
  await expect(page).toHaveURL(/\/media\/item\//);
  await page.goBack();
  await expect(page).toHaveURL(/status=in_progress/);
  await expect(page).toHaveURL(/face=text/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(wide - 80);
});

test('a failed save keeps the book and the typed progress', async ({ page, request }) => {
  await installCovers(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  const current = await seedBooks(request);
  await page.goto('/media/library?kind=book&sort=title&face=text');
  const glass = page.locator('article[data-author="linked"]').filter({
    has: page.getByRole('link', { name: 'Glass House', exact: true }),
  });
  await glass.getByRole('button', { name: 'Update progress for Glass House' }).click();
  const progress = page.getByRole('textbox', { name: 'Progress for Glass House' });
  await expect(progress).toHaveValue('40');
  await page.route('**/media/api/entries/*', async route => {
    if (route.request().method() === 'PATCH') {
      await route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ detail: 'Bad gateway' }) });
      return;
    }
    await route.continue();
  });
  await progress.fill('55');
  await page.getByRole('button', { name: 'Save progress', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Bad gateway' })).toBeVisible();
  await expect(progress).toHaveValue('55');
  await expect(glass.getByText('p. 40', { exact: true })).toBeVisible();
  const stored = await savedItem(request, current.id);
  expect(stored.progress_value).toBe(40);
  expect(stored.status).toBe('in_progress');
  expect(stored.review).toBe('A synthetic margin about the glass house.');
});

test('a late shelf move does not rewrite the movie shelf, and sign-out clears the draft', async ({ page, request }) => {
  test.setTimeout(90_000);
  await installCovers(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await addItem(request, { kind: 'movie', title: 'Paper Lantern', status: 'completed' });
  const waiting = await addItem(request, { kind: 'book', title: 'Missing Cover Tale', status: 'want' });
  const show = await addItem(request, {
    kind: 'tv',
    title: 'Lantern Hour',
    status: 'in_progress',
    extra: { lifecycle: 'ongoing' },
  });
  expect((await request.post(`/media/api/entries/${show.id}/episodes`, {
    data: { season_number: 1, episode_number: 1, title: 'Pilot', air_date: '2020-01-01' },
  })).ok()).toBeTruthy();
  await page.goto('/media/library?kind=book&sort=title');
  const started = deferred();
  const release = deferred();
  await page.route('**/media/api/entries/*', async route => {
    if (route.request().method() !== 'PATCH') {
      await route.continue();
      return;
    }
    started.resolve();
    await release.promise;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...(await savedItem(request, waiting.id)),
        status: 'in_progress',
      }),
    });
  });
  await volume(page, 'Missing Cover Tale').getByRole('button', { name: 'Reading now. Move Missing Cover Tale to Current' }).click();
  await started.promise;
  await page.goto('/media/library?kind=movie&sort=title');
  release.resolve();
  await expect(page.locator('.theater-poster')).toHaveCount(1);
  await expect(page.locator('.media-card--poster')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Paper Lantern', exact: true })).toBeVisible();
  await expect(page.locator('media-book-shelf')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reading now. Move Missing Cover Tale to Current' })).toHaveCount(0);
  await page.unroute('**/media/api/entries/*');
  expect((await savedItem(request, waiting.id)).status).toBe('want');

  await page.goto('/media/library?kind=tv&sort=title');
  await expect(page.locator('.media-card--poster')).toHaveCount(0);
  await expect(page.locator('media-episode-lounge')).toBeVisible();
  await expect(page.getByRole('button', { name: /Watched S1E1/ })).toBeVisible();
  await expect(page.getByText('Ongoing', { exact: true })).toBeVisible();

  await page.goto('/media/library?kind=book&sort=title&face=text');
  await volume(page, 'Missing Cover Tale').getByRole('button', { name: 'Update progress for Missing Cover Tale' }).click();
  const note = page.getByRole('textbox', { name: 'Note for Missing Cover Tale' });
  await note.fill('Keep this until sign-out.');
  await expect.poll(() => page.evaluate(() => Object.keys(sessionStorage).some(key => key.startsWith('media-item-draft:')))).toBe(true);
  const ended = await page.request.post('/api/auth/logout', {
    headers: { 'X-CSRF-Token': 'synthetic-csrf', Origin: new URL(page.url()).origin },
  });
  expect(ended.ok(), await ended.text()).toBeTruthy();
  await page.route('**/media/api/entries/' + waiting.id, route =>
    route.fulfill({ status: 401, json: { detail: 'Session expired' } }),
  );
  await page.getByRole('button', { name: 'Save progress', exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/login/);
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('media-item-draft:')))).toEqual([]);
});

test('an empty reading shelf says so, and all items stay rows', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const seeded = await request.get('/media/api/library?kind=book&limit=24');
  expect(seeded.ok()).toBeTruthy();
  for (const item of (await seeded.json()).items as { id: number }[]) {
    expect((await request.delete('/media/api/entries/' + item.id)).ok()).toBeTruthy();
  }
  await page.goto('/media/library?kind=book');
  await expect(page.getByText('No books saved yet', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Current', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Text', exact: true })).toBeVisible();
  await addItem(request, { kind: 'book', title: 'Missing Cover Tale', status: 'want' });
  await addItem(request, { kind: 'movie', title: 'Paper Lantern', status: 'want' });
  await page.goto('/media/library?kind=book&sort=title');
  const empty = page.getByText("Nothing you're reading right now.", { exact: true });
  await expect(empty).toBeVisible();
  await expect(empty).not.toHaveAttribute('role', 'status');
  await expect(page.getByText('No finished books on this shelf.', { exact: true })).toBeVisible();
  await expect(volume(page, 'Missing Cover Tale')).toBeVisible();
  await page.goto('/media/library?sort=title');
  await expect(page.locator('media-book-shelf')).toHaveCount(0);
  await expect(page.locator('.media-card--poster')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Missing Cover Tale', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Paper Lantern', exact: true })).toBeVisible();
});

test('opening the read shelf, updating progress, and returning keeps that book', async ({ page, request }) => {
  test.setTimeout(90_000);
  await installCovers(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const atlas = await addItem(request, {
    kind: 'book',
    title: 'Paper Atlas',
    status: 'completed',
    progress_value: 12,
    progress_unit: 'page',
    review: 'A synthetic note that stays.',
  });
  await page.goto('/media/library?kind=book&sort=title');
  const read = page.getByRole('link', { name: 'Read', exact: true });
  await read.focus();
  await read.press('Enter');
  await expect(page).toHaveURL(/status=completed/);
  await expect(page.getByRole('heading', { name: 'Current', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'To read', exact: true })).toHaveCount(0);
  const link = volume(page, 'Paper Atlas').getByRole('link', { name: 'Paper Atlas', exact: true });
  await link.scrollIntoViewIfNeeded();
  const top = await page.evaluate(() => window.scrollY);
  await link.click();
  await expect(page).toHaveURL(/\/media\/item\//);
  await expect(page.getByRole('heading', { level: 1, name: 'Paper Atlas', exact: true })).toBeVisible();
  await page.getByLabel('Progress', { exact: true }).fill('18');
  await page.getByLabel('Note (optional)').fill('Returned to the same shelf.');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved.', { exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/kind=book/);
  await expect(page).toHaveURL(/status=completed/);
  await expect(page).toHaveURL(/sort=title/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(top - 80);
  await expect(volume(page, 'Paper Atlas')).toBeVisible();
  await expect(page.getByText('p. 18', { exact: true })).toBeVisible();
  await expect(page.getByText('Returned to the same shelf.', { exact: false })).toBeVisible();
  const stored = await savedItem(request, atlas.id);
  expect(stored.progress_value).toBe(18);
  expect(stored.review).toBe('Returned to the same shelf.');
  expect(stored.status).toBe('completed');

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/media/library?kind=book&sort=title&status=completed');
  await link.scrollIntoViewIfNeeded();
  const wide = await page.evaluate(() => window.scrollY);
  await link.click();
  await expect(page).toHaveURL(/\/media\/item\//);
  await page.goBack();
  await expect(page).toHaveURL(/status=completed/);
  await expect(volume(page, 'Paper Atlas')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(wide - 80);
});

test('undoing completion retracts the derived keepsake and keeps the book and note', async ({ page, request }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  const atlas = await addItem(request, {
    kind: 'book',
    title: 'Paper Atlas',
    status: 'completed',
    progress_value: 12,
    progress_unit: 'page',
    review: 'A synthetic note that stays.',
  });
  await addItem(request, { kind: 'movie', title: 'Velvet Screening', status: 'completed' });
  await page.goto('/media/library?kind=book&sort=title');
  const keepsake = page.locator('[data-keepsake]').filter({ has: page.getByRole('heading', { name: 'Paper Atlas', exact: true }) });
  await expect(keepsake).toBeVisible();
  await expect(keepsake).toContainText('Completed book on');
  await expect(keepsake).not.toContainText('A synthetic note that stays.');
  await expect(volume(page, 'Paper Atlas')).toContainText('A synthetic note that stays.');
  await expect(page.locator('[data-keepsake]').filter({ hasText: 'Velvet Screening' })).toHaveCount(0);
  const undo = page.getByRole('button', { name: 'Undo completion for Paper Atlas' });
  await undo.focus();
  await undo.press('Enter');
  await expect(page.getByText('Completion undone. The book and note stay saved.', { exact: true })).toBeVisible();
  await expect(page.locator('[data-keepsake]').filter({ hasText: 'Paper Atlas' })).toHaveCount(0);
  await expect(volume(page, 'Paper Atlas')).toContainText('A synthetic note that stays.');
  await expect(volume(page, 'Paper Atlas')).toContainText('p. 12');
  const stored = await savedItem(request, atlas.id);
  expect(stored.status).toBe('in_progress');
  expect(stored.review).toBe('A synthetic note that stays.');
  expect(stored.progress_value).toBe(12);
  expect(stored.completed_on).toBeUndefined();
  const projected = await request.get('/api/town/keepsakes?tz=UTC');
  expect(projected.ok()).toBeTruthy();
  const body = await projected.json();
  expect(body.keepsakes.some((item: { title: string }) => item.title === 'Paper Atlas')).toBe(false);
  expect(body.keepsakes.some((item: { title: string }) => item.title === 'Velvet Screening')).toBe(true);
});

test('a late keepsake response and a failed undo leave the book and note', async ({ page, request }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const atlas = await addItem(request, {
    kind: 'book',
    title: 'Paper Atlas',
    status: 'completed',
    review: 'A synthetic note that stays.',
  });
  await addItem(request, { kind: 'movie', title: 'Paper Lantern', status: 'completed' });
  const started = deferred();
  const release = deferred();
  await page.route('**/api/town/keepsakes**', async route => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    started.resolve();
    await release.promise;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        on: null,
        cap: 50,
        media: { status: 'ok', included: 1, total: 1, truncated: false },
        travel: {
          status: 'ok',
          souvenirs: { status: 'ok', included: 0, total: 0, truncated: false },
          planned: { status: 'ok', included: 0, total: 0, truncated: false },
          ineligible: { status: 'ok', included: 0, total: 0, truncated: false },
        },
        keepsakes: [{
          id: 'finished:1:2026-11-23',
          entry_id: atlas.id,
          kind: 'book',
          title: 'Late Atlas',
          on: '2026-11-23',
          route: `/media/item/${atlas.id}`,
          note: 'Completed book on 2026-11-23.',
          date_source: 'completed_on',
        }],
        souvenirs: [],
        planned: [],
        ineligible: [],
        differences: [],
      }),
    });
  });
  await page.goto('/media/library?kind=book&sort=title');
  await started.promise;
  await page.goto('/media/library?kind=movie&sort=title');
  release.resolve();
  await expect(page.locator('.theater-poster')).toHaveCount(1);
  await expect(page.locator('[data-keepsake]')).toHaveCount(0);
  await expect(page.getByText('Late Atlas')).toHaveCount(0);
  await page.unroute('**/api/town/keepsakes**');
  expect((await savedItem(request, atlas.id)).review).toBe('A synthetic note that stays.');
  expect((await savedItem(request, atlas.id)).status).toBe('completed');

  await page.goto('/media/library?kind=book&sort=title&face=text');
  const book = volume(page, 'Paper Atlas');
  await book.getByRole('button', { name: 'Update progress for Paper Atlas' }).click();
  const note = page.getByRole('textbox', { name: 'Note for Paper Atlas' });
  await note.fill('Keep this through the failed undo.');
  await page.route('**/media/api/entries/*', async route => {
    if (route.request().method() === 'PATCH') {
      await route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ detail: 'Bad gateway' }) });
      return;
    }
    await route.continue();
  });
  await page.getByRole('button', { name: 'Undo completion for Paper Atlas' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Bad gateway' })).toBeVisible();
  await expect(note).toHaveValue('Keep this through the failed undo.');
  await expect(page.locator('[data-keepsake]').filter({ hasText: 'Paper Atlas' })).toHaveCount(1);
  const stored = await savedItem(request, atlas.id);
  expect(stored.status).toBe('completed');
  expect(stored.review).toBe('A synthetic note that stays.');
  await page.unroute('**/media/api/entries/*');

  const ended = await page.request.post('/api/auth/logout', {
    headers: { 'X-CSRF-Token': 'synthetic-csrf', Origin: new URL(page.url()).origin },
  });
  expect(ended.ok(), await ended.text()).toBeTruthy();
  await page.route('**/media/api/entries/' + atlas.id, route =>
    route.fulfill({ status: 401, json: { detail: 'Session expired' } }),
  );
  await page.getByRole('button', { name: 'Save progress', exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/login/);
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('media-item-draft:')))).toEqual([]);
});
