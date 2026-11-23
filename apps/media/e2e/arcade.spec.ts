import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Locator, type Page } from '../../../tests/e2e/fixtures';
import {
  addItem,
  expectCleanMediaPage,
  expectSectionHeading,
  resetMedia,
  savedItem,
  watchMediaConsole,
} from './media-test';

test.beforeEach(async ({ request }) => resetMedia(request));
test.use({ reducedMotion: 'reduce' });

async function seedArcade(request: APIRequestContext) {
  const paper = await addItem(request, { kind: 'game', title: 'Paper Cartridge', status: 'want' });
  const playing = await addItem(request, {
    kind: 'game',
    title: 'Lantern Kart',
    status: 'in_progress',
    progress_value: 12,
    progress_unit: 'hour',
  });
  const recorded = await addItem(request, {
    kind: 'game',
    title: 'Untouched Quest',
    status: 'want',
    progress_value: 3,
    progress_unit: 'hour',
  });
  await addItem(request, { kind: 'game', title: 'Quiet Arcade', status: 'completed' });
  await addItem(request, { kind: 'game', title: 'Anticipated Port', status: 'anticipating' });
  return { paper, playing, recorded };
}

function box(page: Page, title: string, status?: string) {
  const articles = status
    ? page.locator(`article[data-game][data-status="${status}"]`)
    : page.locator('article[data-game]');
  return articles.filter({
    has: page.getByRole('link', { name: title, exact: true }),
  });
}

function table(page: Page, id: 'memory' | 'rhythm') {
  return page.locator(`[data-table="${id}"]`);
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
  test.describe(`arcade at ${width} ${theme} ${pointer}`, () => {
    test.use({ viewport: { width, height }, hasTouch: pointer === 'touch' });

    test('opens a tracked game and both play tables', async ({ page, request }, info) => {
      test.setTimeout(90_000);
      const violations: string[] = [];
      const writes: string[] = [];
      watchMediaConsole(page, violations);
      page.on('request', (req) => {
        if (req.method() === 'GET') return;
        const url = req.url();
        if (url.includes('/media/api') || url.includes('/api/town') || url.includes('/api/pixels')) {
          writes.push(`${req.method()} ${url}`);
        }
      });
      await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const seeded = await seedArcade(request);
      await page.goto('/media/library?kind=game&sort=title');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expectSectionHeading(page, 'Games');
      await expect(page.getByRole('heading', { name: 'Play tables', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Memory Shelves', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Harbor Rhythm', exact: true })).toBeVisible();
      await expect(table(page, 'memory')).toHaveAttribute('data-opened', 'false');
      await expect(table(page, 'rhythm')).toHaveAttribute('data-opened', 'false');
      await expect(table(page, 'memory').getByText('Unopened', { exact: true })).toBeVisible();
      await expect(table(page, 'rhythm').getByText('Unopened', { exact: true })).toBeVisible();

      const paper = box(page, 'Paper Cartridge', 'want');
      const playing = box(page, 'Lantern Kart', 'in_progress');
      await expect(paper).toHaveAttribute('data-opened', 'false');
      await expect(paper.getByText('Unopened', { exact: true })).toBeVisible();
      await expect(paper.getByText('Want to play', { exact: true })).toBeVisible();
      await expect(playing).toHaveAttribute('data-opened', 'true');
      await expect(playing).not.toContainText('Unopened');
      await expect(playing.getByText('12 hours recorded', { exact: true })).toBeVisible();
      await expect(box(page, 'Untouched Quest')).toHaveAttribute('data-opened', 'true');
      await expect(box(page, 'Quiet Arcade', 'completed')).toHaveAttribute('data-opened', 'true');
      await expect(box(page, 'Quiet Arcade', 'completed')).not.toContainText('Unopened');
      await expect(box(page, 'Anticipated Port', 'anticipating')).toHaveAttribute('data-opened', 'false');

      const catalog = paper.getByRole('link', { name: 'Paper Cartridge', exact: true });
      await expectTarget(catalog);
      await activate(catalog, pointer);
      await expect(page).toHaveURL(/\/media\/item\//);
      await expect(page.getByRole('heading', { level: 1, name: 'Paper Cartridge', exact: true })).toBeVisible();
      await page.goBack();
      await expect(page).toHaveURL(/kind=game/);
      await expect(paper).toHaveAttribute('data-opened', 'false');

      const memoryButton = page.getByRole('button', { name: 'Play Memory Shelves', exact: true });
      await expectTarget(memoryButton);
      await activate(memoryButton, pointer);
      const memoryHeading = page.locator('#gameplay-heading-memory');
      await expect(memoryHeading).toBeFocused();
      await expect(page.getByText('Turn two shelves. This play is not saved.', { exact: true })).toBeVisible();
      const shelf = page.getByRole('button', { name: 'Shelf 1, face down', exact: true });
      await expectTarget(shelf);
      await activate(shelf, pointer);
      await expect(page.getByRole('button', { name: /^Shelf 1, / })).not.toHaveAttribute('aria-label', 'Shelf 1, face down');
      await activate(page.getByRole('button', { name: 'Restart Memory Shelves', exact: true }), pointer);
      await expect(page.getByRole('button', { name: 'Shelf 1, face down', exact: true })).toBeVisible();
      if (pointer === 'keyboard') await page.keyboard.press('Escape');
      else await activate(page.getByRole('button', { name: 'Close Memory Shelves', exact: true }), pointer);
      await expect(memoryButton).toBeFocused();
      await expect(table(page, 'memory')).toHaveAttribute('data-opened', 'true');
      await expect(table(page, 'memory').getByText('Started', { exact: true })).toBeVisible();
      await expect(table(page, 'rhythm')).toHaveAttribute('data-opened', 'false');

      const rhythmButton = page.getByRole('button', { name: 'Play Harbor Rhythm', exact: true });
      await expectTarget(rhythmButton);
      await activate(rhythmButton, pointer);
      await expect(page.locator('#gameplay-heading-rhythm')).toBeFocused();
      await expect(page.getByText('Play Lane 1. This play is not saved.', { exact: true })).toBeVisible();
      const wrong = page.getByRole('button', { name: /Lane 2/ });
      const right = page.getByRole('button', { name: /Lane 1/ });
      await expectTarget(right);
      await activate(wrong, pointer);
      await expect(page.getByText('That lane is not the next one.', { exact: false })).toBeVisible();
      await expect(page.getByText('Play Lane 1. This play is not saved.', { exact: true })).toBeVisible();
      await activate(right, pointer);
      await expect(page.getByText('Play Lane 3. This play is not saved.', { exact: true })).toBeVisible();
      await activate(page.getByRole('button', { name: 'Close Harbor Rhythm', exact: true }), pointer);
      await expect(rhythmButton).toBeFocused();
      await expect(page.locator('audio, video, iframe')).toHaveCount(0);
      await expect.poll(() => page.locator('media-arcade-tables').evaluate((node) => node.getAnimations({ subtree: true }).length)).toBe(0);

      expect((await savedItem(request, seeded.paper.id)).status).toBe('want');
      expect((await savedItem(request, seeded.paper.id)).progress_value ?? null).toBeNull();
      expect((await savedItem(request, seeded.playing.id)).progress_value).toBe(12);
      expect((await savedItem(request, seeded.recorded.id)).progress_value).toBe(3);
      expect(writes).toEqual([]);

      const scan = await new AxeBuilder({ page }).include('main').analyze();
      expect(scan.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
      await expectCleanMediaPage(page, violations);
      const shot = info.outputPath(`arcade-${width}-${theme}-${pointer}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      await info.attach(`arcade-${width}-${theme}-${pointer}`, { path: shot, contentType: 'image/png' });
    });
  });
}

test('an empty collection and a locked read still leave the play tables usable', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const seeded = await request.get('/media/api/library?kind=game&limit=24');
  expect(seeded.ok()).toBeTruthy();
  for (const item of (await seeded.json()).items as { id: number }[]) {
    expect((await request.delete(`/media/api/entries/${item.id}`)).ok()).toBeTruthy();
  }
  await page.goto('/media/library?kind=game');
  await expect(page.getByText('No games saved yet', { exact: true })).toBeVisible();
  await expect(page.locator('media-game-cabinet')).toHaveCount(0);
  await expect(table(page, 'memory')).toHaveAttribute('data-opened', 'false');
  await expect(table(page, 'rhythm')).toHaveAttribute('data-opened', 'false');
  const writes: string[] = [];
  page.on('request', (req) => {
    if (req.method() !== 'GET' && req.url().includes('/media/api')) writes.push(req.method());
  });
  await page.getByRole('button', { name: 'Play Harbor Rhythm', exact: true }).click();
  await page.getByRole('button', { name: /Lane 2/ }).click();
  await expect(page.getByText('Misses this session: 1.', { exact: false })).toBeVisible();
  const after = await (await request.get('/media/api/library?kind=game')).json();
  expect(after.total).toBe(0);
  expect(writes).toEqual([]);

  await page.route('**/media/api/library**', (route) =>
    route.fulfill({ status: 503, json: { message: 'Library locked' } }),
  );
  await page.goto('/media/library?kind=game');
  await expect(page.locator('.local-error')).toContainText('Library locked');
  await expect(page.locator('media-game-cabinet')).toHaveCount(0);
  await page.getByRole('button', { name: 'Play Memory Shelves', exact: true }).click();
  await page.getByRole('button', { name: 'Shelf 1, face down', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Shelf 1, / })).not.toHaveAttribute('aria-label', 'Shelf 1, face down');
  const openLabel = await page.getByRole('button', { name: /^Shelf 1, / }).getAttribute('aria-label');
  await page.unroute('**/media/api/library**');
  await page.getByRole('button', { name: 'Retry library' }).click();
  await expect(page.getByText('No games saved yet', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: openLabel || '', exact: true })).toBeVisible();
  expect((await (await request.get('/media/api/library?kind=game')).json()).total).toBe(0);
});

test('a held library read does not replace play, and sign-out clears it', async ({ page, request }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  const paper = await addItem(request, { kind: 'game', title: 'Paper Cartridge', status: 'want' });
  const playing = await addItem(request, {
    kind: 'game',
    title: 'Lantern Kart',
    status: 'in_progress',
    progress_value: 12,
    progress_unit: 'hour',
  });
  await page.goto('/media/library?kind=game&sort=title');
  await page.getByRole('button', { name: 'Play Memory Shelves', exact: true }).click();
  await page.getByRole('button', { name: 'Shelf 1, face down', exact: true }).click();
  const openLabel = await page.getByRole('button', { name: /^Shelf 1, / }).getAttribute('aria-label');
  expect(openLabel).not.toBe('Shelf 1, face down');
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let held = false;
  await page.route('**/media/api/library**', async (route) => {
    const url = route.request().url();
    if (!held && url.includes('kind=game') && url.includes('status=in_progress')) {
      held = true;
      await gate;
      try {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [{
              id: 999,
              kind: 'game',
              title: 'Late Cabinet',
              status: 'want',
              unopened: true,
              progress_value: null,
              rating: null,
              favorite: false,
              artwork_url: null,
              creator: null,
              year: null,
            }],
            total: 1,
            offset: 0,
            limit: 24,
            has_more: false,
          }),
        });
      } catch {
        /* The read was cancelled by leaving the collection. */
      }
      return;
    }
    await route.continue();
  });
  await page.getByRole('link', { name: 'Playing', exact: true }).click();
  await expect.poll(() => held).toBe(true);
  await expect(page.getByRole('button', { name: openLabel || '', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Movies', exact: true }).click();
  release();
  await expect(page).toHaveURL(/kind=movie/);
  await expect(page.locator('media-arcade-tables')).toHaveCount(0);
  await expect(page.getByText('Late Cabinet', { exact: true })).toHaveCount(0);
  await page.unroute('**/media/api/library**');
  await page.goto('/media/library?kind=game&sort=title');
  await expect(page.getByRole('button', { name: openLabel || '', exact: true })).toBeVisible();
  await expect(page.getByText('Late Cabinet', { exact: true })).toHaveCount(0);
  expect((await savedItem(request, paper.id)).status).toBe('want');
  expect((await savedItem(request, playing.id)).progress_value).toBe(12);
  const listed = await (await request.get('/media/api/library?kind=game')).json();
  expect(listed.items.map((item: { title: string }) => item.title)).not.toContain('Late Cabinet');
  await page.getByRole('banner').getByRole('button', { name: 'synthetic', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/login/);
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.startsWith('media-arcade-play:')))).toEqual([]);
});
