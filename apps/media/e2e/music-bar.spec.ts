import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page } from '../../../tests/e2e/fixtures';
import { resetMedia } from './media-test';

test.use({ reducedMotion: 'reduce' });
test.beforeEach(async ({ request }) => resetMedia(request));

const IDENTITY = {
  source: 'manual',
  source_id: 'person-lantern-voice',
  name: 'Lantern Voice',
};

async function saveAlbum(request: APIRequestContext) {
  const response = await request.post('/media/api/library', {
    data: {
      kind: 'album',
      title: 'Lantern Pressing',
      rating: 6,
      artwork_url: 'https://example.com/lantern-cover.png',
      artist_identity: IDENTITY,
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

async function installOpenStub(page: Page) {
  await page.addInitScript(() => {
    const target = window as Window & { __opened?: string[] };
    target.__opened = [];
    window.open = (url?: string | URL) => {
      target.__opened?.push(String(url));
      return null;
    };
  });
}

async function opened(page: Page) {
  return page.evaluate(() => (window as Window & { __opened?: string[] }).__opened ?? []);
}

async function openWall(page: Page) {
  await page.goto('/media/library?kind=artist&sort=title');
  await expect(page.getByRole('heading', { name: 'Artist wall', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Song stage', exact: true })).toBeVisible();
  const wall = await page.getByRole('heading', { name: 'Artist wall', exact: true }).boundingBox();
  const stage = await page.getByRole('heading', { name: 'Song stage', exact: true }).boundingBox();
  expect(wall!.y).toBeLessThan(stage!.y);
}

function press(page: Page, pointer: 'touch' | 'keyboard', locator: ReturnType<Page['getByRole']>) {
  return pointer === 'touch' ? locator.tap() : locator.press('Enter');
}

for (const [width, height, theme, pointer] of [
  [390, 844, 'light', 'keyboard'],
  [390, 844, 'dark', 'touch'],
  [1280, 800, 'light', 'touch'],
  [1280, 800, 'dark', 'keyboard'],
] as const) {
  test.describe(`music bar at ${width} ${theme} ${pointer}`, () => {
    test.use({ viewport: { width, height }, hasTouch: pointer === 'touch' });

  test(`album first is one wall group`, async ({ page, request }, info) => {
    test.setTimeout(90_000);
    const album = await saveAlbum(request);
    await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
    await installOpenStub(page);
    const providers: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('/discography') || url.includes('musicbrainz.org')) {
        providers.push(url);
      }
    });
    await openWall(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.getByText('Music. Artists you have saved', { exact: false })).toBeVisible();
    const group = page.locator('.artist-group');
    await expect(group).toHaveCount(1);
    await expect(group.getByRole('heading', { name: 'Lantern Voice', exact: true })).toBeVisible();
    await expect(group.locator('p.muted').first()).toHaveText('Not followed');
    await expect(group.getByRole('link', { name: 'Lantern Voice', exact: true })).toHaveCount(0);
    const portrait = group.getByRole('button', { name: 'Open the grouping for Lantern Voice' });
    expect(Math.min((await portrait.boundingBox())!.height, (await portrait.boundingBox())!.width)).toBeGreaterThanOrEqual(44);
    if (pointer === 'touch') await portrait.tap();
    else await portrait.press('Enter');
    await expect(page).toHaveURL(/group=/);
    await expect(group.getByRole('link', { name: 'Lantern Pressing', exact: true })).toHaveCount(1);
    await expect(group.locator('.saved-album')).toContainText('6 / 10');
    await expect(group.locator('.saved-album media-card')).toHaveCount(1);
    const rhythm = page.getByRole('button', { name: 'Harbor Rhythm', exact: true });
    const external = page.getByRole('button', { name: 'Open external music', exact: true });
    expect(Math.min((await rhythm.boundingBox())!.height, (await rhythm.boundingBox())!.width)).toBeGreaterThanOrEqual(44);
    expect(Math.min((await external.boundingBox())!.height, (await external.boundingBox())!.width)).toBeGreaterThanOrEqual(44);
    await press(page, pointer, rhythm);
    await expect(page.locator('#harbor-rhythm-heading')).toBeFocused();
    await expect(page.locator('.music-boundary')).toHaveText('This bar does not play audio.');
    await expect(page.locator('#harbor-rhythm')).toContainText('does not open the music link');
    expect(await opened(page)).toEqual([]);
    await expect(page.locator('audio, video, iframe')).toHaveCount(0);
    const close = page.getByRole('button', { name: 'Close Harbor Rhythm', exact: true });
    await press(page, pointer, close);
    await expect(rhythm).toBeFocused();
    await expect(page.locator('#harbor-rhythm')).toHaveCount(0);
    const link = page.locator('#external-music');
    await link.fill('javascript:alert(1)');
    await press(page, pointer, external);
    await expect(page.getByText('Enter an http or https link. This bar does not play audio.')).toBeVisible();
    expect(await opened(page)).toEqual([]);
    await expect(page.locator('#harbor-rhythm')).toHaveCount(0);
    await link.fill('https://example.com/listen');
    await press(page, pointer, external);
    expect(await opened(page)).toEqual(['https://example.com/listen']);
    await expect(link).toHaveValue('https://example.com/listen');
    await expect(page.locator('audio, video, iframe')).toHaveCount(0);
    const albumLink = group.getByRole('link', { name: 'Lantern Pressing', exact: true });
    if (pointer === 'touch') await albumLink.tap();
    else await albumLink.press('Enter');
    await expect(page.locator('main h1')).toHaveText('Lantern Pressing');
    await expect(page.getByRole('radio', { name: '6 out of 10' })).toHaveAttribute('aria-checked', 'true');
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Artist wall', exact: true })).toBeVisible();
    const groups = await (await request.get('/media/api/music-groups?sort=title')).json();
    expect(groups.items).toHaveLength(1);
    expect(groups.items[0].rating).toBeNull();
    expect(groups.items[0].followed).toBe(false);
    expect(groups.items[0].artwork_url).toBeNull();
    expect(groups.items[0].albums).toHaveLength(1);
    expect(groups.items[0].albums[0].id).toBe(album.id);
    expect(groups.items[0].albums[0].rating).toBe(6);
    expect(providers).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const scan = await new AxeBuilder({ page }).include('main').analyze();
    expect(scan.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
    const screenshot = info.outputPath(`music-bar-${width}-${theme}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    await info.attach(`music-bar-${width}-${theme}`, { path: screenshot, contentType: 'image/png' });
  });
  });
}

test('unfollowing or deleting the artist leaves the saved album on the wall', async ({ page, request }) => {
  const album = await saveAlbum(request);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openWall(page);
  const group = page.locator('.artist-group');
  await group.getByRole('button', { name: 'Show saved albums and songs (1)' }).click();
  await expect(group.locator('.saved-album')).toContainText('6 / 10');
  const followed = await request.post('/media/api/library', {
    data: { kind: 'artist', title: 'Lantern Voice', status: 'following', artist_identity: IDENTITY },
  });
  expect(followed.ok(), await followed.text()).toBeTruthy();
  const artist = await followed.json();
  expect(artist.rating).toBeNull();
  await page.reload();
  await expect(group.getByRole('link', { name: 'Lantern Voice', exact: true })).toBeVisible();
  await expect(group.locator('p.muted').first()).toHaveText('Following');
  await expect(group.locator('.saved-album')).toContainText('6 / 10');
  const unfollowed = await request.patch(`/media/api/entries/${artist.id}`, { data: { status: 'unfollowed' } });
  expect(unfollowed.ok(), await unfollowed.text()).toBeTruthy();
  await page.reload();
  await expect(group.locator('p.muted').first()).toHaveText('Not followed');
  await expect(group.locator('.saved-album')).toContainText('6 / 10');
  expect((await request.get(`/media/api/entries/${album.id}`)).ok()).toBeTruthy();
  const removed = await request.delete(`/media/api/entries/${artist.id}`);
  expect(removed.ok(), await removed.text()).toBeTruthy();
  expect((await request.get(`/media/api/entries/${artist.id}`)).status()).toBe(404);
  await page.reload();
  await expect(group.getByRole('heading', { name: 'Lantern Voice', exact: true })).toBeVisible();
  await expect(group.getByRole('link', { name: 'Lantern Voice', exact: true })).toHaveCount(0);
  await expect(group.locator('p.muted').first()).toHaveText('Not followed');
  await expect(group.locator('.saved-album')).toContainText('6 / 10');
  const kept = await (await request.get(`/media/api/entries/${album.id}`)).json();
  expect(kept.rating).toBe(6);
  expect(kept.artwork_url).toBe('https://example.com/lantern-cover.png');
  const groups = await (await request.get('/media/api/music-groups?sort=title')).json();
  expect(groups.items[0].entry_id).toBeNull();
  expect(groups.items[0].rating).toBeNull();
  expect(groups.items[0].artwork_url).toBeNull();
  expect(groups.items[0].albums[0].rating).toBe(6);
});

test('a failed read keeps the music link, and sign-out clears it', async ({ page, request }) => {
  await saveAlbum(request);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/media/library?kind=artist');
  const link = page.locator('#external-music');
  await link.fill('https://example.com/keep');
  await expect.poll(() => page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.startsWith('media-music-link:')))).toEqual(['media-music-link:1']);
  await page.route('**/media/api/music-groups**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (/\/music-groups\/\d+/.test(path)) return route.continue();
    return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Group offline' }) });
  });
  await page.locator('#library-q').fill('Lantern');
  await expect(page.locator('.local-error')).toContainText('Group offline');
  await expect(link).toHaveValue('https://example.com/keep');
  await expect(page.getByRole('heading', { name: 'Artist wall', exact: true })).toHaveCount(0);
  const before = await (await request.get('/media/api/music-groups?sort=title')).json();
  expect(before.items[0].albums[0].rating).toBe(6);
  await page.unroute('**/media/api/music-groups**');
  await page.getByRole('button', { name: 'Retry library' }).click();
  await expect(page.getByRole('heading', { name: 'Lantern Voice', exact: true })).toBeVisible();
  await expect(link).toHaveValue('https://example.com/keep');
  await page.getByRole('banner').getByRole('button', { name: 'synthetic', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/login/);
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.startsWith('media-music-link:')))).toEqual([]);
});

test('a late artist wall does not replace movies or open the music link', async ({ page, request }) => {
  await saveAlbum(request);
  await page.setViewportSize({ width: 1280, height: 800 });
  await installOpenStub(page);
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = false;
  await page.route('**/media/api/music-groups**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (/\/music-groups\/\d+/.test(path) || started) {
      await route.continue();
      return;
    }
    started = true;
    await gate;
    try {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [{
            catalog_id: 999,
            title: 'Late Voice',
            source: 'manual',
            followed: false,
            entry_id: null,
            rating: 6,
            artwork_url: 'https://example.com/late.png',
            saved_count: 0,
            albums: [],
            songs: [],
            saved_children: [],
          }],
          total: 1,
          offset: 0,
          limit: 24,
          has_more: false,
          available_tags: [],
        }),
      });
    } catch {
      // Leaving the bar aborts the read. That still must not paint Late Voice.
    }
  });
  await page.goto('/media/library?kind=artist&sort=title');
  await expect.poll(() => started).toBe(true);
  await page.locator('#external-music').fill('https://example.com/keep');
  await page.getByRole('navigation', { name: 'Media sections' }).getByRole('link', { name: 'Movies', exact: true }).click();
  release();
  await expect(page).toHaveURL(/kind=movie/);
  await expect(page.getByText('Late Voice')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Artist wall', exact: true })).toHaveCount(0);
  await expect(page.locator('media-music-stage')).toHaveCount(0);
  expect(await opened(page)).toEqual([]);
  const kept = await (await request.get('/media/api/music-groups?sort=title')).json();
  expect(kept.items[0].title).toBe('Lantern Voice');
  expect(kept.items[0].rating).toBeNull();
  expect(kept.items[0].albums[0].rating).toBe(6);
  await page.goto('/media/library?kind=artist');
  await expect(page.locator('#external-music')).toHaveValue('https://example.com/keep');
  await expect(page.getByText('Late Voice')).toHaveCount(0);
});
