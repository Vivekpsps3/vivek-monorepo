import AxeBuilder from '@axe-core/playwright';
import { type Route } from '@playwright/test';
import { expect, test, type Page, type Request } from '../../../tests/e2e/fixtures';

const headers = { 'X-CSRF-Token': 'synthetic-csrf' };
const lifePaths = ['/media/api/summary', '/travel/api/memories', '/api/world/concepts'];

function lifeMutation(request: Request): boolean {
  if (request.method() === 'GET' || request.method() === 'HEAD') return false;
  const path = new URL(request.url()).pathname;
  return path.startsWith('/media/')
    || path.startsWith('/travel/')
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
    expect(response.ok()).toBeTruthy();
    return JSON.stringify(await response.json());
  }));
  return bodies;
}

test.describe('Optional chapter quests', () => {
  test.use({ timezoneId: 'America/Los_Angeles', hasTouch: true });
  test.beforeEach(async ({ request }) => {
    expect((await request.post('/e2e/reset?seed=town')).ok()).toBeTruthy();
  });

  for (const width of [390, 1280]) for (const theme of ['light', 'dark'] as const) {
    test(`${width} ${theme} records one step and one labeled sample`, async ({ page }, info) => {
      const touch = width === 390;
      const mutations: string[] = [];
      page.on('request', request => {
        if (lifeMutation(request)) mutations.push(`${request.method()} ${new URL(request.url()).pathname}`);
      });
      await page.setViewportSize({ width, height: touch ? 844 : 800 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.addInitScript(chosen => localStorage.setItem('suite-theme', chosen), theme);
      await page.goto('/town/hall');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const entrance = page.getByRole('link', { name: 'Optional quests', exact: true });
      const entranceBox = await entrance.boundingBox();
      expect(entranceBox?.width).toBeGreaterThanOrEqual(44);
      expect(entranceBox?.height).toBeGreaterThanOrEqual(44);
      await activate(page, entrance, touch);

      const quests = page.locator('app-town-quests');
      const record = quests.getByRole('button', { name: 'Record Enter Home', exact: true });
      await expect(record).toBeVisible();
      const beforeLife = await lifeSnapshot(page);
      const beforeTown = await (await page.request.get('/api/town?tz=America/Los_Angeles')).json();
      const recordBox = await record.boundingBox();
      expect(recordBox?.width).toBeGreaterThanOrEqual(44);
      expect(recordBox?.height).toBeGreaterThanOrEqual(44);
      await info.attach(`quests-${width}-${theme}`, { body: await page.screenshot(), contentType: 'image/png' });
      await activate(page, record, touch);
      const confirmation = quests.getByRole('heading', { name: 'Record Enter Home?' });
      await expect(confirmation).toBeFocused();
      const cancel = quests.getByRole('button', { name: 'Cancel', exact: true });
      const cancelBox = await cancel.boundingBox();
      expect(cancelBox?.height).toBeGreaterThanOrEqual(44);
      await info.attach(`confirm-${width}-${theme}`, { body: await page.screenshot(), contentType: 'image/png' });
      await activate(page, cancel, touch);
      await expect(record).toBeFocused();
      await activate(page, record, touch);
      await activate(page, quests.getByRole('button', { name: 'Confirm step', exact: true }), touch);
      await expect(quests.getByText('Recorded once.')).toBeFocused();
      const home = quests.locator('[data-quest="make-a-home"]');
      await expect(home).toHaveAttribute('data-completed', '1');
      await expect(quests.locator('main')).toHaveAttribute('data-revision', '1');
      await expect(home).toContainText('1 of 3');
      await expect(record).toHaveCount(0);

      const replay = await page.request.post('/api/town/quests/steps?tz=America/Los_Angeles', {
        headers,
        data: {
          quest_id: 'make-a-home',
          step_id: 'enter-home',
          action_id: 'make-a-home:enter-home',
          expected_revision: 0,
        },
      });
      expect(replay.status()).toBe(200);
      expect((await replay.json()).revision).toBe(1);
      await page.reload();
      await expect(home).toHaveAttribute('data-completed', '1');
      await page.goBack();
      await expect(page).toHaveURL(/\/town\/hall/);
      await page.goForward();
      await expect(home).toHaveAttribute('data-completed', '1');
      await expect(quests.locator('main')).toHaveAttribute('data-revision', '1');

      await activate(page, quests.getByRole('button', { name: 'Record Meet the librarian', exact: true }), touch);
      await activate(page, quests.getByRole('button', { name: 'Confirm step', exact: true }), touch);
      const sample = quests.getByRole('button', { name: 'Use Sample shelf item', exact: true });
      await expect(sample).toBeVisible();
      await expect(quests.getByText('The library is empty')).toBeVisible();
      await activate(page, sample, touch);
      await expect(quests.getByText('does not create a library, trip, or Health record')).toBeVisible();
      const posted = page.waitForRequest(request => request.method() === 'POST' && request.url().includes('/api/town/quests/steps'));
      await activate(page, quests.getByRole('button', { name: 'Confirm step', exact: true }), touch);
      const body = (await posted).postDataJSON() as { action_id: string };
      expect(body.action_id).toBe('find-your-shelves:inspect-saved:sample');
      expect(Object.keys(body).sort()).toEqual(['action_id', 'expected_revision', 'quest_id', 'step_id']);
      await expect(quests.locator('[data-quest="find-your-shelves"]')).toHaveAttribute('data-completed', '2');
      await expect(home).toHaveAttribute('data-completed', '1');
      await expect(quests.locator('main')).toHaveAttribute('data-revision', '3');

      const afterTown = await (await page.request.get('/api/town?tz=America/Los_Angeles')).json();
      expect(afterTown.town.xp).toBe(beforeTown.town.xp);
      const stamps = await (await page.request.get('/api/town/stamps')).json();
      expect(stamps.balance).toBe(0);
      expect(stamps.receipts).toEqual([]);
      expect(await lifeSnapshot(page)).toEqual(beforeLife);
      expect(mutations).toEqual([]);
      const text = await quests.innerText();
      expect(text).toContain('No deadline');
      expect(text).not.toMatch(/\bdue\b/i);
      expect(text.replaceAll('No deadline', '')).not.toMatch(/deadline/i);
      expect(await quests.evaluate(element => getComputedStyle(element).animationName)).toBe('none');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
      const scan = await new AxeBuilder({ page }).include('app-town-quests').analyze();
      expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
    });
  }

  test('a lost response keeps the confirmation and the retry records it once', async ({ page }) => {
    let failed = false;
    await page.route(/\/api\/town\/quests\/steps/, async route => {
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
    await page.goto('/town/quests');
    const quests = page.locator('app-town-quests');
    await quests.getByRole('button', { name: 'Record Enter Home', exact: true }).click();
    await quests.getByRole('button', { name: 'Confirm step', exact: true }).click();
    await expect(quests.getByRole('button', { name: 'Retry step', exact: true })).toBeVisible();
    await expect(quests.getByRole('heading', { name: 'Record Enter Home?' })).toBeVisible();
    await quests.getByRole('button', { name: 'Retry step', exact: true }).click();
    await expect(quests.locator('[data-quest="make-a-home"]')).toHaveAttribute('data-completed', '1');
    await expect(quests.locator('main')).toHaveAttribute('data-revision', '1');
    const replay = await page.request.post('/api/town/quests/steps', {
      headers,
      data: {
        quest_id: 'make-a-home', step_id: 'enter-home',
        action_id: 'make-a-home:enter-home', expected_revision: 1,
      },
    });
    expect(replay.status()).toBe(200);
    expect((await replay.json()).revision).toBe(1);
  });

  test('an unavailable journal is not an empty quest list', async ({ page }) => {
    await page.route(/\/api\/town\/quests(?:\?|$)/, async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
        return;
      }
      await route.continue();
    });
    await page.goto('/town/quests');
    const quests = page.locator('app-town-quests');
    await expect(quests.getByText('Optional quests are unavailable right now.')).toBeVisible();
    await expect(quests.getByText('0 of 3')).toHaveCount(0);
    await page.unroute(/\/api\/town\/quests(?:\?|$)/);
    await quests.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(quests.getByRole('button', { name: 'Record Enter Home', exact: true })).toBeVisible();
  });

  test('a ready library records the saved action without showing its title', async ({ page }) => {
    await page.route(/\/media\/api\/summary/, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          currently: [{ title: 'Sample book' }],
          recent_reviews: [],
          upcoming: [],
          next_episodes: [],
        }),
      });
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/town/quests');
    const quests = page.locator('app-town-quests');
    await quests.getByRole('button', { name: 'Record Meet the librarian', exact: true }).click();
    await quests.getByRole('button', { name: 'Confirm step', exact: true }).click();
    await expect(quests.getByText('Sample book')).toHaveCount(0);
    const posted = page.waitForRequest(request => request.method() === 'POST' && request.url().includes('/api/town/quests/steps'));
    await quests.getByRole('button', { name: 'Record Inspect a saved item', exact: true }).click();
    await quests.getByRole('button', { name: 'Confirm step', exact: true }).click();
    expect(((await posted).postDataJSON() as { action_id: string }).action_id).toBe('find-your-shelves:inspect-saved');
    await expect(quests.getByText('Sample book')).toHaveCount(0);
  });

  test('a locked library still offers the labeled sample', async ({ page }) => {
    await page.route(/\/media\/api\/summary/, async route => {
      await route.fulfill({ status: 403, contentType: 'application/json', body: '{"detail":"locked"}' });
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.addInitScript(() => localStorage.setItem('suite-theme', 'dark'));
    await page.goto('/town/quests');
    const quests = page.locator('app-town-quests');
    await quests.getByRole('button', { name: 'Record Meet the librarian', exact: true }).click();
    await quests.getByRole('button', { name: 'Confirm step', exact: true }).click();
    await expect(quests.getByText('The library is locked')).toBeVisible();
    await expect(quests.getByRole('button', { name: 'Use Sample shelf item', exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  async function record(page: Page, quests: ReturnType<Page['locator']>, name: string, touch: boolean): Promise<void> {
    await activate(page, quests.getByRole('button', { name, exact: true }), touch);
    const posted = page.waitForResponse(response => (
      response.url().includes('/api/town/quests/steps') && response.request().method() === 'POST'
    ));
    await activate(page, quests.getByRole('button', { name: 'Confirm step', exact: true }), touch);
    expect((await posted).ok()).toBeTruthy();
    await expect(quests.locator('#quest-notice')).toContainText('Recorded once.');
  }

  async function finishChapters(page: Page, quests: ReturnType<Page['locator']>, touch: boolean, sample: boolean): Promise<void> {
    const saved = sample
      ? ['Use Sample shelf item', 'Use Sample harbor trip', 'Use Sample memory']
      : ['Record Inspect a saved item', 'Record Inspect a saved trip', 'Record Inspect a saved memory'];
    const chapters: { id: string; keepsake: string; steps: string[] }[] = [
      { id: 'make-a-home', keepsake: 'paper-house postcard', steps: ['Record Enter Home', 'Record Place a starter item', 'Record Save the layout'] },
      { id: 'find-your-shelves', keepsake: 'library seal', steps: ['Record Meet the librarian', saved[0], 'Record Choose a shelf display'] },
      { id: 'across-the-harbor', keepsake: 'harbor postcard', steps: ['Record Meet the travel keeper', saved[1], 'Record Ring the model ferry bell'] },
      { id: 'a-place-to-play', keepsake: 'arcade pennant', steps: ['Record Visit the Arcade', 'Record Finish either game', 'Record Inspect its score'] },
      { id: 'light-the-square', keepsake: 'brass civic seal', steps: ['Record Meet the treasurer', 'Record Inspect the rules board', 'Record Place a lantern'] },
      { id: 'your-own-little-world', keepsake: 'night-sky print', steps: ['Record Meet the residents', 'Record Customize two rooms', saved[2]] },
    ];
    for (const [index, chapter] of chapters.entries()) {
      for (const name of chapter.steps) await record(page, quests, name, touch);
      const card = quests.locator(`[data-quest="${chapter.id}"]`);
      await expect(card.locator(`[data-keepsake]`)).toHaveText(chapter.keepsake);
      const stamps = await (await page.request.get('/api/town/stamps')).json();
      expect(stamps.balance).toBe((index + 1) * 10);
    }
  }

  for (const [width, theme, sample] of [[1280, 'light', true], [390, 'dark', false]] as const) {
    test(`${width} ${theme} finishes every chapter once for a ${sample ? 'empty' : 'populated'} account`, async ({ page }, info) => {
      test.setTimeout(90_000);
      const touch = width === 390;
      const mutations: string[] = [];
      page.on('request', request => {
        if (lifeMutation(request)) mutations.push(`${request.method()} ${new URL(request.url()).pathname}`);
      });
      if (!sample) {
        const fulfillGet = async (route: Route, body: unknown) => {
          if (route.request().method() !== 'GET') {
            await route.continue();
            return;
          }
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
        };
        await page.route(/\/media\/api\/summary/, route => fulfillGet(route, {
          currently: [{ title: 'Shelf Atlas' }], recent_reviews: [], upcoming: [], next_episodes: [],
        }));
        await page.route(/\/travel\/api\/memories/, route => fulfillGet(route, { total: 1 }));
        await page.route(/\/api\/world\/concepts/, route => fulfillGet(route, [{ name: 'Harbor' }]));
      }
      await page.setViewportSize({ width, height: touch ? 844 : 800 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.addInitScript(chosen => localStorage.setItem('suite-theme', chosen), theme);
      await page.goto('/town/quests');
      const quests = page.locator('app-town-quests');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(quests.getByText('Leaving does not expire a step or remove a reward.')).toBeVisible();
      const beforeTown = await (await page.request.get('/api/town?tz=America/Los_Angeles')).json();
      const beforeLife = await lifeSnapshot(page);
      await finishChapters(page, quests, touch, sample);
      await expect(quests.getByText('Labeled sample.')).toHaveCount(sample ? 3 : 0);
      if (!sample) await expect(quests.getByText('Shelf Atlas')).toHaveCount(0);
      const last = sample ? 'your-own-little-world:inspect-saved:sample' : 'your-own-little-world:inspect-saved';
      const replay = await page.request.post('/api/town/quests/steps?tz=America/Los_Angeles', {
        headers,
        data: {
          quest_id: 'your-own-little-world',
          step_id: 'inspect-saved',
          action_id: last,
          expected_revision: 1,
        },
      });
      expect(replay.status()).toBe(200);
      expect((await replay.json()).revision).toBe(18);
      const stamps = await (await page.request.get('/api/town/stamps')).json();
      expect(stamps.balance).toBe(60);
      expect(stamps.receipts).toHaveLength(6);
      await page.reload();
      await expect(quests.locator('[data-keepsake]')).toHaveCount(6);
      const returned = await quests.innerText();
      expect(returned).toContain('No deadline');
      expect(returned).not.toMatch(/expired|penalty|lost reward/i);
      expect(returned.replaceAll('No deadline', '')).not.toMatch(/deadline/i);
      await page.goto('/town');
      await page.getByRole('button', { name: 'Stamps', exact: true }).click();
      await expect(page.getByText('60 Stamps', { exact: true })).toBeVisible();
      await page.goto('/town/quests');
      await expect(quests.locator('[data-keepsake="night-sky-print"]')).toHaveText('night-sky print');
      const afterTown = await (await page.request.get('/api/town?tz=America/Los_Angeles')).json();
      expect(afterTown.town.xp).toBe(beforeTown.town.xp);
      expect(await lifeSnapshot(page)).toEqual(beforeLife);
      expect(mutations).toEqual([]);
      const buttons = quests.locator('button, a.action');
      const count = await buttons.count();
      for (let index = 0; index < count; index += 1) {
        const box = await buttons.nth(index).boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(44);
        expect(box?.height).toBeGreaterThanOrEqual(44);
      }
      expect(await quests.evaluate(element => getComputedStyle(element).animationName)).toBe('none');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
      const scan = await new AxeBuilder({ page }).include('app-town-quests').analyze();
      expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
      await info.attach(`chapters-${width}-${theme}`, { body: await page.screenshot(), contentType: 'image/png' });
    });
  }

  test('a lost finishing step does not grant the reward', async ({ page }) => {
    let failed = false;
    await page.route(/\/api\/town\/quests\/steps/, async route => {
      if (!failed && route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as { step_id?: string };
        if (body.step_id === 'save-layout') {
          failed = true;
          await route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ code: 'unavailable', message: 'Try again.', detail: 'Try again.', field_errors: null }),
          });
          return;
        }
      }
      await route.continue();
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/town/quests');
    const quests = page.locator('app-town-quests');
    await record(page, quests, 'Record Enter Home', false);
    await record(page, quests, 'Record Place a starter item', false);
    await quests.getByRole('button', { name: 'Record Save the layout', exact: true }).click();
    await quests.getByRole('button', { name: 'Confirm step', exact: true }).click();
    await expect(quests.getByRole('button', { name: 'Retry step', exact: true })).toBeVisible();
    await expect(quests.getByRole('heading', { name: 'Record Save the layout?' })).toBeVisible();
    await expect(quests.locator('[data-keepsake="paper-house-postcard"]')).toHaveCount(0);
    expect((await (await page.request.get('/api/town/stamps')).json()).balance).toBe(0);
    await quests.getByRole('button', { name: 'Retry step', exact: true }).click();
    await expect(quests.locator('[data-keepsake="paper-house-postcard"]')).toHaveText('paper-house postcard');
    expect((await (await page.request.get('/api/town/stamps')).json()).balance).toBe(10);
    const replay = await page.request.post('/api/town/quests/steps', {
      headers,
      data: {
        quest_id: 'make-a-home', step_id: 'save-layout',
        action_id: 'make-a-home:save-layout', expected_revision: 3,
      },
    });
    expect(replay.status()).toBe(200);
    expect((await (await page.request.get('/api/town/stamps')).json()).balance).toBe(10);
  });
});
