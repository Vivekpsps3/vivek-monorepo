import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '../../../tests/e2e/fixtures';
import { addItem, deferred, expectSectionHeading, openItem, resetMedia, savedItem } from './media-test';

test.beforeEach(async ({ request }) => resetMedia(request));

function note(page: Page) {
  return page.getByLabel('Note (optional)', { exact: true });
}

async function theme(page: Page, value: 'light' | 'dark') {
  await page.addInitScript(choice => localStorage.setItem('suite-theme', choice), value);
  await page.emulateMedia({ reducedMotion: 'reduce' });
}

async function activate(page: Page, target: Locator, pointer: 'keyboard' | 'touch') {
  if (pointer === 'touch') {
    await target.tap();
    return;
  }
  await target.focus();
  await page.keyboard.press('Enter');
}

function above(top: { y: number } | null, bottom: { y: number } | null) {
  expect(top).toBeTruthy();
  expect(bottom).toBeTruthy();
  expect(top!.y).toBeLessThan(bottom!.y);
}

async function targetHeight(target: Locator) {
  const box = await target.boundingBox();
  expect(box).toBeTruthy();
  expect(box!.height).toBeGreaterThanOrEqual(44);
}

const faces = [
  [390, 844, 'light', 'keyboard'],
  [390, 844, 'dark', 'touch'],
  [1280, 800, 'light', 'touch'],
  [1280, 800, 'dark', 'keyboard'],
] as const;

for (const [width, height, mode, pointer] of faces) {
  test.describe(`editor order ${width} ${mode} ${pointer}`, () => {
    test.use({ viewport: { width, height }, hasTouch: pointer === 'touch', reducedMotion: 'reduce' });

    test('progress, rating and note lead, and a direct link opens that collection', async ({ page, request }) => {
      test.setTimeout(90_000);
      const film = await addItem(request, { kind: 'movie', title: 'Harbor Film', status: 'want' });
      const book = await addItem(request, { kind: 'book', title: 'Harbor Book', status: 'want' });
      const game = await addItem(request, { kind: 'game', title: 'Harbor Game', status: 'want' });
      const artist = await addItem(request, { kind: 'artist', title: 'Harbor Artist', status: 'following' });
      const created = await (await request.post(`/media/api/entries/${artist.id}/albums`, {
        data: { title: 'Harbor Pressing' },
      })).json();
      const album = created.music.saved_children.find((child: { kind: string }) => child.kind === 'album');
      const sung = await (await request.post(`/media/api/entries/${artist.id}/albums/${album.id}/tracks`, {
        data: { title: 'Harbor Single' },
      })).json();
      const song = sung.music.saved_children.find((child: { title: string }) => child.title === 'Harbor Single');
      await theme(page, mode);

      await page.goto('/media/item/' + film.id);
      await expect(page.locator('html')).toHaveAttribute('data-theme', mode);
      await expect(page.getByRole('heading', { name: 'Harbor Film', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Your movie', exact: true })).toBeVisible();
      const progress = page.getByLabel('Progress', { exact: true });
      const rating = page.getByRole('radiogroup', { name: 'Rating', exact: true });
      const save = page.getByRole('button', { name: 'Save changes', exact: true });
      const state = page.getByRole('combobox', { name: 'State', exact: true });
      above(await progress.boundingBox(), await rating.boundingBox());
      above(await rating.boundingBox(), await note(page).boundingBox());
      above(await note(page).boundingBox(), await save.boundingBox());
      above(await save.boundingBox(), await state.boundingBox());
      await expect(page.getByLabel('Watched on', { exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Catalog details', exact: true })).toHaveCount(0);
      await targetHeight(note(page));
      await targetHeight(save);
      const scan = await new AxeBuilder({ page }).include('main').analyze();
      expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
      const filmBack = page.getByRole('link', { name: '← Library' });
      await targetHeight(filmBack);
      await expect(filmBack).toHaveAttribute('href', /\/media\/library\?kind=movie$/);
      await activate(page, filmBack, pointer);
      await expect(page).toHaveURL(/\/media\/library\?kind=movie$/);
      await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
      await expect(page.getByText(/scroll position/i)).toHaveCount(0);
      await expectSectionHeading(page, 'Movies');

      await page.goto('/media/item/' + book.id);
      await expect(page.getByRole('heading', { name: 'Your book', exact: true })).toBeVisible();
      above(
        await page.getByLabel('Progress', { exact: true }).boundingBox(),
        await page.getByRole('button', { name: 'Save changes', exact: true }).boundingBox(),
      );
      const bookBack = page.getByRole('link', { name: '← Library' });
      await expect(bookBack).toHaveAttribute('href', /\/media\/library\?kind=book$/);
      await activate(page, bookBack, pointer);
      await expect(page).toHaveURL(/\/media\/library\?kind=book$/);
      await expectSectionHeading(page, 'Books');
      await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);

      await page.goto('/media/item/' + song.id);
      await expect(page.getByRole('heading', { name: 'Your song', exact: true })).toBeVisible();
      await expect(page.getByLabel('Progress', { exact: true })).toBeVisible();
      above(
        await note(page).boundingBox(),
        await page.getByRole('button', { name: 'Save changes', exact: true }).boundingBox(),
      );
      const songBack = page.getByRole('link', { name: '← Library' });
      await expect(songBack).toHaveAttribute('href', /\/media\/library\?kind=track$/);
      await activate(page, songBack, pointer);
      await expect(page).toHaveURL(/\/media\/library\?kind=track$/);
      await expectSectionHeading(page, 'Songs');

      await page.goto('/media/item/' + game.id);
      await expect(page.getByRole('heading', { name: 'Your game', exact: true })).toBeVisible();
      above(
        await page.getByLabel('Progress', { exact: true }).boundingBox(),
        await page.getByRole('radiogroup', { name: 'Rating', exact: true }).boundingBox(),
      );

      await page.goto('/media/item/' + artist.id);
      await expect(page.getByRole('heading', { name: 'Your artist', exact: true })).toBeVisible();
      await expect(page.getByLabel('Progress', { exact: true })).toHaveCount(0);
      const artistSave = page.getByRole('button', { name: 'Save changes', exact: true });
      above(await page.getByRole('radiogroup', { name: 'Rating', exact: true }).boundingBox(), await note(page).boundingBox());
      above(await note(page).boundingBox(), await artistSave.boundingBox());
      above(
        await artistSave.boundingBox(),
        await page.getByRole('combobox', { name: 'Relationship', exact: true }).boundingBox(),
      );
      const photo = page.getByRole('button', { name: 'Choose photo', exact: true });
      await expect(photo).toBeVisible();
      above(await artistSave.boundingBox(), await photo.boundingBox());
      await expect(page.getByRole('heading', { name: 'Catalog details', exact: true })).toBeVisible();
    });
  });
}

for (const [width, height, mode, pointer] of [
  [390, 844, 'light', 'keyboard'],
  [1280, 800, 'dark', 'touch'],
] as const) {
  test.describe(`note race ${width} ${mode}`, () => {
    test.use({ viewport: { width, height }, hasTouch: pointer === 'touch', reducedMotion: 'reduce' });

    test('a note typed during a progress save survives Undo on the reverted version', async ({ page, request }) => {
      test.setTimeout(60_000);
      const book = await addItem(request, { kind: 'book', title: 'Race Notebook', status: 'in_progress' });
      await theme(page, mode);
      await openItem(page, book.id, 'Race Notebook');
      const patches: Record<string, unknown>[] = [];
      const entered = deferred();
      const release = deferred();
      await page.route('**/media/api/entries/' + book.id, async route => {
        if (route.request().method() !== 'PATCH') return route.continue();
        const body = route.request().postDataJSON() as Record<string, unknown>;
        patches.push(body);
        const response = await route.fetch();
        if (patches.length === 1) {
          entered.resolve();
          await release.promise;
        }
        await route.fulfill({ response });
      });
      const progress = page.getByLabel('Progress', { exact: true });
      await progress.fill('12');
      await page.getByRole('button', { name: 'Save changes', exact: true }).click();
      await entered.promise;
      await expect(page.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled();
      const undo = page.getByRole('button', { name: 'Undo', exact: true });
      await expect(undo).toBeEnabled();
      await targetHeight(undo);
      await note(page).fill('Newer harbor note');
      if (pointer === 'keyboard') {
        await note(page).focus();
        await page.keyboard.press('Tab');
        await expect(undo).toBeFocused();
        await page.keyboard.press('Enter');
      } else {
        await undo.tap();
      }
      await expect(note(page)).toBeFocused();
      await expect(note(page)).toHaveValue('Newer harbor note');
      await expect(progress).toHaveValue('');
      await expect(page.getByText('Undone. Your newer note stays on this version.', { exact: true })).toBeVisible();
      release.resolve();
      await expect.poll(() => patches.length).toBe(2);
      await expect(note(page)).toHaveValue('Newer harbor note');
      await expect(progress).toHaveValue('');
      expect(patches[0].progress_value).toBe(12);
      expect(patches[0].review).toBeUndefined();
      expect(patches[1].progress_value).toBeNull();
      expect(patches[1].review).toBeUndefined();
      const saved = await savedItem(request, book.id);
      expect(saved.review).toBeNull();
      expect(saved.progress_value).toBeNull();
      const draft = JSON.parse(await page.evaluate(id => sessionStorage.getItem('media-item-draft:1:' + id) || 'null', book.id));
      expect(draft.fields.review).toBe('Newer harbor note');
      expect(draft.fields.progress).toBeNull();
      expect(draft.base).toBe(saved.updated_at);
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Race Notebook', exact: true })).toBeVisible();
      await expect(note(page)).toHaveValue('Newer harbor note');
      await expect(page.getByLabel('Progress', { exact: true })).toHaveValue('');
      await expect(page.getByRole('button', { name: 'Restore earlier draft', exact: true })).toHaveCount(0);
      expect((await savedItem(request, book.id)).review).toBeNull();
    });
  });
}

test('a failed progress save keeps the note and sign-out clears the draft', async ({ page, request }) => {
  test.setTimeout(60_000);
  const film = await addItem(request, { kind: 'movie', title: 'Failed Reel', status: 'want' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openItem(page, film.id, 'Failed Reel');
  await page.route('**/media/api/entries/' + film.id, route => {
    if (route.request().method() === 'PATCH') {
      return route.fulfill({ status: 502, json: { detail: 'Bad gateway' } });
    }
    return route.continue();
  });
  await page.getByLabel('Progress', { exact: true }).fill('4');
  await note(page).fill('Kept after the failed save');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Bad gateway' })).toBeVisible();
  await expect(note(page)).toHaveValue('Kept after the failed save');
  await expect(page.getByLabel('Progress', { exact: true })).toHaveValue('4');
  expect((await savedItem(request, film.id)).progress_value).toBeNull();
  expect((await savedItem(request, film.id)).review).toBeNull();
  expect(await page.evaluate(() => Object.keys(sessionStorage).some(key => key.startsWith('media-item-draft:')))).toBe(true);
  const ended = await page.request.post('/api/auth/logout', {
    headers: { 'X-CSRF-Token': 'synthetic-csrf', Origin: new URL(page.url()).origin },
  });
  expect(ended.ok(), await ended.text()).toBeTruthy();
  await page.unroute('**/media/api/entries/' + film.id);
  await page.route('**/media/api/entries/' + film.id, route =>
    route.fulfill({ status: 401, json: { detail: 'Session expired' } }),
  );
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/login/);
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('media-item-draft:')))).toEqual([]);
});

for (const [width, height, mode, pointer] of [
  [390, 844, 'dark', 'touch'],
  [1280, 800, 'light', 'keyboard'],
] as const) {
  test.describe(`collection return ${width}`, () => {
    test.use({ viewport: { width, height }, hasTouch: pointer === 'touch', reducedMotion: 'reduce' });

    test('Back restores the movie filter, page and scroll', async ({ page, request }) => {
      test.setTimeout(90_000);
      for (let index = 0; index < 48; index += 1) {
        await addItem(request, {
          kind: 'movie',
          status: 'want',
          title: `Filter Film ${String(index).padStart(2, '0')}`,
        });
      }
      await theme(page, mode);
      await page.goto('/media/library?kind=movie&status=want&sort=title');
      await expect(page.locator('html')).toHaveAttribute('data-theme', mode);
      await page.getByRole('button', { name: 'Next items' }).click();
      await expect(page).toHaveURL(/offset=24/);
      const link = page.getByRole('link', { name: 'Filter Film 47', exact: true });
      await link.evaluate(node => node.scrollIntoView({ block: 'center', inline: 'nearest' }));
      const start = await page.evaluate(() => ({ path: location.pathname + location.search, top: scrollY }));
      expect(start.path).toContain('kind=movie');
      expect(start.path).toContain('status=want');
      expect(start.path).toContain('offset=24');
      expect(start.top).toBeGreaterThan(80);
      await targetHeight(link);
      await activate(page, link, pointer);
      await expect(page.getByRole('heading', { name: 'Filter Film 47', exact: true })).toBeVisible();
      await expect(page.getByLabel('Progress', { exact: true })).toBeVisible();
      const back = page.getByRole('link', { name: '← Library' });
      await activate(page, back, pointer);
      await expect(page).toHaveURL(url => url.pathname + url.search === start.path);
      await expect(link).toBeFocused();
      await expect.poll(async () => Math.abs((await page.evaluate(() => scrollY)) - start.top)).toBeLessThan(10);
      await expect(page.getByText(/scroll position/i)).toHaveCount(0);
    });
  });
}

test('Back from an expanded artist restores that group, page and scroll', async ({ page, request }) => {
  test.setTimeout(120_000);
  let artistId = 0;
  for (let index = 0; index < 48; index += 1) {
    const artist = await addItem(request, {
      kind: 'artist',
      status: 'following',
      title: `Cedar Artist ${String(index).padStart(2, '0')}`,
    });
    if (index === 30) artistId = artist.id;
  }
  expect((await request.post(`/media/api/entries/${artistId}/albums`, { data: { title: 'Cedar Pressing' } })).ok()).toBeTruthy();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/media/library?kind=artist&sort=title');
  await page.getByRole('button', { name: 'Next items' }).click();
  await expect(page).toHaveURL(/offset=24/);
  const section = page.locator('section').filter({ has: page.getByRole('link', { name: 'Cedar Artist 30', exact: true }) });
  await section.getByRole('button', { name: /Show saved albums and songs/ }).click();
  const link = section.getByRole('link', { name: 'Cedar Artist 30', exact: true });
  await link.evaluate(node => node.scrollIntoView({ block: 'center', inline: 'nearest' }));
  const start = await page.evaluate(() => ({ path: location.pathname + location.search, top: scrollY }));
  expect(start.path).toContain('offset=24');
  expect(start.path).toContain('group=');
  expect(start.top).toBeGreaterThan(80);
  await link.press('Enter');
  await expect(page.getByRole('heading', { name: 'Cedar Artist 30', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your artist', exact: true })).toBeVisible();
  await expect(page.getByLabel('Progress', { exact: true })).toHaveCount(0);
  const back = page.getByRole('link', { name: '← Library' });
  await back.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(url => url.pathname + url.search === start.path);
  await expect(section.getByRole('button', { name: /Hide saved albums/ })).toHaveAttribute('aria-expanded', 'true');
  await expect(link).toBeFocused();
  await expect.poll(async () => Math.abs((await page.evaluate(() => scrollY)) - start.top)).toBeLessThan(10);
});
