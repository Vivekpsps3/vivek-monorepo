import { expect, test, type Page } from '@playwright/test';

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
    const afterEnd = await page.evaluate(() => {
      const region = document.querySelector('[role="region"][aria-label="World"]');
      region?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
      return new Promise<string>(resolve => {
        queueMicrotask(() => resolve(document.querySelector('.world-live')?.textContent?.trim() ?? ''));
      });
    });
    expect(afterEnd).toBe('Town');
    const afterHome = await page.evaluate(() => {
      const region = document.querySelector('[role="region"][aria-label="World"]');
      region?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
      return new Promise<string>(resolve => {
        queueMicrotask(() => resolve(document.querySelector('.world-live')?.textContent?.trim() ?? ''));
      });
    });
    expect(afterHome).not.toBe('Town');
    expect(afterHome.length).toBeGreaterThan(0);
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
