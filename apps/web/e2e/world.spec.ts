import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '../../../tests/e2e/fixtures';

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
    // The list collapses the map, and change detection paints the live region
    // on the next frame. Press the region itself so End and Home still move it.
    const region = page.locator('[role="region"][aria-label="World"]');
    const live = page.locator('.world-live');
    await expect(live).toHaveText(/2026-10-12/);
    await region.focus();
    await region.press('End');
    await expect(live).toHaveText('Town');
    await region.press('Home');
    await expect(live).not.toHaveText('Town');
    await expect(live).not.toHaveText('');
  });

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
