import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page } from '../../../tests/e2e/fixtures';
import { addItem, resetMedia } from './media-test';

test.use({ reducedMotion: 'reduce' });
test.beforeEach(async ({ request }) => resetMedia(request));

async function postLibrary(request: APIRequestContext, data: Record<string, unknown>) {
  const response = await request.post('/media/api/library', { data });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

function watchProviders(page: Page) {
  const calls: string[] = [];
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('/discography') || url.includes('musicbrainz.org')) calls.push(url);
  });
  return calls;
}

async function seedShapes(request: APIRequestContext) {
  const artist = await addItem(request, { kind: 'artist', title: 'Fixture Voice', status: 'following' });
  expect((await request.post(`/media/api/entries/${artist.id}/albums`, { data: { title: 'Fixture Pressing' } })).ok()).toBeTruthy();
  await postLibrary(request, {
    kind: 'album',
    title: 'Only Pressing',
    artist_identity: { source: 'manual', source_id: 'person-only', name: 'Only Voice' },
  });
  await postLibrary(request, {
    kind: 'track',
    title: 'Loose Single',
    rating: 3,
    artist_identity: { source: 'manual', source_id: 'person-only', name: 'Only Voice' },
  });
  await postLibrary(request, {
    kind: 'album',
    title: 'Other Pressing',
    artist_identity: { source: 'manual', source_id: 'person-only-other', name: 'Only Voice' },
  });
  await addItem(request, { kind: 'artist', title: 'Silent Voice', status: 'following' });
}

async function openMusic(page: Page) {
  await page.goto('/media/library');
  await page.getByRole('navigation', { name: 'Media sections' }).getByRole('link', { name: 'Music', exact: true }).click();
  await expect(page).toHaveURL(/kind=artist/);
  await expect(page.getByRole('link', { name: 'Artists', exact: true })).toHaveAttribute('aria-current', 'page');
}

for (const [width, height, theme, pointer] of [
  [390, 844, 'dark', 'touch'],
  [1280, 800, 'light', 'keyboard'],
] as const) {
  test.describe(`music views at ${width} ${theme}`, () => {
    test.use({ viewport: { width, height }, hasTouch: pointer === 'touch' });

    test('one album is one artist group', async ({ page, request }, info) => {
      await seedShapes(request);
      await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
      const providers = watchProviders(page);
      const reads: string[] = [];
      page.on('request', (req) => {
        if (req.method() === 'GET' && req.url().includes('/media/api/')) reads.push(new URL(req.url()).pathname);
      });
      await openMusic(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.getByText('Music. Artists you have saved', { exact: false })).toBeVisible();
      await expect(page.getByText('4 artists', { exact: true })).toBeVisible();
      const fixture = page.locator('.artist-group', { has: page.getByRole('link', { name: 'Fixture Voice', exact: true }) });
      await fixture.getByRole('button', { name: 'Show saved albums and songs (1)' }).click();
      await expect(page).toHaveURL(/group=/);
      const fixtureAlbum = fixture.getByRole('link', { name: 'Fixture Pressing', exact: true });
      await expect(fixtureAlbum).toHaveCount(1);
      await expect(page.getByRole('link', { name: 'Fixture Pressing', exact: true })).toHaveCount(1);
      await expect(fixture.getByText('No saved songs on this album.')).toBeVisible();
      expect(Math.min((await fixtureAlbum.boundingBox())!.height, (await fixtureAlbum.boundingBox())!.width)).toBeGreaterThanOrEqual(44);
      const artists = page.getByRole('link', { name: 'Artists', exact: true });
      expect(Math.min((await artists.boundingBox())!.height, (await artists.boundingBox())!.width)).toBeGreaterThanOrEqual(44);
      const kept = page.url();
      await page.reload();
      await expect(page).toHaveURL(kept);
      await expect(fixture.getByRole('button', { name: /Hide saved albums/ })).toHaveAttribute('aria-expanded', 'true');
      await page.getByRole('link', { name: 'Songs', exact: true }).click();
      await expect(page).toHaveURL(/kind=track/);
      await expect(page).not.toHaveURL(/group=/);
      await expect(page.getByRole('link', { name: 'Loose Single', exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Fixture Pressing', exact: true })).toHaveCount(0);
      await page.goBack();
      await expect(page).toHaveURL(kept);
      await expect(page.getByRole('link', { name: 'Fixture Pressing', exact: true })).toHaveCount(1);
      const strangers = page.locator('.artist-group', { has: page.getByRole('heading', { name: 'Only Voice', exact: true }) });
      await expect(strangers).toHaveCount(2);
      await expect(page.getByRole('link', { name: 'Only Voice', exact: true })).toHaveCount(0);
      const seen = new Set<string>();
      let looseSeen = false;
      for (const index of [0, 1]) {
        const group = strangers.nth(index);
        await group.getByRole('button', { name: /Show saved albums and songs/ }).click();
        const panel = group.locator('.saved-children');
        await expect(panel).toBeVisible();
        await expect(page.locator('.saved-children')).toHaveCount(1);
        const titles = (await panel.getByRole('link').allInnerTexts()).map((title) => title.trim());
        for (const title of titles) seen.add(title);
        await expect(panel.getByText('No saved songs on this album.')).toBeVisible();
        if (titles.includes('Loose Single')) {
          looseSeen = true;
          await expect(panel.getByRole('heading', { name: 'Saved without an album' })).toBeVisible();
          await expect(panel.getByRole('link', { name: 'Only Pressing', exact: true })).toHaveCount(1);
          await expect(panel.getByRole('link', { name: 'Loose Single', exact: true })).toHaveCount(1);
          await expect(panel.getByRole('link', { name: 'Other Pressing', exact: true })).toHaveCount(0);
        }
        if (titles.includes('Other Pressing')) {
          await expect(panel.getByRole('link', { name: 'Other Pressing', exact: true })).toHaveCount(1);
          await expect(panel.getByRole('link', { name: 'Loose Single', exact: true })).toHaveCount(0);
          await expect(panel.getByRole('heading', { name: 'Saved without an album' })).toHaveCount(0);
        }
      }
      expect(looseSeen).toBe(true);
      expect([...seen].sort()).toEqual(['Loose Single', 'Only Pressing', 'Other Pressing']);
      const silent = page.locator('.artist-group', { has: page.getByRole('link', { name: 'Silent Voice', exact: true }) });
      await silent.getByRole('button', { name: 'Show saved albums and songs (0)' }).click();
      await expect(silent).toContainText('No saved albums or songs for this artist.');
      await expect(page.getByRole('link', { name: 'Browse discography' })).toHaveCount(0);
      await page.getByRole('link', { name: 'Albums', exact: true }).click();
      await expect(page.locator('.media-grid > section > media-card')).toHaveCount(3);
      await expect(page.locator('.saved-children')).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Show Fixture Voice (1)' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Show Only Voice, not followed (2)' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Show Only Voice, not followed (1)' })).toBeVisible();
      expect(reads.some((path) => path.endsWith('/music-groups'))).toBe(true);
      expect(reads.filter((path) => path.endsWith('/library')).length).toBeGreaterThan(0);
      expect(providers).toEqual([]);
      const scan = await new AxeBuilder({ page }).include('main').analyze();
      expect(scan.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
      const screenshot = info.outputPath(`one-album-${width}-${theme}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      await info.attach(`one-album-${width}-${theme}`, { path: screenshot, contentType: 'image/png' });
    });

    test('artist album and song return keeps ratings, group and scroll', async ({ page, request }, info) => {
      test.setTimeout(90_000);
      for (let index = 0; index < 44; index += 1) {
        await addItem(request, {
          kind: 'artist',
          status: 'following',
          title: `Cedar Artist ${String(index).padStart(2, '0')}`,
        });
      }
      const artist = await addItem(request, { kind: 'artist', status: 'following', title: 'Cedar Artist Return' });
      const created = await (await request.post(`/media/api/entries/${artist.id}/albums`, {
        data: { title: 'Cedar Pressing', year: 2004 },
      })).json();
      const album = created.music.saved_children.find((child: { kind: string }) => child.kind === 'album');
      expect(album, 'saved album').toBeTruthy();
      const sung = await (await request.post(`/media/api/entries/${artist.id}/albums/${album.id}/tracks`, {
        data: { title: 'Cedar Single' },
      })).json();
      const song = sung.music.saved_children.find((child: { title: string }) => child.title === 'Cedar Single');
      expect(song, 'saved song').toBeTruthy();
      expect((await request.patch(`/media/api/entries/${album.id}`, { data: { rating: 8 } })).ok()).toBeTruthy();
      expect((await request.patch(`/media/api/entries/${song.id}`, { data: { rating: 3 } })).ok()).toBeTruthy();
      await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
      const providers = watchProviders(page);
      await page.goto('/media/library?kind=artist&status=following&sort=title');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.getByRole('link', { name: 'Cedar Artist 00', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Next items' }).click();
      await expect(page).toHaveURL(/offset=24/);
      const section = page.locator('.artist-group', { has: page.getByRole('link', { name: 'Cedar Artist Return', exact: true }) });
      await expect(section.locator('p.muted').first()).toHaveText('Following');
      await section.getByRole('button', { name: 'Show saved albums and songs (2)' }).click();
      const albumLink = section.getByRole('link', { name: 'Cedar Pressing', exact: true });
      const songLink = section.getByRole('link', { name: 'Cedar Single', exact: true });
      await expect(section.locator('.saved-album media-card').first()).toContainText('8 / 10');
      await expect(section.locator('.saved-songs')).toContainText('3 / 10');
      await expect(section.getByText('Saved without an album')).toHaveCount(0);
      await albumLink.scrollIntoViewIfNeeded();
      const start = await page.evaluate(() => ({ path: location.pathname + location.search, top: scrollY }));
      expect(start.top).toBeGreaterThan(150);
      expect(start.path).toContain('group=');
      expect(Math.min((await albumLink.boundingBox())!.height, (await albumLink.boundingBox())!.width)).toBeGreaterThanOrEqual(44);
      if (pointer === 'touch') await albumLink.tap();
      else await albumLink.press('Enter');
      await expect(page.locator('main h1')).toHaveText('Cedar Pressing');
      await expect(page.getByRole('radio', { name: '8 out of 10' })).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByRole('radio', { name: '3 out of 10' })).toHaveAttribute('aria-checked', 'false');
      await expect(page.locator('media-card', { hasText: 'Cedar Single' })).toContainText('3 / 10');
      const songCard = page.getByRole('link', { name: 'Cedar Single', exact: true });
      if (pointer === 'touch') await songCard.tap();
      else await songCard.press('Enter');
      await expect(page.locator('main h1')).toHaveText('Cedar Single');
      await expect(page).toHaveURL(new RegExp(`/media/item/${song.id}`));
      await expect(page.getByRole('radio', { name: '3 out of 10' })).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByRole('radio', { name: '8 out of 10' })).toHaveAttribute('aria-checked', 'false');
      const back = page.getByRole('link', { name: '← Library' });
      expect(Math.min((await back.boundingBox())!.height, (await back.boundingBox())!.width)).toBeGreaterThanOrEqual(44);
      if (pointer === 'touch') await back.tap();
      else {
        await back.focus();
        await page.keyboard.press('Enter');
      }
      await expect(page.locator('main h1')).toHaveText('Cedar Pressing');
      await expect(page).toHaveURL(new RegExp(`/media/item/${album.id}`));
      await expect(page.getByRole('radio', { name: '8 out of 10' })).toHaveAttribute('aria-checked', 'true');
      await expect(page.locator('media-card', { hasText: 'Cedar Single' })).toContainText('3 / 10');
      const libraryBack = page.getByRole('link', { name: '← Library' });
      if (pointer === 'touch') await libraryBack.tap();
      else {
        await libraryBack.focus();
        await page.keyboard.press('Enter');
      }
      await expect(page).toHaveURL((url) => url.pathname + url.search === start.path);
      await expect(section.getByRole('button', { name: /Hide saved albums/ })).toHaveAttribute('aria-expanded', 'true');
      await expect(albumLink).toBeFocused();
      await expect.poll(async () => Math.abs((await page.evaluate(() => scrollY)) - start.top)).toBeLessThan(10);
      await expect(section.locator('.saved-album media-card').first()).toContainText('8 / 10');
      await expect(section.locator('.saved-songs')).toContainText('3 / 10');
      await expect(section.locator('p.muted').first()).toHaveText('Following');
      const savedArtist = await (await request.get(`/media/api/entries/${artist.id}`)).json();
      const savedAlbum = await (await request.get(`/media/api/entries/${album.id}`)).json();
      const savedSong = await (await request.get(`/media/api/entries/${song.id}`)).json();
      expect(savedArtist.rating).toBeNull();
      expect(savedAlbum.rating).toBe(8);
      expect(savedSong.rating).toBe(3);
      expect(providers).toEqual([]);
      await page.reload();
      await expect(page).toHaveURL((url) => url.pathname + url.search === start.path);
      await expect(section.getByRole('button', { name: /Hide saved albums/ })).toHaveAttribute('aria-expanded', 'true');
      const scan = await new AxeBuilder({ page }).include('main').analyze();
      expect(scan.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
      const screenshot = info.outputPath(`return-${width}-${theme}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      await info.attach(`return-${width}-${theme}`, { path: screenshot, contentType: 'image/png' });
    });

    test('a failed artist read keeps the search and the saved rows', async ({ page, request }) => {
      await postLibrary(request, {
        kind: 'album',
        title: 'North Pressing',
        artist_identity: { source: 'manual', source_id: 'person-north-voice', name: 'North Voice' },
      });
      await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
      await page.goto('/media/library?kind=artist');
      await page.locator('#library-q').fill('North');
      await expect(page).toHaveURL(/q=North/);
      await expect(page.getByRole('heading', { name: 'North Voice', exact: true })).toBeVisible();
      const before = await (await request.get('/media/api/music-groups?sort=title')).json();
      await page.route('**/media/api/music-groups**', (route) => {
        const path = new URL(route.request().url()).pathname;
        if (/\/music-groups\/\d+/.test(path)) return route.continue();
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Group offline' }),
        });
      });
      await page.locator('#library-q').fill('North Pressing');
      await expect(page.locator('.local-error')).toContainText('Group offline');
      await expect(page.locator('#library-q')).toHaveValue('North Pressing');
      await expect(page.getByRole('heading', { name: 'North Voice', exact: true })).toHaveCount(0);
      const after = await (await request.get('/media/api/music-groups?sort=title')).json();
      expect(after).toEqual(before);
      await page.unroute('**/media/api/music-groups**');
      const retry = page.getByRole('button', { name: 'Retry library' });
      if (pointer === 'touch') await retry.tap();
      else await retry.press('Enter');
      await expect(page.locator('#library-heading')).toBeFocused();
      await expect(page.locator('#library-q')).toHaveValue('North Pressing');
      await expect(page.getByRole('heading', { name: 'North Voice', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Retry library' })).toHaveCount(0);
    });
  });
}

test('a missing off-page group does not remove the artists already shown', async ({ page, request }) => {
  await postLibrary(request, {
    kind: 'album',
    title: 'North Pressing',
    artist_identity: { source: 'manual', source_id: 'person-north-voice', name: 'North Voice' },
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/media/library?kind=artist&q=North&group=999999');
  await expect(page.getByRole('heading', { name: 'North Voice', exact: true })).toBeVisible();
  const groupAlert = page.locator('.media-grid [role="alert"]');
  await expect(groupAlert).toHaveText('That item is not in your library.');
  await expect(page.locator('#library-q')).toHaveValue('North');
  await page.getByRole('button', { name: 'Retry saved music' }).click();
  await expect(groupAlert).toHaveText('That item is not in your library.');
  await expect(page.getByRole('heading', { name: 'North Voice', exact: true })).toBeVisible();
  await expect(page.locator('#library-q')).toHaveValue('North');
});
