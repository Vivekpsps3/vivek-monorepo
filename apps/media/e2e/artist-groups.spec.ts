import { expect, test, type Page } from '../../../tests/e2e/fixtures';
import { resetMedia } from './media-test';

test.beforeEach(async ({ request }) => resetMedia(request));

async function seedPair(request: Parameters<typeof resetMedia>[0]) {
  const album = await request.post('/media/api/library', {
    data: {
      kind: 'album',
      title: 'North Pressing',
      artist_identity: { source: 'manual', source_id: 'person-north-voice', name: 'North Voice' },
    },
  });
  expect(album.ok(), await album.text()).toBeTruthy();
  const song = await request.post('/media/api/library', {
    data: {
      kind: 'track',
      title: 'North Single',
      artist_identity: { source: 'manual', source_id: 'person-north-voice', name: 'North Voice' },
    },
  });
  expect(song.ok(), await song.text()).toBeTruthy();
}

function watchProviders(page: Page) {
  const calls: string[] = [];
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('/discography') || url.includes('musicbrainz.org')) calls.push(url);
  });
  return calls;
}

for (const [width, height] of [
  [390, 844],
  [1280, 800],
] as const) {
  test(`one saved album stays one membership at ${width}`, async ({ page, request }) => {
    await seedPair(request);
    await page.setViewportSize({ width, height });
    const providers = watchProviders(page);
    await page.goto('/media/library?kind=album');
    await expect(page.locator('.media-grid > section')).toHaveCount(1);
    await expect(page.locator('.media-grid > section > media-card')).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'North Pressing', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'North Voice', exact: true })).toHaveCount(0);
    await expect(page.locator('.saved-children')).toHaveCount(0);
    const groupLink = page.getByRole('link', { name: 'Show North Voice, not followed (2)' });
    await expect(groupLink).toBeVisible();
    await groupLink.click();
    await expect(page).toHaveURL(/kind=artist/);
    await expect(page).toHaveURL(/group=/);
    const panel = page.locator('.saved-children');
    await expect(panel.getByRole('link', { name: 'North Pressing', exact: true })).toHaveCount(1);
    await expect(panel.getByRole('link', { name: 'North Single', exact: true })).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'North Pressing', exact: true })).toHaveCount(1);
    await expect(panel.getByText('No saved songs on this album.')).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'Saved without an album' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'North Voice', exact: true })).toHaveCount(0);
    await expect(page.getByText('Not followed', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Browse discography' })).toHaveCount(0);
    expect(providers).toEqual([]);

    await page.getByRole('navigation', { name: 'Music views' }).getByRole('link', { name: 'Songs', exact: true }).click();
    await expect(page).toHaveURL(/kind=track/);
    await expect(page).not.toHaveURL(/group=/);
    await expect(page.locator('.media-grid > section > media-card')).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'North Single', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'North Pressing', exact: true })).toHaveCount(0);

    await page.goto('/media/library?kind=artist');
    await expect(page.getByRole('heading', { name: 'North Voice', exact: true })).toBeVisible();
    await expect(page.getByText('No artists in your music yet')).toHaveCount(0);
    const follow = await request.post('/media/api/library', {
      data: {
        kind: 'artist',
        title: 'North Voice',
        status: 'following',
        artist_identity: { source: 'manual', source_id: 'person-north-voice', name: 'North Voice' },
      },
    });
    expect(follow.ok(), await follow.text()).toBeTruthy();
    await page.goto('/media/library?kind=artist');
    await expect(page.getByRole('link', { name: 'North Voice', exact: true })).toHaveCount(1);
    await page.getByRole('button', { name: 'Show saved albums and songs (2)' }).click();
    await expect(page.locator('.saved-children').getByRole('link', { name: 'North Pressing', exact: true })).toHaveCount(1);
    await expect(page.locator('.saved-children').getByRole('link', { name: 'North Single', exact: true })).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Browse discography' })).toHaveCount(0);
    expect(providers).toEqual([]);
    await page.goto('/media/library?kind=album');
    await expect(page.getByRole('link', { name: 'Show North Voice (2)' })).toBeVisible();
    await expect(page.locator('.media-grid > section > media-card')).toHaveCount(1);
    await expect(page.locator('.saved-children')).toHaveCount(0);
  });
}

test('a musicbrainz follow keeps discography as a separate link', async ({ page, request }) => {
  const created = await request.post('/media/api/library', {
    data: {
      kind: 'artist',
      title: 'Catalog Voice',
      status: 'following',
      artist_identity: {
        source: 'musicbrainz',
        source_id: 'abababab-abab-4bab-8bab-abababababab',
        name: 'Catalog Voice',
      },
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const providers = watchProviders(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/media/library?kind=artist');
  await page.getByRole('button', { name: 'Show saved albums and songs (0)' }).click();
  const link = page.getByRole('link', { name: 'Browse discography' });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', /discography/);
  await expect(page.getByText('No saved albums or songs for this artist.')).toBeVisible();
  expect(providers).toEqual([]);
});

test('a late artist list does not replace the songs on screen', async ({ page, request }) => {
  await seedPair(request);
  await page.setViewportSize({ width: 1280, height: 800 });
  let releaseFirst: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let started = false;
  await page.route('**/media/api/music-groups**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (/\/music-groups\/\d+/.test(path)) {
      await route.continue();
      return;
    }
    if (!started) {
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
              rating: null,
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
        // Switching views aborts the artist read. That still must not paint Late Voice.
      }
      return;
    }
    await route.continue();
  });
  await page.goto('/media/library?kind=artist&sort=title');
  await expect.poll(() => started).toBe(true);
  await page.getByRole('navigation', { name: 'Music views' }).getByRole('link', { name: 'Songs', exact: true }).click();
  await expect(page.getByRole('link', { name: 'North Single', exact: true })).toBeVisible();
  releaseFirst();
  await expect(page.getByRole('link', { name: 'North Single', exact: true })).toBeVisible();
  await expect(page.getByText('Late Voice')).toHaveCount(0);
  await expect(page).toHaveURL(/kind=track/);
  await expect(page.locator('#library-q')).toHaveValue('');
});
