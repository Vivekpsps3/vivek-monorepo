import { generateChunk, normalizeWeek, worldSeed } from '../src/app/world/engine';
import { engineWeek } from '../src/app/world/logic/engine-week';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Locator, type Page } from '../../../tests/e2e/fixtures';

// The town project sets reducedMotion: 'reduce' and America/Los_Angeles.
//
// Shell and auth paths observed from the app shell (apps/web/src/index.html
// and SessionService), recorded here so the allowlist stays explainable:
//   /town/world
//   / and /index.html
//   /workspace-icon.ico?v=2
//   /workspace-icon.svg?v=2
//   /workspace-touch-icon.png?v=2
//   /favicon.ico, /favicon.svg, /apple-touch-icon.png (browser defaults)
//   /version.json (release freshness, only when the release meta tag exists)
//   /api/auth/me
//   hashed /<file>.js, /<file>.css, and source maps
// World itself may also request /api/world, /api/town, /api/world/concepts,
// /town/<name>.svg, and /world/<name>.svg.

test.describe('World explorer', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });

  test.beforeEach(async ({ request }) => {
    expect((await request.post('/e2e/reset?seed=pixels')).ok()).toBeTruthy();
  });

  function watch(page: Page): { urls: string[]; unexpected: string[] } {
    const urls: string[] = [];
    const unexpected: string[] = [];
    page.on('request', request => {
      const raw = request.url();
      if (raw.startsWith('data:') || raw.startsWith('blob:')) return;
      const url = new URL(raw);
      urls.push(`${url.pathname}${url.search}`);
      const here = page.url();
      const origin = here && here !== 'about:blank' ? new URL(here).origin : url.origin;
      if (url.origin !== origin || !allowedPath(url.pathname)) unexpected.push(raw);
    });
    return { urls, unexpected };
  }

  test('leaves World and opens one controller again', async ({ page }) => {
    await page.goto('/town/world?week=2026-10-12');
    const world = page.locator('app-world');
    await expect(world).toHaveCount(1);
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page).toHaveURL(/\/town\/world\?week=2026-10-12$/);
    await page.goto('/town');
    await expect(page.locator('app-world')).toHaveCount(0);
    await expect(page.getByRole('main')).toHaveCount(1);
    const explore = page.getByRole('link', { name: 'Explore the world' });
    await explore.click();
    await expect(page).toHaveURL(/\/town\/world(?:\?|$)/);
    await expect(page.locator('app-world')).toHaveCount(1);
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1, name: 'World' })).toBeVisible();
    const region = page.locator('[role="region"][aria-label="World"]');
    const live = page.locator('.world-live');
    await expect(page.getByRole('button', { name: 'Previous week', exact: true })).toBeEnabled();
    await region.focus();
    await region.press('End');
    await expect(live).toHaveText('Town');
    await region.press('Home');
    await expect(live).not.toHaveText('Town');
    await page.goBack();
    await expect(page.locator('app-world')).toHaveCount(1);
    await page.goBack();
    await expect(page.locator('app-world')).toHaveCount(0);
    await page.goForward();
    await expect(page.locator('app-world')).toHaveCount(1);
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1, name: 'World' })).toBeVisible();
  });

  test('keeps the week query and stays on the allowlist', async ({ page }) => {
    const seen = watch(page);
    await page.goto('/town/world?week=2026-10-12');
    await expect(page.getByText('Arrow keys move a day')).toBeVisible();
    await expect(page).toHaveURL(/\/town\/world\?week=2026-10-12$/);
    expect(seen.unexpected, seen.urls.join('\n')).toEqual([]);
    await page.reload();
    await expect(page).toHaveURL(/\/town\/world\?week=2026-10-12$/);
    await expect(page.getByText('Arrow keys move a day')).toBeVisible();
    expect(seen.unexpected, seen.urls.join('\n')).toEqual([]);
  });

  test('reduced motion prefers the list and jumps without a transition', async ({ page }) => {
    await page.goto('/town/world?week=2026-10-12');
    const world = page.locator('app-world');
    await expect(world).toHaveAttribute('data-view', 'list');
    await expect(page.getByText('Reduced motion is on, so World opens on the list.')).toBeVisible();
    // The list offers a visible keyboard explorer as the canvas alternative.
    // Wait for loading to finish before sending navigation keys.
    const region = page.locator('[role="region"][aria-label="World"]');
    const live = page.locator('.world-live');
    await expect(live).toHaveText(/2026-10-12/);
    await expect(page.getByRole('button', { name: 'Previous week', exact: true })).toBeEnabled();
    await region.focus();
    await region.press('End');
    await expect(live).toHaveText('Town');
    await region.press('Home');
    await expect(live).not.toHaveText('Town');
    await expect(live).not.toHaveText('');
  });

  for (const width of [390, 1280]) {
    for (const theme of ['light', 'dark'] as const) {
      test(`week directions at ${width} ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
        await page.goto('/town/world?week=2026-10-12');
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        const previous = page.getByRole('button', { name: 'Previous week', exact: true });
        const next = page.getByRole('button', { name: 'Next week', exact: true });
        await expect(previous).toHaveText('Previous week');
        await expect(next).toHaveText('Next week');
        await expect(previous).toBeVisible();
        await expect(next).toBeVisible();
        await expect(previous).toBeEnabled();
        await previous.focus();
        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(/week=2026-10-05$/);
        await expect(page.getByLabel('Jump to date')).toHaveValue('2026-10-05');
        await next.click();
        await expect(page).toHaveURL(/week=2026-10-12$/);
        await expect(page.getByLabel('Jump to date')).toHaveValue('2026-10-12');
        await page.reload();
        await expect(page.getByLabel('Jump to date')).toHaveValue('2026-10-12');
        await expect(previous).toHaveText('Previous week');
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      });
    }
  }

  test('390px viewport does not scroll sideways', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/town/world?week=2026-10-12');
    await expect(page.locator('app-world')).toBeVisible();
    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      return root.scrollWidth - root.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('Town and World landmarks', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });
  test.beforeEach(async ({ request }) => {
    expect((await request.post('/e2e/reset?seed=pixels')).ok()).toBeTruthy();
  });

  for (const width of [390, 1280]) {
    for (const theme of ['light', 'dark'] as const) {
      for (const state of ['loading', 'ready', 'error'] as const) {
        test(`Town ${state} at ${width} ${theme}`, async ({ page }) => {
          await showShell(page, width, theme);
          if (state === 'loading') await holdGets(page, '/api/town');
          if (state === 'error') await failGets(page, '/api/town');
          try {
            await keyboardOpenApp(page, 'Town', width);
            const heading = page.getByRole('main').getByRole('heading', { level: 1 });
            if (state === 'ready') {
              const body = await (await page.request.get('/api/town?tz=America%2FLos_Angeles')).json();
              await expect(heading).toHaveText(body.town.name);
              await expect(page.getByRole('link', { name: 'Explore the world' })).toBeVisible();
            } else {
              await expect(heading).toHaveText('Town');
              if (state === 'loading') await expect(page.getByRole('status', { name: 'Loading Town' })).toBeVisible();
              else await expect(page.getByText('Town is unavailable right now.')).toBeVisible();
            }
            await expect(heading).toBeFocused();
            await expectPageLandmarks(page, state === 'ready' ? await townName(page) : 'Town');
            if (state === 'ready') await holdFocus(page.getByRole('link', { name: 'Explore the world' }));
            else if (state === 'error') await holdFocus(page.getByRole('button', { name: 'Retry' }));
            else await holdFocus(heading);
            if (state === 'ready' && width === 1280 && theme === 'light') await keepDialogFocus(page);
          } finally {
            await releaseHeld(page);
          }
        });

        test(`World ${state} at ${width} ${theme}`, async ({ page }) => {
          await showShell(page, width, theme);
          await keyboardOpenApp(page, 'Town', width);
          await expect(page.getByRole('link', { name: 'Explore the world' })).toBeVisible();
          if (state === 'loading') await holdGets(page, '/api/world');
          if (state === 'error') await failGets(page, '/api/world');
          try {
            const explore = page.getByRole('link', { name: 'Explore the world' });
            await explore.focus();
            await page.keyboard.press('Enter');
            const heading = page.getByRole('main').getByRole('heading', { level: 1 });
            await expect(heading).toHaveText('World');
            await expect(heading).toBeFocused();
            if (state === 'loading') await expect(page.getByText('Loading…')).toBeVisible();
            const worldAlert = page.locator('.world-banner[role="alert"]');
            if (state === 'error') await expect(worldAlert).toContainText('World is unavailable right now.');
            if (state === 'ready') {
              await expect(page.getByText('Reduced motion is on, so World opens on the list.')).toBeVisible();
            }
            await expectPageLandmarks(page, 'World');
            if (state === 'error') await holdFocus(worldAlert.getByRole('button', { name: 'Retry' }));
            else await holdFocus(page.getByLabel('Jump to date'));
          } finally {
            await releaseHeld(page);
          }
        });
      }
    }
  }
});

async function showShell(page: Page, width: number, theme: 'light' | 'dark'): Promise<void> {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
  await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
  await page.goto('/pixels?year=2026');
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await expect(page.getByRole('heading', { level: 1, name: 'Pixels' })).toBeVisible();
}

async function keyboardOpenApp(page: Page, name: string, width: number): Promise<void> {
  if (width <= 640) {
    const toggle = page.locator('.app-switcher__toggle');
    await toggle.focus();
    await page.keyboard.press('Enter');
    const link = page.locator('#app-switcher-menu').getByRole('link', { name, exact: true });
    await link.focus();
    await page.keyboard.press('Enter');
    return;
  }
  const link = page.locator('nav.app-switcher__bar').getByRole('link', { name, exact: true });
  await link.focus();
  await page.keyboard.press('Enter');
}

async function townName(page: Page): Promise<string> {
  const body = await (await page.request.get('/api/town?tz=America%2FLos_Angeles')).json();
  return body.town.name as string;
}

async function expectPageLandmarks(page: Page, heading: string): Promise<void> {
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.getByRole('banner')).toHaveCount(1);
  await expect(page.locator('header.suite-header')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(heading);
  const scan = await new AxeBuilder({ page }).analyze();
  const landmark = scan.violations.filter(item =>
    item.id.startsWith('landmark-') || item.id === 'region' || item.id === 'page-has-heading-one');
  expect(landmark).toEqual([]);
}

async function holdFocus(locator: Locator): Promise<void> {
  await locator.focus();
  await expect(locator).toBeFocused();
  await locator.page().waitForTimeout(500);
  await expect(locator).toBeFocused();
  await expect(locator).not.toHaveAttribute('id', 'workspace-content');
}

async function keepDialogFocus(page: Page): Promise<void> {
  const opener = page.getByRole('button', { name: /Choose a first habit|New habit/ }).first();
  await opener.focus();
  await page.keyboard.press('Enter');
  const field = page.getByRole('textbox', { name: 'Name' });
  await expect(field).toBeFocused();
  await page.waitForTimeout(500);
  await expect(field).toBeFocused();
}

const held: WeakMap<Page, Array<() => void>> = new WeakMap();

async function holdGets(page: Page, pathname: string): Promise<void> {
  let release = (): void => undefined;
  const gate = new Promise<void>(resolve => { release = resolve; });
  held.set(page, [...(held.get(page) ?? []), release]);
  await page.route(url => new URL(url).pathname === pathname, async route => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await gate;
    if (!route.request().url()) return;
    await route.continue().catch(() => undefined);
  });
}

async function failGets(page: Page, pathname: string): Promise<void> {
  await page.route(url => new URL(url).pathname === pathname, async route => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
  });
}

async function releaseHeld(page: Page): Promise<void> {
  for (const release of held.get(page) ?? []) release();
  held.delete(page);
}

function allowedPath(pathname: string): boolean {
  if (pathname === '/' || pathname === '/index.html' || pathname === '/town/world') return true;
  if (pathname === '/version.json' || pathname === '/favicon.ico' || pathname === '/favicon.svg') return true;
  if (pathname === '/workspace-touch-icon.png' || pathname === '/apple-touch-icon.png') return true;
  if (/^\/workspace-icon\.(ico|svg)$/.test(pathname)) return true;
  if (/^\/[^/]+\.(?:js|css|map)$/.test(pathname)) return true;
  if (pathname === '/api/auth/me' || pathname === '/api/auth/csrf' || pathname === '/api/auth/session') return true;
  if (pathname === '/api/world' || pathname === '/api/town' || pathname === '/api/world/concepts') return true;
  if (/^\/town\/[^/]+\.svg$/.test(pathname)) return true;
  if (/^\/world\/[^/]+\.svg$/.test(pathname)) return true;
  return false;
}

test.describe('World dated landscape and inspection', () => {
  const meta = { today: '2026-11-04', current_week: '2026-11-02', start_week: '2025-12-29', version: 1 };
  const week = {
    week: '2026-10-19',
    trips: [{ id: 15, title: 'Coastal trail', start: '2026-10-19', end: '2026-10-22', place: { label: 'Oregon', lat_e2: 4400 } }],
    finished: [{ entry_id: 21, kind: 'book' as const, title: 'Tide Almanac', on: '2026-10-21' }],
    habits: [{ habit_id: 31, name: 'Morning walk', style: 'garden' as const, archived: false, days: ['2026-10-21', '2026-10-23'] }],
    concepts: [{ id: 41, name: 'Reading the tides', on: '2026-10-21' }, { id: 42, name: 'Moon phases', on: '2026-10-21' }],
  };
  test.beforeEach(async ({ request, page }) => {
    expect((await request.post('/e2e/reset?seed=pixels')).ok()).toBeTruthy();
    await page.route(url => url.pathname === '/api/world', async route => {
      const from = new URL(route.request().url()).searchParams.get('from');
      const to = new URL(route.request().url()).searchParams.get('to');
      const weeks = (!from || week.week >= from) && (!to || week.week <= to) ? [week] : [];
      await route.fulfill({ json: { meta, weeks } });
    });
  });

  for (const width of [320, 390, 1280]) {
    for (const theme of ['light', 'dark'] as const) {
      test(`World map and inspector reflow accessibly at ${width}px in ${theme}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
        await page.goto('/town/world?week=2026-10-19&day=2026-10-21');
        await expect(page.getByRole('button', { name: 'Previous week', exact: true })).toBeEnabled();
        await page.getByRole('button', { name: 'Map', exact: true }).click();
        await page.getByRole('list', { name: 'Recorded items for this day' }).getByRole('button', { name: /Tide Almanac/ }).click();
        await expect(page.getByRole('article', { name: 'Selected object' })).toContainText('Tide Almanac');
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
        expect((await new AxeBuilder({ page }).include('app-world').analyze()).violations).toEqual([]);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: testInfo.outputPath(`world-${width}-${theme}.png`), fullPage: true });
        await page.setViewportSize({ width: width === 1280 ? 390 : 1280, height: 900 });
        await expect(page.getByLabel('Jump to date')).toHaveValue('2026-10-21');
        await expect(page.getByRole('article', { name: 'Selected object' })).toContainText('Tide Almanac');
      });
    }
  }

  test('restores an exact older civil date, reloads it, and follows selection history', async ({ page }) => {
    const ranges: URL[] = [];
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.pathname === '/api/world') ranges.push(url);
    });
    await page.goto('/town/world?week=2025-12-29&day=2025-12-31');
    await expect(page.getByLabel('Jump to date')).toHaveValue('2025-12-31');
    await expect(page.locator('.world-panel h2')).toHaveText('Wednesday, December 31, 2025');
    expect(ranges.length).toBeGreaterThan(1);
    for (const range of ranges.filter(url => url.searchParams.has('from'))) {
      expect((Date.parse(range.searchParams.get('to')!) - Date.parse(range.searchParams.get('from')!)) / 86_400_000).toBeLessThanOrEqual(175);
    }
    await page.getByLabel('Jump to date').fill('2026-10-21');
    await page.getByLabel('Jump to date').dispatchEvent('change');
    await expect(page.locator('.world-panel h2')).toHaveText('Wednesday, October 21, 2026');
    await page.goBack();
    await expect(page.getByLabel('Jump to date')).toHaveValue('2025-12-31');
    await page.goForward();
    await expect(page.getByLabel('Jump to date')).toHaveValue('2026-10-21');
    await page.reload();
    await expect(page.locator('.world-panel h2')).toHaveText('Wednesday, October 21, 2026');
    await expect(page.getByRole('link', { name: 'See this day in Pixels' })).toHaveAttribute('href', '/pixels?year=2026&day=2026-10-21');
  });

  test('shows dated facts, source explanations and exact supported source links by keyboard', async ({ page }) => {
    await page.goto('/town/world?week=2026-10-19&day=2026-10-21');
    const items = page.getByRole('list', { name: 'Recorded items for this day' });
    await expect(items.getByRole('listitem')).toHaveCount(5);
    const book = items.getByRole('button', { name: /Tide Almanac/ });
    await book.focus();
    await book.press('Enter');
    const inspector = page.getByRole('article', { name: 'Selected object' });
    await expect(inspector).toContainText('recorded completion in Media');
    await expect(inspector.getByRole('link', { name: 'Open in Media' })).toHaveAttribute('href', '/media/item/21');
    await expect(page.locator('.world-panel')).toBeFocused();
    await items.getByRole('button', { name: /Coastal trail/ }).click();
    await expect(inspector).toContainText('Oregon');
    await expect(inspector.getByRole('link', { name: 'Open in Travel' })).toHaveAttribute('href', '/travel/trips/15?day=2026-10-21');
    await page.getByRole('button', { name: /Friday, October 23, 2026. 1 recorded item$/ }).click();
    await expect(items.getByRole('listitem')).toHaveCount(1);
    await expect(items).toContainText('Morning walk');
  });

  for (const width of [390, 1280]) {
    test(`picks overlapping painted objects at ${width}px, and a drag or cancelled touch never activates`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/town/world?week=2026-10-19&day=2026-10-21');
      await expect(page.getByRole('button', { name: 'Previous week', exact: true })).toBeEnabled();
      await page.getByRole('button', { name: 'Map', exact: true }).click();
      const user = await (await page.request.get('/api/auth/me')).json();
      const chunk = generateChunk(worldSeed(user.user.id), normalizeWeek(engineWeek(week)));
      const structure = chunk.structures[0];
      const stage = page.locator('.world-stage');
      const box = (await stage.boundingBox())!;
      const scale = Math.max(10, Math.min(18, Math.floor(box.width / 56)));
      // The selected Wednesday is centered; the garden and second prop overlap.
      const x = box.x + box.width / 2 + (structure.x + 1 - 20) * scale;
      const y = box.y + (chunk.heights[structure.x] - 1) * scale;
      await page.mouse.click(x, y);
      const chooser = page.getByRole('group', { name: 'Choose an object' });
      await expect(chooser).toBeVisible();
      await chooser.getByRole('button', { name: /Morning walk/ }).click();
      await expect(page.getByRole('article', { name: 'Selected object' })).toContainText('recorded habit check-ins');
      await page.getByRole('button', { name: /Wednesday, October 21, 2026. 5 recorded items$/ }).click();
      await expect(page.getByRole('article', { name: 'Selected object' })).toHaveCount(0);
      await stage.scrollIntoViewIfNeeded();
      const dragBox = (await stage.boundingBox())!;
      const dragX = dragBox.x + dragBox.width / 2;
      const dragY = dragBox.y + dragBox.height / 2;
      await page.mouse.move(dragX, dragY);
      await page.mouse.down();
      await page.mouse.move(dragX + 70, dragY, { steps: 5 });
      await page.mouse.up();
      await expect(page.getByRole('article', { name: 'Selected object' })).toHaveCount(0);
      await expect(chooser).toHaveCount(0);
      await stage.dispatchEvent('pointerdown', { pointerId: 7, pointerType: 'touch', button: 0, clientX: x, clientY: y });
      await stage.dispatchEvent('pointercancel', { pointerId: 7, pointerType: 'touch', button: 0, clientX: x, clientY: y });
      await expect(chooser).toHaveCount(0);
      await expect(page.getByRole('article', { name: 'Selected object' })).toHaveCount(0);
    });
  }

  test('keeps quiet terrain, future horizon, overlay and source failure distinct', async ({ page }) => {
    await page.goto('/town/world?week=2026-11-02&day=2026-11-03');
    await expect(page.locator('.world-panel')).toContainText('No recorded activity');
    await expect(page.locator('.world-panel')).toContainText('nothing about how the day was lived');
    await page.getByRole('button', { name: 'Map', exact: true }).click();
    await expect(page.locator('canvas')).toBeVisible();
    await page.getByRole('button', { name: 'Activity markers', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Activity markers', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('button', { name: /Friday, November 6, 2026/ }).click();
    await expect(page.locator('.world-panel')).toContainText('On the horizon');
    await page.route(url => url.pathname === '/api/world', route => route.fulfill({ status: 503, json: {} }));
    await page.reload();
    await expect(page.locator('.world-banner[role="alert"]')).toContainText('World is unavailable');
    await expect(page.locator('.world-quiet')).toHaveCount(0);
  });
});

test('World learning saves through the study and undo retracts the dated beacon', async ({ page, request }) => {
  expect((await request.post('/e2e/reset?seed=pixels')).ok()).toBeTruthy();
  const town = await (await request.get('/api/town?tz=America/Los_Angeles')).json() as { town: { today: string } };
  const today = town.town.today;
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('suite-theme', 'light'));
  await page.goto(`/town/world?day=${today}`);
  await expect(page.getByRole('button', { name: 'Previous week', exact: true })).toBeEnabled();
  // The editor lives on the study route. Returning here loads the saved concept.
  await page.getByRole('link', { name: 'Concepts', exact: true }).click();
  await expect(page).toHaveURL(/\/town\/library\/study$/);
  await page.getByRole('button', { name: 'Add a concept', exact: true }).click();
  const study = page.locator('app-library-study');
  await study.getByLabel('Name', { exact: true }).fill('A tide worth remembering');
  await study.getByLabel('Note', { exact: true }).fill('A learning note saved through the real source.');
  await study.locator('#concept-understood').fill(today);
  await study.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(study.locator('form')).toHaveCount(0);
  await study.getByRole('tab', { name: 'Understood', exact: true }).click();
  const created = study.locator('article').filter({ has: page.getByRole('heading', { name: 'A tide worth remembering', exact: true }) });
  await expect(created).toBeVisible();
  const conceptDomId = await created.getAttribute('id');
  expect(conceptDomId).toMatch(/^concept-\d+$/);
  const conceptId = conceptDomId!.slice('concept-'.length);
  await page.goBack();
  const items = page.getByRole('list', { name: 'Recorded items for this day' });
  await expect(items).toContainText('A tide worth remembering');
  await items.getByRole('button', { name: /A tide worth remembering/ }).click();
  const open = page.getByRole('link', { name: 'Open concept', exact: true });
  await expect(open).toHaveAttribute('href', `/town/library/study/${conceptId}`);
  await open.click();
  const card = page.locator(`#concept-${conceptId}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Study' })).toBeFocused();
  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  await study.getByLabel('Name', { exact: true }).fill('Understanding the tide');
  await study.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(card).toBeFocused();
  await expect(card.getByRole('heading', { name: 'Understanding the tide', exact: true })).toBeVisible();
  await page.goBack();
  await expect(items).toContainText('Understanding the tide');
  await items.getByRole('button', { name: /Understanding the tide/ }).click();
  await page.getByRole('link', { name: 'Open concept', exact: true }).click();
  await page.locator(`#concept-${conceptId}`).getByRole('button', { name: 'Undo', exact: true }).click();
  await page.goBack();
  await expect(items.getByRole('button', { name: /Understanding the tide/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Previous week', exact: true })).toBeEnabled();
  await page.reload();
  await expect(page.getByLabel('Jump to date')).toHaveValue(today);
  await expect(page.getByRole('button', { name: 'Previous week', exact: true })).toBeEnabled();
  await expect(items.getByRole('button', { name: /Understanding the tide/ })).toHaveCount(0);
});

interface StudyConcept {
  id: number;
  name: string;
  note: string | null;
  source: string | null;
  understood_on: string | null;
  archived: boolean;
}

const csrf = { 'X-CSRF-Token': 'synthetic-csrf' };

async function atLeast44(control: Locator): Promise<void> {
  const box = await control.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}

async function ownerConcept(request: APIRequestContext): Promise<StudyConcept> {
  const rows = await (await request.get('/api/world/concepts')).json() as StudyConcept[];
  const owner = rows.find(row => row.name === 'Synthetic concept');
  expect(owner).toBeTruthy();
  return owner!;
}

async function paintStudy(page: Page, width: number, height: number, theme: 'light' | 'dark'): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
}

test.describe('Library study', () => {
  test.beforeEach(async ({ request }) => {
    expect((await request.post('/e2e/reset?seed=pixels-facts')).ok()).toBeTruthy();
  });

  test('keeps an old concept id, note, source, and understood date at 1280 light', async ({ page, request }) => {
    const owner = await ownerConcept(request);
    await paintStudy(page, 1280, 800, 'light');
    await page.goto(`/town/library/study/${owner.id}`);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    const study = page.locator('app-library-study');
    await expect(study.getByRole('heading', { level: 1, name: 'Study' })).toBeVisible();
    const card = page.locator(`#concept-${owner.id}`);
    await expect(card).toContainText('Synthetic concept');
    await expect(card).toContainText('synthetic private note');
    await expect(card).toContainText('2026-08-15');
    await expect(study.getByRole('heading', { level: 1, name: 'Study' })).toBeFocused();
    const hall = study.getByRole('link', { name: 'Reading Hall', exact: true });
    await atLeast44(hall);
    await atLeast44(study.getByRole('tab', { name: 'Understood', exact: true }));
    const edit = card.getByRole('button', { name: 'Edit', exact: true });
    await atLeast44(edit);
    await edit.focus();
    await page.keyboard.press('Enter');
    await study.getByLabel('Note', { exact: true }).fill('A dated annotation kept after editing.');
    await study.getByLabel('Source', { exact: true }).fill('margin note');
    const save = study.getByRole('button', { name: 'Save', exact: true });
    await atLeast44(save);
    await save.focus();
    await page.keyboard.press('Enter');
    await expect(card).toBeFocused();
    await expect(card).toContainText('A dated annotation kept after editing.');
    await expect(card).toContainText('margin note');
    await expect(card).toContainText('2026-08-15');
    await page.reload();
    await expect(card).toContainText('Synthetic concept');
    await expect(card).toContainText('A dated annotation kept after editing.');
    await expect(card).toContainText('margin note');
    await expect(card).toContainText('2026-08-15');
    expect(await study.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
    const scan = await new AxeBuilder({ page }).include('app-library-study').analyze();
    expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
    await page.goto('/town/world?day=2026-08-15');
    const items = page.getByRole('list', { name: 'Recorded items for this day' });
    await expect(items).toContainText('Synthetic concept');
    await items.getByRole('button', { name: /Synthetic concept/ }).click();
    await expect(page.getByRole('link', { name: 'Open concept', exact: true })).toHaveAttribute('href', `/town/library/study/${owner.id}`);
    await expect(page.getByRole('button', { name: 'Previous week', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Next week', exact: true })).toBeVisible();
    await page.goto('/pixels?year=2026&day=2026-08-15');
    await expect(page.getByRole('heading', { name: 'Synthetic concept' })).toBeVisible();
  });

  test('keeps unknown, archived, and other-owner boundaries', async ({ page, request }) => {
    const owner = await ownerConcept(request);
    const foreignId = owner.id + 1;
    await paintStudy(page, 1280, 800, 'light');
    await page.goto(`/town/library/study/${owner.id}`);
    await page.goto('/town/library/study/999999');
    const study = page.locator('app-library-study');
    await expect(page.locator('#concept-missing')).toHaveText("That concept doesn't exist.");
    await expect(study).not.toContainText('Foreign concept');
    await expect(study).not.toContainText('foreign private note');
    await page.goto(`/town/library/study/${foreignId}`);
    await expect(page.locator('#concept-missing')).toHaveText("That concept doesn't exist.");
    const hidden = await study.innerText();
    expect(hidden).not.toContain('Foreign concept');
    expect(hidden).not.toContain('foreign private note');
    const denied = await page.request.patch(`/api/world/concepts/${foreignId}`, {
      headers: csrf,
      data: { note: 'should not land', tz: 'America/Los_Angeles' },
    });
    expect(denied.status()).toBe(404);
    const archived = await page.request.patch(`/api/world/concepts/${owner.id}`, {
      headers: csrf,
      data: { archived: true, tz: 'America/Los_Angeles' },
    });
    expect(archived.ok(), await archived.text()).toBeTruthy();
    const active = await (await page.request.get('/api/world/concepts')).json() as StudyConcept[];
    expect(active.some(row => row.id === owner.id || row.name === 'Foreign concept')).toBe(false);
    const shelf = await (await page.request.get('/api/world/concepts?archived=1')).json() as StudyConcept[];
    const kept = shelf.find(row => row.id === owner.id);
    expect(kept?.note).toBe('synthetic private note');
    expect(kept?.understood_on).toBe('2026-08-15');
    expect(kept?.archived).toBe(true);
    await page.goto(`/town/library/study/${owner.id}`);
    await expect(page.getByRole('tab', { name: 'Archived', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator(`#concept-${owner.id}`)).toContainText('synthetic private note');
    await expect(page.locator(`#concept-${owner.id}`)).toContainText('2026-08-15');
    await expect(page.locator('#concept-missing')).toHaveCount(0);
    await page.getByRole('tab', { name: 'Not yet', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Synthetic concept' })).toHaveCount(0);
    await page.goto('/town/world?day=2026-08-15&week=2026-08-10');
    await expect(page.getByRole('list', { name: 'Recorded items for this day' })).toContainText('Synthetic concept');
    await expect(page.getByRole('button', { name: 'Previous week', exact: true })).toBeEnabled();
    await page.goto('/pixels?year=2026&day=2026-08-15');
    await expect(page.getByRole('heading', { name: 'Synthetic concept' })).toHaveCount(0);
  });

  test('Reading Hall opens the study list', async ({ page }) => {
    await paintStudy(page, 390, 844, 'light');
    await page.goto('/town/library');
    const open = page.getByRole('link', { name: 'Open study', exact: true });
    await expect(open).toBeVisible();
    await atLeast44(open);
    await open.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/town\/library\/study$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Study' })).toBeVisible();
    await expect(page.getByText('Saved concepts keep their notes, sources, understood dates, and archive state.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add a concept', exact: true })).toBeVisible();
    expect(await page.locator('body').innerText()).not.toMatch(/Obsidian|import notes/i);
  });

  for (const [width, height, theme] of [[390, 844, 'light'], [1280, 800, 'dark']] as const) {
    test(`study surface stays within the viewport at ${width} ${theme}`, async ({ page, request }, info) => {
      const owner = await ownerConcept(request);
      await paintStudy(page, width, height, theme);
      await page.goto(`/town/library/study/${owner.id}`);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const study = page.locator('app-library-study');
      await expect(study.getByRole('heading', { name: 'Synthetic concept' })).toBeVisible();
      await expect(study).toContainText('synthetic private note');
      await expect(study).toContainText('2026-08-15');
      await atLeast44(study.getByRole('tab', { name: 'Archived', exact: true }));
      await atLeast44(study.getByRole('link', { name: 'Town', exact: true }));
      expect(await study.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
      const scan = await new AxeBuilder({ page }).include('app-library-study').analyze();
      expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
      await info.attach(`study-${width}-${theme}`, { body: await study.screenshot(), contentType: 'image/png' });
    });
  }
});

test.describe('Library study on a phone', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test('edits the dated annotation at 390 night with touch', async ({ page, request }) => {
    expect((await request.post('/e2e/reset?seed=pixels-facts')).ok()).toBeTruthy();
    const owner = await ownerConcept(request);
    await paintStudy(page, 390, 844, 'dark');
    await page.goto(`/town/library/study/${owner.id}`);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const study = page.locator('app-library-study');
    const card = page.locator(`#concept-${owner.id}`);
    await expect(card).toContainText('synthetic private note');
    await expect(card).toContainText('2026-08-15');
    const edit = card.getByRole('button', { name: 'Edit', exact: true });
    await atLeast44(edit);
    await edit.tap();
    await study.getByLabel('Note', { exact: true }).fill('A dated annotation kept after a touch edit.');
    await study.getByLabel('Source', { exact: true }).fill('phone margin');
    const save = study.getByRole('button', { name: 'Save', exact: true });
    await atLeast44(save);
    await save.tap();
    await expect(card).toContainText('A dated annotation kept after a touch edit.');
    await expect(card).toContainText('2026-08-15');
    await page.reload();
    await expect(card).toContainText('A dated annotation kept after a touch edit.');
    await expect(card).toContainText('phone margin');
    await expect(card).toContainText('2026-08-15');
    expect(await study.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
    const scan = await new AxeBuilder({ page }).include('app-library-study').analyze();
    expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
    await page.goto('/town/library/study/999999');
    await expect(page.locator('#concept-missing')).toHaveText("That concept doesn't exist.");
  });
});
