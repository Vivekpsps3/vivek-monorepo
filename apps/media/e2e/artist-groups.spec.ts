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
    const button = page.getByRole('button', { name: 'Show North Voice, not followed (2)' });
    await expect(button).toBeVisible();
    await button.click();
    const panel = page.locator('.saved-children');
    await expect(panel.getByRole('link', { name: 'North Pressing', exact: true })).toHaveCount(1);
    await expect(panel.getByRole('link', { name: 'North Single', exact: true })).toHaveCount(1);
    await expect(page).toHaveURL(/group=/);
    expect(providers).toEqual([]);

    await page.locator('#library-q').fill('North');
    await expect(page).toHaveURL(/q=North/);
    await page.route('**/media/api/music-groups/**', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Group offline' }),
      }),
    );
    await page.getByRole('button', { name: 'Show North Voice, not followed (2)' }).click();
    await expect(page.locator('.saved-children').getByRole('alert')).toHaveText('Group offline');
    await expect(page.locator('#library-q')).toHaveValue('North');
    await expect(page.getByRole('link', { name: 'North Pressing', exact: true })).toBeVisible();
    await page.unroute('**/media/api/music-groups/**');
    await page.getByRole('button', { name: 'Retry saved music' }).click();
    await expect(panel.getByRole('link', { name: 'North Single', exact: true })).toBeVisible();
    await expect(page.locator('#library-q')).toHaveValue('North');

    await page.getByRole('navigation', { name: 'Music views' }).getByRole('link', { name: 'Songs', exact: true }).click();
    await expect(page).toHaveURL(/kind=track/);
    await expect(page).not.toHaveURL(/group=/);
    await expect(page.locator('.media-grid > section > media-card')).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'North Single', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'North Pressing', exact: true })).toHaveCount(0);

    await page.goto('/media/library?kind=artist');
    await expect(page.getByText('No artists saved yet')).toBeVisible();
    await expect(page.getByRole('link', { name: 'North Voice', exact: true })).toHaveCount(0);
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
    await expect(page.getByRole('link', { name: 'Browse discography' })).toBeVisible();
    expect(providers).toEqual([]);
    await page.goto('/media/library?kind=album');
    await expect(page.getByRole('button', { name: 'Show North Voice (2)' })).toBeVisible();
    await expect(page.locator('.media-grid > section > media-card')).toHaveCount(1);
  });
}

test('a late artist group does not replace the group on screen', async ({ page, request }) => {
  await seedPair(request);
  const south = await request.post('/media/api/library', {
    data: {
      kind: 'album',
      title: 'South Pressing',
      artist_identity: { source: 'manual', source_id: 'person-south-voice', name: 'South Voice' },
    },
  });
  expect(south.ok(), await south.text()).toBeTruthy();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/media/library?kind=album&sort=title');
  const north = page.getByRole('button', { name: 'Show North Voice, not followed (2)' });
  const second = page.getByRole('button', { name: 'Show South Voice, not followed (1)' });
  let releaseFirst: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let started = false;
  await page.route('**/media/api/music-groups/**', async (route) => {
    if (!started) {
      started = true;
      await gate;
    }
    await route.continue();
  });
  await north.click();
  await expect.poll(() => started).toBe(true);
  await second.click();
  const panel = page.locator('.saved-children');
  await expect(panel.getByRole('link', { name: 'South Pressing', exact: true })).toBeVisible();
  releaseFirst();
  await expect(panel.getByRole('link', { name: 'South Pressing', exact: true })).toBeVisible();
  await expect(panel.getByRole('link', { name: 'North Pressing', exact: true })).toHaveCount(0);
  await expect(page.locator('#library-q')).toHaveValue('');
});
