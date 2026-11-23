import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Locator, type Page, type TestInfo } from '../../../tests/e2e/fixtures';

const FORBIDDEN = new Set(['pto_days', 'return_date', 'counts_as_pto']);
const PROVIDER = /tmdb|themoviedb|openlibrary|googlebooks/i;

interface Seed {
  atlasId: number;
  betaId: number;
  harborId: number;
}

function forbiddenKeys(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) forbiddenKeys(item, found);
    return found;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN.has(key)) found.push(key);
      forbiddenKeys(child, found);
    }
  }
  return found;
}

async function readOk(response: Awaited<ReturnType<APIRequestContext['post']>>): Promise<string> {
  const text = await response.text();
  expect(response.ok(), `${response.status()} ${text}`).toBeTruthy();
  return text;
}

async function saveEntry(request: APIRequestContext, kind: string, title: string): Promise<number> {
  const text = await readOk(await request.post('/media/api/library', {
    data: { kind, title, status: 'completed' },
  }));
  return (JSON.parse(text) as { id: number }).id;
}

async function saveTrip(request: APIRequestContext, body: Record<string, unknown>): Promise<number> {
  const text = await readOk(await request.post('/travel/api/trips', { data: body }));
  return (JSON.parse(text) as { id: number }).id;
}

async function seedShelf(request: APIRequestContext): Promise<Seed> {
  await saveEntry(request, 'movie', 'Shelf Reel');
  await saveEntry(request, 'tv', 'Shelf Scroll');
  await saveEntry(request, 'game', 'Shelf Gem');
  await saveEntry(request, 'album', 'Shelf Record');
  await saveEntry(request, 'book', 'Shelf Dune');
  await saveEntry(request, 'book', 'Shelf Cedar');
  const betaId = await saveEntry(request, 'book', 'Shelf Beta');
  const atlasId = await saveEntry(request, 'book', 'Shelf Atlas');
  await saveTrip(request, {
    title: 'Shelf Plan',
    start_date: '2026-10-01',
    end_date: '2026-10-02',
    status: 'planning',
    counts_as_pto: false,
  });
  await saveTrip(request, {
    title: 'Shelf Late',
    start_date: '2020-01-01',
    end_date: '2020-01-03',
    status: 'done',
    counts_as_pto: false,
  });
  const harborId = await saveTrip(request, {
    title: 'Shelf Harbor',
    start_date: '2026-12-01',
    end_date: '2026-12-31',
    status: 'booked',
    counts_as_pto: false,
    stays: [{
      city: 'Portland',
      region: 'Oregon',
      country: 'United States',
      arrive_on: '2026-12-01',
      leave_on: '2026-12-10',
      lat: 45.52,
      lng: -122.68,
    }],
  });
  return { atlasId, betaId, harborId };
}

async function shelfBody(request: APIRequestContext, on?: string): Promise<Record<string, unknown>> {
  const query = new URLSearchParams({ tz: 'America/Los_Angeles' });
  if (on) query.set('on', on);
  const response = await request.get(`/api/town/keepsakes?${query}`);
  const text = await response.text();
  expect(response.ok(), text).toBeTruthy();
  return JSON.parse(text) as Record<string, unknown>;
}

function ids(body: Record<string, unknown>): string[] {
  const lists = ['keepsakes', 'souvenirs', 'planned', 'ineligible'] as const;
  return lists.flatMap(name => ((body[name] as { id: string }[] | undefined) ?? []).map(item => item.id));
}

async function boxAtLeast(locator: Locator, size = 44): Promise<void> {
  const box = await locator.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(size);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(size);
}

async function showShelf(page: Page, touch: boolean, info: TestInfo, width: number, theme: string): Promise<void> {
  const calls: string[] = [];
  const providers: string[] = [];
  page.on('request', request => {
    const url = request.url();
    if (new URL(url).pathname === '/api/town/keepsakes') calls.push(url);
    if (PROVIDER.test(url)) providers.push(url);
  });
  await page.goto('/town/keepsakes');
  const shelf = page.locator('app-keepsake-page');
  await expect(shelf.getByRole('heading', { level: 1, name: 'Keepsake shelf' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await expect(shelf.getByText('Shelf Atlas', { exact: true })).toBeVisible();
  await expect(shelf.getByText('Shelf Dune', { exact: true })).toHaveCount(0);
  await expect(shelf.getByText('Shelf Record', { exact: true })).toHaveCount(0);
  expect(calls).toHaveLength(1);
  expect(providers).toEqual([]);

  const harbor = shelf.locator('article', { hasText: 'Shelf Harbor' });
  await expect(harbor).toHaveAttribute('data-mark', 'souvenir');
  await expect(harbor).toContainText('2026-12-31');
  await expect(harbor).toContainText('Credit date 2027-01-01');
  await expect(harbor).toContainText('Portland');
  await expect(harbor).toContainText('illustrative');
  await expect(harbor).toContainText('not a map');
  await expect(harbor.locator('[data-biome="forest"]')).toContainText('forest');
  const planned = shelf.locator('article', { hasText: 'Shelf Plan' });
  await expect(planned).toHaveAttribute('data-mark', 'planned');
  await expect(planned).toContainText('does not credit');
  const late = shelf.locator('article', { hasText: 'Shelf Late' });
  await expect(late).toHaveAttribute('data-mark', 'ineligible');
  await expect(late).toContainText('does not credit');
  await expect(shelf.locator('[data-difference="episode-versus-completion"]')).toContainText('watched episode');

  const more = shelf.getByRole('button', { name: 'More keepsakes' });
  const find = shelf.getByRole('textbox', { name: 'Find a keepsake' });
  const open = shelf.getByRole('link', { name: 'Open Shelf Atlas · 2026-10-01' });
  await boxAtLeast(more);
  await boxAtLeast(find);
  await boxAtLeast(open);
  if (touch) await more.tap();
  else {
    await more.focus();
    await page.keyboard.press('Enter');
  }
  await expect(shelf.getByText('Shelf Dune', { exact: true })).toBeVisible();
  await expect(shelf.getByRole('heading', { name: 'reel', level: 4 })).toBeVisible();
  await expect(shelf.getByRole('heading', { name: 'scroll', level: 4 })).toBeVisible();
  await expect(shelf.getByRole('heading', { name: 'gem', level: 4 })).toBeVisible();
  await expect(shelf.getByText('Shelf Record', { exact: true })).toHaveCount(0);
  expect(calls).toHaveLength(1);

  await find.fill('Atlas');
  await expect(shelf.getByText('Shelf Atlas', { exact: true })).toBeVisible();
  await expect(shelf.getByText('Shelf Beta', { exact: true })).toHaveCount(0);
  await expect(shelf.getByText('Shelf Harbor', { exact: true })).toHaveCount(0);
  await find.fill('');
  await expect(shelf.getByText('Shelf Beta', { exact: true })).toBeVisible();
  await expect(shelf.getByText('Shelf Harbor', { exact: true })).toBeVisible();
  expect(calls).toHaveLength(1);
  expect(providers).toEqual([]);

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  expect(await shelf.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
  const scan = await new AxeBuilder({ page }).include('app-keepsake-page').analyze();
  expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
  await info.attach(`keepsakes-${width}-${theme}`, {
    body: await shelf.screenshot(),
    contentType: 'image/png',
  });
  await shelf.screenshot({ path: `/tmp/scene-09-shots/keepsakes-${width}-${theme}.png` });
}

for (const [width, height, theme, touch] of [
  [390, 844, 'dark', true],
  [1280, 800, 'light', false],
  [390, 844, 'light', true],
  [1280, 800, 'dark', false],
] as const) {
  test.describe(`keepsake shelf at ${width} ${theme}`, () => {
    test.describe.configure({ timeout: 180_000 });
    test.use({
      viewport: { width, height },
      hasTouch: touch,
      timezoneId: 'America/Los_Angeles',
    });

    let seeded: Seed;

    test.beforeEach(async ({ page, request }) => {
      expect((await request.post('/e2e/reset?seed=town')).ok()).toBeTruthy();
      expect((await request.post('/e2e/town/clock', { data: { iso: '2026-10-01T19:00:00Z' } })).ok()).toBeTruthy();
      seeded = await seedShelf(request);
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
    });

    test('derives the shelf from saved records', async ({ page, request }, info) => {
      const openShelf = await shelfBody(request);
      expect(forbiddenKeys(openShelf)).toEqual([]);
      expect(openShelf['on']).toBeNull();
      expect(ids(openShelf)).toContain(`trip:${seeded.harborId}:credit:2027-01-01`);
      expect(JSON.stringify(openShelf)).not.toContain('Shelf Record');

      await showShelf(page, touch, info, width, theme);

      if (width !== 1280 || theme !== 'light') return;

      await page.goto('/town');
      await expect(page.getByRole('link', { name: 'Keepsake shelf' })).toBeVisible();
      await expect(page.locator('app-town')).not.toContainText('Shelf Atlas');

      await page.goto('/town/keepsakes');
      const shelf = page.locator('app-keepsake-page');
      const inspect = shelf.getByRole('button', { name: 'Inspect Shelf Atlas' });
      await inspect.click();
      await expect(inspect).toHaveAttribute('aria-current', 'true');
      await shelf.getByRole('link', { name: 'Open Shelf Atlas · 2026-10-01' }).click();
      await expect(page).toHaveURL(/\/media\/item\/\d+$/);
      await page.goBack();
      await expect(page).toHaveURL(/\/town\/keepsakes/);
      await expect(shelf.getByRole('button', { name: 'Inspect Shelf Atlas' })).toBeFocused();
      await expect(shelf.getByRole('button', { name: 'Inspect Shelf Atlas' })).toHaveAttribute('aria-current', 'true');

      expect((await request.post('/e2e/town/clock', { data: { iso: '2026-10-20T19:00:00Z' } })).ok()).toBeTruthy();
      await readOk(await request.patch(`/media/api/entries/${seeded.atlasId}`, { data: { status: 'in_progress' } }));
      await readOk(await request.patch(`/media/api/entries/${seeded.atlasId}`, { data: { status: 'completed' } }));
      const oldDay = await shelfBody(request, '2026-10-01');
      expect(ids(oldDay)).not.toContain(`finished:${seeded.atlasId}:2026-10-01`);
      const moved = await shelfBody(request, '2026-10-20');
      expect(ids(moved)).toContain(`finished:${seeded.atlasId}:2026-10-20`);
      await page.goto('/town/keepsakes?on=2026-10-20');
      await expect(shelf.getByText('Shelf Atlas', { exact: true })).toBeVisible();
      await expect(shelf.getByText('Completed book on 2026-10-20.')).toBeVisible();
      await expect(shelf.getByText('Completed book on 2026-10-01.')).toHaveCount(0);

      await readOk(await request.patch(`/media/api/entries/${seeded.atlasId}`, { data: { status: 'in_progress' } }));
      await page.reload();
      await expect(shelf.getByText('Shelf Atlas', { exact: true })).toHaveCount(0);

      await readOk(await request.delete(`/media/api/entries/${seeded.betaId}`));
      const withoutBeta = await shelfBody(request);
      expect(JSON.stringify(withoutBeta)).not.toContain('Shelf Beta');

      await readOk(await request.patch(`/travel/api/trips/${seeded.harborId}`, { data: { end_date: '2026-12-15' } }));
      const shifted = await shelfBody(request);
      const shiftedIds = ids(shifted);
      expect(shiftedIds).not.toContain(`trip:${seeded.harborId}:credit:2027-01-01`);
      expect(shiftedIds).toContain(`trip:${seeded.harborId}:credit:2026-12-16`);
      await page.goto('/town/keepsakes');
      await expect(shelf.locator('article', { hasText: 'Shelf Harbor' })).toContainText('Credit date 2026-12-16');
      await expect(shelf.locator('article', { hasText: 'Shelf Harbor' })).toContainText('2026-12-15');

      await readOk(await request.delete(`/travel/api/trips/${seeded.harborId}`));
      await page.reload();
      await expect(shelf.getByText('Shelf Harbor', { exact: true })).toHaveCount(0);
      expect(ids(await shelfBody(request))).not.toContain(`trip:${seeded.harborId}:credit:2026-12-16`);
    });
  });
}
