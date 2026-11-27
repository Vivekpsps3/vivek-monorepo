import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Request } from '../../../tests/e2e/fixtures';

const headers = { 'X-CSRF-Token': 'synthetic-csrf' };
const lifePaths = ['/media/api/summary', '/travel/api/memories', '/travel/api/home', '/api/world/concepts'];
const hotspots = [
  ['tidepool-shells', 'Tidepool shells', 'You lift a tidepool shell.'],
  ['ferry-bell', 'Ferry bell', 'You ring the model ferry bell.'],
  ['library-globe', 'Library globe', 'You turn the library globe.'],
  ['theater-light-booth', 'Theater light booth', 'You try the theater light booth.'],
  ['music-mural', 'Music mural', 'You trace the music mural.'],
  ['gym-chalkboard', 'Gym chalkboard', 'You mark the gym chalkboard.'],
  ['clinic-garden', 'Clinic garden', 'You notice the clinic garden.'],
  ['hall-sundial', 'Hall sundial', 'You read the Hall sundial.'],
  ['courtyard-birdbath', 'Courtyard birdbath', 'You look into the courtyard birdbath.'],
  ['lantern-alley', 'Lantern alley', 'You look along lantern alley.'],
  ['rooftop-telescope', 'Rooftop telescope', 'You look through the rooftop telescope.'],
  ['arcade-sign', 'Arcade sign', 'You tap the arcade sign.'],
] as const;

function lifeMutation(request: Request): boolean {
  if (request.method() === 'GET' || request.method() === 'HEAD') return false;
  const path = new URL(request.url()).pathname;
  return path.startsWith('/media/')
    || path.startsWith('/travel/')
    || path.startsWith('/finance')
    || path.startsWith('/api/finance')
    || path.startsWith('/api/world')
    || path.startsWith('/api/town/habits')
    || path.startsWith('/api/town/stamps')
    || path.startsWith('/api/vault')
    || path.includes('/health');
}

async function activate(page: Page, action: ReturnType<Page['locator']>, touch: boolean): Promise<void> {
  await expect(action).toBeEnabled();
  if (touch) await action.tap();
  else {
    await action.focus();
    await page.keyboard.press('Enter');
  }
}

async function lifeSnapshot(page: Page): Promise<string[]> {
  const bodies = await Promise.all(lifePaths.map(async path => {
    const response = await page.request.get(`${path}?tz=America/Los_Angeles`);
    expect(response.ok(), path).toBeTruthy();
    return JSON.stringify(await response.json());
  }));
  return bodies;
}

async function record(page: Page, discoveries: ReturnType<Page['locator']>, name: string, touch: boolean): Promise<void> {
  await activate(page, discoveries.getByRole('button', { name: `Activate ${name}`, exact: true }), touch);
  await expect(discoveries.getByRole('heading', { name: `Activate ${name}?` })).toBeFocused();
  await activate(page, discoveries.getByRole('button', { name: 'Confirm discovery', exact: true }), touch);
  const notice = discoveries.locator('#discovery-notice');
  await expect(notice).toHaveText('Found once.');
  await expect(notice).toBeFocused();
}

test.describe('Town discoveries', () => {
  test.use({ timezoneId: 'America/Los_Angeles', hasTouch: true });
  test.beforeEach(async ({ request }) => {
    expect((await request.post('/e2e/reset?seed=town')).ok()).toBeTruthy();
  });

  for (const width of [390, 1280]) for (const theme of ['light', 'dark'] as const) {
    test(`${width} ${theme} finds the bell, telescope, and chalkboard once`, async ({ page }, info) => {
      const touch = width === 390;
      const mutations: string[] = [];
      page.on('request', request => {
        if (lifeMutation(request)) mutations.push(`${request.method()} ${new URL(request.url()).pathname}`);
      });
      await page.setViewportSize({ width, height: touch ? 844 : 800 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.addInitScript(chosen => localStorage.setItem('suite-theme', chosen), theme);
      await page.goto('/town');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const entrance = page.locator('.town-destinations').getByRole('link', { name: 'Discoveries', exact: true });
      const entranceBox = await entrance.boundingBox();
      expect(entranceBox?.width).toBeGreaterThanOrEqual(44);
      expect(entranceBox?.height).toBeGreaterThanOrEqual(44);
      await activate(page, entrance, touch);

      const discoveries = page.locator('app-town-discoveries');
      await expect(discoveries.getByRole('heading', { name: 'Discoveries', exact: true })).toBeVisible();
      await expect(discoveries.locator('[data-discovery]')).toHaveCount(12);
      await expect(discoveries.locator('main')).toHaveAttribute('data-hints', 'hidden');
      await expect(discoveries.locator('main')).toHaveAttribute('data-revision', '0');
      const hints = discoveries.getByRole('button', { name: 'Show location hints', exact: true });
      const hintsBox = await hints.boundingBox();
      expect(hintsBox?.height).toBeGreaterThanOrEqual(44);
      await activate(page, hints, touch);
      await expect(discoveries.locator('main')).toHaveAttribute('data-hints', 'shown');
      await expect(discoveries.getByText('Beside the model ferry at the terminal.')).toBeVisible();
      await expect(discoveries.getByText('On the home roof, aimed over the harbor.')).toBeVisible();
      await expect(discoveries.getByText('Inside the gym, on the far wall.')).toBeVisible();
      await activate(page, discoveries.getByRole('button', { name: 'Hide location hints', exact: true }), touch);
      await expect(discoveries.getByText('Beside the model ferry at the terminal.')).toHaveCount(0);

      const beforeLife = await lifeSnapshot(page);
      const beforeTown = await (await page.request.get('/api/town?tz=America/Los_Angeles')).json();
      const bell = discoveries.getByRole('button', { name: 'Activate Ferry bell', exact: true });
      const bellBox = await bell.boundingBox();
      expect(bellBox?.width).toBeGreaterThanOrEqual(44);
      expect(bellBox?.height).toBeGreaterThanOrEqual(44);
      await info.attach(`discoveries-${width}-${theme}`, { body: await page.screenshot(), contentType: 'image/png' });
      await activate(page, bell, touch);
      const confirmation = discoveries.getByRole('heading', { name: 'Activate Ferry bell?' });
      await expect(confirmation).toBeFocused();
      await expect(discoveries.getByText('does not change a library item, trip, finance record, or health record')).toBeVisible();
      const cancel = discoveries.getByRole('button', { name: 'Cancel', exact: true });
      expect((await cancel.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      await info.attach(`confirm-${width}-${theme}`, { body: await page.screenshot(), contentType: 'image/png' });
      await activate(page, cancel, touch);
      await expect(bell).toBeFocused();
      await record(page, discoveries, 'Ferry bell', touch);
      await expect(discoveries.locator('[data-discovery="ferry-bell"]')).toHaveAttribute('data-found', 'true');
      await expect(discoveries.locator('main')).toHaveAttribute('data-revision', '1');
      await expect(discoveries.locator('[data-discovery="ferry-bell"]')).toContainText('No trip is created.');

      const replayBody = page.waitForRequest(request => request.method() === 'POST' && request.url().includes('/api/town/discoveries'));
      await activate(page, discoveries.getByRole('button', { name: 'Read Ferry bell again', exact: true }), touch);
      await expect(discoveries.getByText('does not add another journal stamp')).toBeVisible();
      await activate(page, discoveries.getByRole('button', { name: 'Confirm discovery', exact: true }), touch);
      const posted = (await replayBody).postDataJSON() as { discovery_id: string; expected_revision: number };
      expect(posted).toEqual({ discovery_id: 'ferry-bell', expected_revision: 1 });
      await expect(discoveries.locator('#discovery-notice')).toHaveText('Already in the journal.');
      await expect(discoveries.locator('#discovery-notice')).toBeFocused();
      await expect(discoveries.locator('main')).toHaveAttribute('data-revision', '1');

      await record(page, discoveries, 'Rooftop telescope', touch);
      await record(page, discoveries, 'Gym chalkboard', touch);
      await expect(discoveries.locator('main')).toHaveAttribute('data-revision', '3');
      await expect(discoveries.locator('[data-discovery="rooftop-telescope"]')).toHaveAttribute('data-found', 'true');
      await expect(discoveries.locator('[data-discovery="gym-chalkboard"]')).toHaveAttribute('data-found', 'true');
      await expect(discoveries.locator('[data-discovery="gym-chalkboard"]')).toContainText('No workout is recorded.');
      await page.reload();
      await expect(discoveries.locator('main')).toHaveAttribute('data-revision', '3');
      await expect(discoveries.locator('[data-discovery="ferry-bell"]')).toHaveAttribute('data-found', 'true');

      const stale = await page.request.post('/api/town/discoveries?tz=America/Los_Angeles', {
        headers,
        data: { discovery_id: 'ferry-bell', expected_revision: 0 },
      });
      expect(stale.status()).toBe(200);
      expect((await stale.json()).revision).toBe(3);
      const afterTown = await (await page.request.get('/api/town?tz=America/Los_Angeles')).json();
      expect(afterTown.town.xp).toBe(beforeTown.town.xp);
      const stamps = await (await page.request.get('/api/town/stamps')).json();
      expect(stamps.balance).toBe(0);
      expect(stamps.receipts).toEqual([]);
      expect(await lifeSnapshot(page)).toEqual(beforeLife);
      expect(mutations).toEqual([]);
      const text = await discoveries.innerText();
      expect(text).not.toMatch(/\bdue\b/i);
      expect(text).not.toMatch(/deadline/i);
      expect(await discoveries.evaluate(element => getComputedStyle(element).animationName)).toBe('none');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
      const scan = await new AxeBuilder({ page }).include('app-town-discoveries').analyze();
      expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
    });
  }

  test('keyboard and a scene tap reach the same ferry confirmation', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/town');
    const summary = page.locator('app-town-exterior summary').filter({ hasText: 'Discoveries' });
    await summary.focus();
    await page.keyboard.press('Enter');
    const link = page.getByRole('list', { name: 'Town discoveries' }).getByRole('link', { name: /^Ferry bell/ });
    await expect(link).toBeVisible();
    const box = await link.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
    await link.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/town\/discoveries\?object=ferry-bell/);
    const discoveries = page.locator('app-town-discoveries');
    await expect(discoveries.getByRole('heading', { name: 'Activate Ferry bell?' })).toBeFocused();
    await discoveries.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(discoveries.getByRole('heading', { name: 'Activate Ferry bell?' })).toHaveCount(0);
    await page.goto('/town');
    await page.locator('.viewport [data-discovery="ferry-bell"]').click();
    await expect(page).toHaveURL(/object=ferry-bell/);
    await expect(discoveries.getByRole('heading', { name: 'Activate Ferry bell?' })).toBeFocused();
    await discoveries.getByRole('button', { name: 'Confirm discovery', exact: true }).click();
    await expect(discoveries.locator('[data-discovery="ferry-bell"]')).toHaveAttribute('data-found', 'true');
    await expect(discoveries.locator('main')).toHaveAttribute('data-revision', '1');
  });

  test('records all twelve hotspots once and a replay stays at that revision', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/town/discoveries');
    const discoveries = page.locator('app-town-discoveries');
    await expect(discoveries.locator('[data-discovery]')).toHaveCount(12);
    for (const [index, [id, name, reaction]] of hotspots.entries()) {
      await record(page, discoveries, name, false);
      await expect(discoveries.locator(`[data-discovery="${id}"]`)).toHaveAttribute('data-found', 'true');
      await expect(discoveries.locator(`[data-discovery="${id}"]`)).toContainText(reaction);
      await expect(discoveries.locator('main')).toHaveAttribute('data-revision', String(index + 1));
    }
    await activate(page, discoveries.getByRole('button', { name: 'Read Ferry bell again', exact: true }), false);
    await activate(page, discoveries.getByRole('button', { name: 'Confirm discovery', exact: true }), false);
    await expect(discoveries.locator('#discovery-notice')).toHaveText('Already in the journal.');
    await expect(discoveries.locator('main')).toHaveAttribute('data-revision', '12');
    const journal = await (await page.request.get('/api/town/discoveries')).json();
    expect(journal.revision).toBe(12);
    expect(journal.discoveries.filter((item: { found: boolean }) => item.found)).toHaveLength(12);
  });

  test('a lost response keeps the confirmation and the retry records it once', async ({ page }) => {
    let failed = false;
    await page.route(/\/api\/town\/discoveries/, async route => {
      if (!failed && route.request().method() === 'POST') {
        failed = true;
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'unavailable', message: 'Try again.', detail: 'Try again.', field_errors: null }),
        });
        return;
      }
      await route.continue();
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/town/discoveries');
    const discoveries = page.locator('app-town-discoveries');
    await discoveries.getByRole('button', { name: 'Activate Ferry bell', exact: true }).click();
    await discoveries.getByRole('button', { name: 'Confirm discovery', exact: true }).click();
    await expect(discoveries.getByRole('button', { name: 'Retry discovery', exact: true })).toBeVisible();
    await expect(discoveries.getByRole('heading', { name: 'Activate Ferry bell?' })).toBeVisible();
    await expect(discoveries.locator('main')).toHaveAttribute('data-revision', '0');
    await discoveries.getByRole('button', { name: 'Retry discovery', exact: true }).click();
    await expect(discoveries.locator('[data-discovery="ferry-bell"]')).toHaveAttribute('data-found', 'true');
    await expect(discoveries.locator('main')).toHaveAttribute('data-revision', '1');
    const replay = await page.request.post('/api/town/discoveries', {
      headers,
      data: { discovery_id: 'ferry-bell', expected_revision: 0 },
    });
    expect(replay.status()).toBe(200);
    expect((await replay.json()).revision).toBe(1);
  });

  test('a conflicting save leaves the current journal unchanged', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/town/discoveries');
    const discoveries = page.locator('app-town-discoveries');
    await record(page, discoveries, 'Ferry bell', false);
    let blocked = false;
    await page.route(/\/api\/town\/discoveries/, async route => {
      if (!blocked && route.request().method() === 'POST') {
        blocked = true;
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'discovery_conflict',
            message: 'This journal was saved at revision 1.',
            detail: 'This journal was saved at revision 1.',
            field_errors: null,
          }),
        });
        return;
      }
      await route.continue();
    });
    await discoveries.getByRole('button', { name: 'Activate Rooftop telescope', exact: true }).click();
    await discoveries.getByRole('button', { name: 'Confirm discovery', exact: true }).click();
    await expect(discoveries.getByText('This journal changed. The current discoveries are shown.')).toBeVisible();
    await expect(discoveries.getByRole('heading', { name: 'Activate Rooftop telescope?' })).toHaveCount(0);
    await expect(discoveries.locator('[data-discovery="rooftop-telescope"]')).toHaveAttribute('data-found', 'false');
    await expect(discoveries.locator('[data-discovery="ferry-bell"]')).toHaveAttribute('data-found', 'true');
    await expect(discoveries.locator('main')).toHaveAttribute('data-revision', '1');
    const journal = await (await page.request.get('/api/town/discoveries')).json();
    expect(journal.revision).toBe(1);
    expect(journal.discoveries.find((item: { id: string }) => item.id === 'rooftop-telescope').found).toBe(false);
  });
});
