import { expect, test, type APIRequestContext, type Page } from '../../../tests/e2e/fixtures';

// No Town minigame exists. Habit check-in is the live Town session this boundary can start.

test.use({ timezoneId: 'America/Los_Angeles', reducedMotion: 'reduce' });

test.beforeEach(async ({ request }) => {
  expect((await request.post('/e2e/reset?seed=town')).ok()).toBeTruthy();
});

async function libraryRows(request: APIRequestContext) {
  const response = await request.get('/media/api/library?limit=50');
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<{ total: number; items: { id: number; title: string; kind: string; status: string }[] }>;
}

async function saveGame(request: APIRequestContext, title: string) {
  const response = await request.post('/media/api/library', {
    data: { kind: 'game', title, status: 'want' },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<{ id: number; title: string }>;
}

function watchMediaWrites(page: Page) {
  const writes: string[] = [];
  page.on('request', (req) => {
    if (req.method() === 'GET') return;
    const path = new URL(req.url()).pathname;
    if (path.startsWith('/media')) writes.push(`${req.method()} ${path}`);
  });
  return writes;
}

for (const [width, height, theme, pointer] of [
  [390, 844, 'light', 'keyboard'],
  [390, 844, 'dark', 'touch'],
  [1280, 800, 'light', 'touch'],
  [1280, 800, 'dark', 'keyboard'],
] as const) {
  test.describe(`Town check-in at ${width} ${theme} ${pointer}`, () => {
    test.use({ viewport: { width, height }, hasTouch: pointer === 'touch' });

    test('does not add a Media game', async ({ page, request }) => {
    test.setTimeout(90_000);
    await saveGame(request, 'Lantern Kart');
    await saveGame(request, 'Untouched Quest');
    const before = await libraryRows(request);
    expect(before.total).toBe(2);
    await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
    await page.clock.setFixedTime(new Date('2026-10-29T19:00:00Z'));
    const writes = watchMediaWrites(page);
    await page.goto('/town');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.getByRole('heading', { level: 1, name: 'Terraria-on-Sea' })).toBeVisible();
    expect(await page.content()).not.toContain('Lantern Kart');
    expect(await page.content()).not.toContain('Untouched Quest');
    const button = page.locator('app-town-today li').filter({ hasText: 'Read 20 pages' }).getByRole('button');
    await expect(button).toHaveAccessibleName('Mark Read 20 pages done for today');
    await button.scrollIntoViewIfNeeded();
    const bounds = await button.boundingBox();
    expect(Math.min(bounds!.width, bounds!.height)).toBeGreaterThanOrEqual(44);
    if (pointer === 'touch') await button.tap();
    else {
      await button.focus();
      await button.press('Enter');
    }
    await expect(button).toHaveAccessibleName('Read 20 pages, done today. Undo');
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(writes).toEqual([]);
    const after = await libraryRows(request);
    expect(after.total).toBe(before.total);
    expect(after.items.map(item => `${item.id}:${item.kind}:${item.title}:${item.status}`).sort()).toEqual(
      before.items.map(item => `${item.id}:${item.kind}:${item.title}:${item.status}`).sort(),
    );
    expect(await page.content()).not.toContain('Lantern Kart');

    await page.goto('/media/library?kind=game&sort=title');
    await expect(page.locator('.game-boundary')).toHaveText('This cabinet is your Media library, not a Town minigame.');
    await expect(page.locator('article[data-game]')).toHaveCount(2);
    await expect(page.getByRole('link', { name: 'Lantern Kart', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Untouched Quest', exact: true })).toBeVisible();
    await expect(page.getByText('Want to play', { exact: true }).first()).toBeVisible();
    });
  });
}
