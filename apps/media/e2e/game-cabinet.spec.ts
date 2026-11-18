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

const BOX = 'https://media.rawg.io/synthetic/box.png';
const BROKEN = 'https://media.rawg.io/synthetic/missing-box.png';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function seedGames(request: APIRequestContext) {
  for (let index = 1; index <= 8; index += 1) {
    await addItem(request, {
      kind: 'game',
      title: `Aisle ${String(index).padStart(2, '0')}`,
      status: 'want',
    });
  }
  const playing = await addItem(request, {
    kind: 'game',
    title: 'Lantern Kart',
    status: 'in_progress',
    progress_value: 12,
    progress_unit: 'hour',
    review: 'A synthetic note about the lantern.',
    rating: 7,
    artwork_url: BOX,
  });
  const planned = await addItem(request, {
    kind: 'game',
    title: 'Lantern Kart',
    status: 'want',
  });
  const percent = await addItem(request, {
    kind: 'game',
    title: 'Glass Circuit',
    status: 'in_progress',
    progress_value: 40,
    progress_unit: 'percent',
  });
  await addItem(request, { kind: 'game', title: 'Paper Cartridge', status: 'want' });
  await addItem(request, { kind: 'game', title: 'Quiet Arcade', status: 'completed' });
  await addItem(request, { kind: 'game', title: 'Paused Relay', status: 'paused' });
  await addItem(request, { kind: 'game', title: 'Anticipated Port', status: 'anticipating' });
  await addItem(request, {
    kind: 'game',
    title: 'Broken Box',
    status: 'want',
    artwork_url: BROKEN,
  });
  const untouched = await addItem(request, {
    kind: 'game',
    title: 'Untouched Quest',
    status: 'want',
    progress_value: 3,
    progress_unit: 'hour',
  });
  await addItem(request, { kind: 'game', title: 'Zebra Cabinet', status: 'want' });
  return { playing, planned, percent, untouched };
}

function box(page: Page, title: string, status?: string) {
  const articles = status
    ? page.locator(`article[data-game][data-status="${status}"]`)
    : page.locator('article[data-game]');
  return articles.filter({
    has: page.getByRole('link', { name: title, exact: true }),
  });
}

async function installBoxes(page: Page) {
  await page.route('https://media.rawg.io/**', async route => {
    if (route.request().url().includes('missing-box')) {
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
  const bounds = await control.boundingBox();
  expect(bounds).toBeTruthy();
  expect(Math.min(bounds!.width, bounds!.height)).toBeGreaterThanOrEqual(44);
}

for (const [width, height, theme, pointer] of [
  [390, 844, 'light', 'keyboard'],
  [390, 844, 'dark', 'touch'],
  [1280, 800, 'light', 'touch'],
  [1280, 800, 'dark', 'keyboard'],
] as const) {
  test.describe(`game cabinet at ${width} ${theme} ${pointer}`, () => {
    test.use({ viewport: { width, height }, hasTouch: pointer === 'touch' });

    test('reads boxes, search, detail, and one progress update', async ({ page, request }, info) => {
      test.setTimeout(120_000);
      const violations: string[] = [];
      const townWrites: string[] = [];
      watchMediaConsole(page, violations);
      page.on('request', (req) => {
        if (req.method() === 'GET' || !req.url().includes('/api/town')) return;
        townWrites.push(`${req.method()} ${req.url()}`);
      });
      await installBoxes(page);
      await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const seeded = await seedGames(request);
      await page.goto('/media/library?kind=game&sort=title');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expectSectionHeading(page, 'Games');
      await expect(page.getByText('This cabinet is your Media library, not a Town minigame', { exact: false }).first()).toBeVisible();
      await expect(page.locator('.game-boundary')).toHaveText('This cabinet is your Media library, not a Town minigame.');
      await expect(page.locator('.media-card--poster, article[data-book], media-book-shelf')).toHaveCount(0);
      await expect(page.locator('article[data-game]')).toHaveCount(18);
      for (const name of ['Playing', 'Want to play', 'Played', 'Anticipating', 'Paused']) {
        await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
      }
      await expect(page.getByRole('heading', { name: 'Dropped', exact: true })).toHaveCount(0);

      const current = box(page, 'Lantern Kart', 'in_progress');
      const waiting = box(page, 'Lantern Kart', 'want');
      await expect(current.getByText('Playing', { exact: true })).toBeVisible();
      await expect(current.getByText('12 hours recorded', { exact: true })).toBeVisible();
      await expect(current.getByText('7 / 10', { exact: true })).toBeVisible();
      await expect(current.getByText('Note: A synthetic note about the lantern.', { exact: true })).toBeVisible();
      await expect(current.locator('img')).toBeVisible();
      await expect(current).toHaveAttribute('data-art', 'present');
      await expect(waiting.getByText('Want to play', { exact: true })).toBeVisible();
      await expect(waiting.getByText('Progress not recorded', { exact: true })).toBeVisible();
      await expect(waiting).not.toContainText('12 hours');
      const quiet = box(page, 'Quiet Arcade', 'completed');
      await expect(quiet.getByText('Played', { exact: true })).toBeVisible();
      await expect(quiet.getByText('Progress not recorded', { exact: true })).toBeVisible();
      await expect(quiet).not.toContainText('100%');
      await expect(quiet).not.toContainText(/\b20\d{2}\b/);
      const missing = box(page, 'Paper Cartridge', 'want');
      await expect(missing).toHaveAttribute('data-art', 'missing');
      await expect(missing.locator('img')).toHaveCount(0);
      await expect(missing.locator('.box-title-face')).toHaveText('Paper Cartridge');
      const broken = box(page, 'Broken Box', 'want');
      await broken.scrollIntoViewIfNeeded();
      await expect(broken).toHaveAttribute('data-art', 'missing');
      await expect(broken.locator('.box-title-face')).toHaveText('Broken Box');
      await expect(box(page, 'Glass Circuit').getByText('40 percent recorded', { exact: true })).toBeVisible();
      await expect(box(page, 'Untouched Quest').getByText('3 hours recorded', { exact: true })).toBeVisible();

      const zebra = page.getByRole('link', { name: 'Zebra Cabinet', exact: true });
      await zebra.scrollIntoViewIfNeeded();
      const zebraTop = await page.evaluate(() => window.scrollY);
      if (height === 844) expect(zebraTop).toBeGreaterThan(200);
      await activate(zebra, pointer);
      await expect(page).toHaveURL(/\/media\/item\//);
      await expect(page.getByRole('heading', { level: 1, name: 'Zebra Cabinet', exact: true })).toBeVisible();
      await page.goBack();
      await expect(page).toHaveURL(/kind=game/);
      await expect(page).toHaveURL(/sort=title/);
      await expect(page).not.toHaveURL(/status=/);
      await expect(zebra).toBeVisible();
      if (height === 844) {
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(zebraTop - 80);
      }

      const playingBay = page.getByRole('link', { name: 'Playing', exact: true });
      await expectTarget(playingBay);
      await activate(playingBay, pointer);
      await expect(page).toHaveURL(/kind=game/);
      await expect(page).toHaveURL(/status=in_progress/);
      await expect(page).toHaveURL(/sort=title/);
      await expect(current).toBeVisible();
      await expect(waiting).toHaveCount(0);
      await page.reload();
      await expect(page).toHaveURL(/status=in_progress/);
      await expect(page).toHaveURL(/sort=title/);
      await activate(page.getByRole('link', { name: 'All bays', exact: true }), pointer);
      await expect(page).not.toHaveURL(/status=/);
      await expect(waiting).toBeVisible();

      const search = page.getByRole('searchbox', { name: 'Search your library' });
      await search.fill('Quiet');
      await search.press('Enter');
      await expect(page).toHaveURL(/q=Quiet/);
      await expect(page).toHaveURL(/kind=game/);
      await expect(page).toHaveURL(/sort=title/);
      await expect(page.getByRole('link', { name: 'Quiet Arcade', exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Lantern Kart', exact: true })).toHaveCount(0);
      const quietLink = page.getByRole('link', { name: 'Quiet Arcade', exact: true });
      await activate(quietLink, pointer);
      await expect(page).toHaveURL(/\/media\/item\//);
      await expect(page.getByRole('heading', { level: 1, name: 'Quiet Arcade', exact: true })).toBeVisible();
      await page.goBack();
      await expect(page).toHaveURL(/kind=game/);
      await expect(page).toHaveURL(/sort=title/);
      await expect(page).toHaveURL(/q=Quiet/);
      await expect(quietLink).toBeVisible();
      await search.fill('');
      await search.press('Enter');
      await expect(page).not.toHaveURL(/[?&]q=/);
      await expect(current).toBeVisible();

      const update = current.getByRole('button', { name: 'Update progress for Lantern Kart' });
      await expectTarget(update);
      await activate(update, pointer);
      const progress = page.getByRole('textbox', { name: 'Progress for Lantern Kart' });
      await expect(progress).toBeFocused();
      await expect(progress).toHaveValue('12');
      await expect(page.getByRole('combobox', { name: 'Progress unit for Lantern Kart' })).toHaveValue('hour');
      await progress.fill('13');
      const save = page.getByRole('button', { name: 'Save progress', exact: true });
      await save.scrollIntoViewIfNeeded();
      const savedTop = await page.evaluate(() => window.scrollY);
      await activate(save, pointer);
      await expect(current.getByText('13 hours recorded', { exact: true })).toBeVisible();
      await expect(page.locator('.game-desk')).toHaveCount(0);
      expect(Math.abs((await page.evaluate(() => window.scrollY)) - savedTop)).toBeLessThan(80);
      expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toContain(
        'Update progress for Lantern Kart',
      );
      await expect(waiting.getByText('Progress not recorded', { exact: true })).toBeVisible();
      await expect(box(page, 'Untouched Quest').getByText('3 hours recorded', { exact: true })).toBeVisible();
      const stored = await savedItem(request, seeded.playing.id);
      expect(stored.progress_value).toBe(13);
      expect(stored.progress_unit).toBe('hour');
      expect(stored.status).toBe('in_progress');
      expect(stored.review).toBe('A synthetic note about the lantern.');
      expect(stored.completed_on).toBeUndefined();
      expect((await savedItem(request, seeded.planned.id)).status).toBe('want');
      expect((await savedItem(request, seeded.untouched.id)).progress_value).toBe(3);
      expect(townWrites).toEqual([]);

      const move = box(page, 'Glass Circuit').getByRole('button', {
        name: 'Played. Move Glass Circuit to Played',
      });
      await expectTarget(move);
      await activate(move, pointer);
      const finished = box(page, 'Glass Circuit', 'completed');
      await expect(finished.getByText('Played', { exact: true })).toBeVisible();
      await expect(finished.getByText('40 percent recorded', { exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-media-item'))).toBe(
        String(seeded.percent.id),
      );
      expect((await savedItem(request, seeded.percent.id)).status).toBe('completed');
      expect((await savedItem(request, seeded.percent.id)).progress_value).toBe(40);
      expect((await savedItem(request, seeded.playing.id)).progress_value).toBe(13);

      const scan = await new AxeBuilder({ page }).include('main').analyze();
      expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
      await expectCleanMediaPage(page, violations);
      const shot = info.outputPath(`games-${width}-${theme}-${pointer}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      await info.attach(`games-${width}-${theme}-${pointer}`, { path: shot, contentType: 'image/png' });
    });
  });
}

test('a failed save keeps the game and the typed progress', async ({ page, request }) => {
  await installBoxes(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  const seeded = await seedGames(request);
  await page.goto('/media/library?kind=game&sort=title');
  const current = box(page, 'Lantern Kart', 'in_progress');
  await current.getByRole('button', { name: 'Update progress for Lantern Kart' }).click();
  const progress = page.getByRole('textbox', { name: 'Progress for Lantern Kart' });
  await expect(progress).toHaveValue('12');
  await page.route('**/media/api/entries/*', async route => {
    if (route.request().method() === 'PATCH') {
      await route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ detail: 'Bad gateway' }) });
      return;
    }
    await route.continue();
  });
  await progress.fill('55');
  await page.getByRole('textbox', { name: 'Note for Lantern Kart' }).fill('Still on the desk.');
  await page.getByRole('button', { name: 'Save progress', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Bad gateway' })).toBeVisible();
  await expect(progress).toHaveValue('55');
  await expect(page.getByRole('textbox', { name: 'Note for Lantern Kart' })).toHaveValue('Still on the desk.');
  await expect(current.getByText('12 hours recorded', { exact: true })).toBeVisible();
  const stored = await savedItem(request, seeded.playing.id);
  expect(stored.progress_value).toBe(12);
  expect(stored.status).toBe('in_progress');
  expect(stored.review).toBe('A synthetic note about the lantern.');
});

test('a late cabinet move does not rewrite the movie shelf, and sign-out clears the draft', async ({ page, request }) => {
  test.setTimeout(90_000);
  await installBoxes(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await addItem(request, { kind: 'movie', title: 'Paper Lantern', status: 'completed' });
  const waiting = await addItem(request, { kind: 'game', title: 'Paper Cartridge', status: 'want' });
  await page.goto('/media/library?kind=game&sort=title');
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
  await box(page, 'Paper Cartridge').getByRole('button', { name: 'Playing now. Move Paper Cartridge to Playing' }).click();
  await started.promise;
  await page.goto('/media/library?kind=movie&sort=title');
  release.resolve();
  await expect(page.locator('.media-card--poster')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Paper Lantern', exact: true })).toBeVisible();
  await expect(page.locator('media-game-cabinet')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Playing now. Move Paper Cartridge to Playing' })).toHaveCount(0);
  await page.unroute('**/media/api/entries/*');
  expect((await savedItem(request, waiting.id)).status).toBe('want');

  await page.goto('/media/library?kind=game&sort=title');
  await box(page, 'Paper Cartridge').getByRole('button', { name: 'Update progress for Paper Cartridge' }).click();
  const note = page.getByRole('textbox', { name: 'Note for Paper Cartridge' });
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

test('an empty cabinet says so, and books, movies, and all items stay themselves', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const seeded = await request.get('/media/api/library?kind=game&limit=24');
  expect(seeded.ok()).toBeTruthy();
  for (const item of (await seeded.json()).items as { id: number }[]) {
    expect((await request.delete('/media/api/entries/' + item.id)).ok()).toBeTruthy();
  }
  await page.goto('/media/library?kind=game');
  await expect(page.getByText('No games saved yet', { exact: true })).toBeVisible();
  await expect(page.getByText('This cabinet is your Media library, not a Town minigame', { exact: false })).toBeVisible();
  await expect(page.getByText(/missing box image/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Playing', exact: true })).toBeVisible();
  await expect(page.locator('media-game-cabinet')).toHaveCount(0);

  await addItem(request, { kind: 'game', title: 'Paper Cartridge', status: 'want' });
  await addItem(request, { kind: 'movie', title: 'Paper Lantern', status: 'want' });
  await addItem(request, {
    kind: 'book',
    title: 'Glass House',
    status: 'in_progress',
    progress_value: 40,
    progress_unit: 'page',
  });
  await page.goto('/media/library?kind=game&sort=title');
  await expect(page.getByText("Nothing you're playing right now.", { exact: true })).toBeVisible();
  await expect(page.getByText('No finished games in this cabinet.', { exact: true })).toBeVisible();
  await expect(box(page, 'Paper Cartridge')).toBeVisible();
  await expect(page.locator('.media-card--poster, article[data-book]')).toHaveCount(0);

  await page.goto('/media/library?sort=title');
  await expect(page.locator('media-game-cabinet, .media-card--box, media-book-shelf')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Paper Cartridge', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Paper Lantern', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Glass House', exact: true })).toBeVisible();

  await page.goto('/media/library?kind=book&sort=title');
  await expect(page.locator('media-book-shelf')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Current', exact: true })).toBeVisible();
  await expect(page.getByText('p. 40', { exact: true })).toBeVisible();
  await expect(page.locator('media-game-cabinet, .media-card--box')).toHaveCount(0);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => localStorage.setItem('suite-theme', 'dark'));
  await page.goto('/media/library?kind=movie&sort=title');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.media-card--poster')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Paper Lantern', exact: true })).toBeVisible();
  await expect(page.locator('media-game-cabinet, media-book-shelf')).toHaveCount(0);
  await expect(page.getByText('Movies. Films you want to watch', { exact: false })).toBeVisible();
});

test('a long box title stays on the page at 320px and 200% text', async ({ page, request }) => {
  const longTitle = 'The Coastal Cabinet of Synthetic Harbors and UnbrokenCartridgeTitles';
  await addItem(request, { kind: 'game', title: longTitle, status: 'want' });
  await addItem(request, { kind: 'game', title: 'Tide', status: 'in_progress', progress_value: 1, progress_unit: 'hour' });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/media/library?kind=game&sort=title');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const cabinet = page.locator('media-game-cabinet');
  await expect(cabinet.getByRole('link', { name: longTitle, exact: true })).toBeVisible();
  await expect(cabinet.getByText('1 hour recorded', { exact: true })).toBeVisible();
  const link = cabinet.getByRole('link', { name: 'Tide', exact: true });
  const bounds = await link.boundingBox();
  expect(Math.min(bounds!.width, bounds!.height)).toBeGreaterThanOrEqual(44);
  expect(await cabinet.evaluate(el => {
    return document.documentElement.scrollWidth <= innerWidth &&
      [...el.querySelectorAll('article')].every(card => card.scrollWidth <= card.clientWidth + 1);
  })).toBe(true);
});
