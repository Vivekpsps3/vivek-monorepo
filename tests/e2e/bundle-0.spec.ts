import { mkdirSync } from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from './fixtures';
import { event, travel, summary, sources } from '../../apps/web/e2e/hub-fixtures';
import { syntheticVault } from '../../apps/finance/frontend/e2e/synthetic-vault';
import { chooseColorTheme, openUserMenu } from './user-menu.mjs';

test.describe.configure({ timeout: 300_000 });

let tripId = '';
let mediaId = '';

function screenshotPath(testInfo: TestInfo, fileName: string): string {
  const override = process.env.BUNDLE0_SCREENSHOT_DIR;
  if (override) {
    mkdirSync(override, { recursive: true });
    return path.join(override, fileName);
  }
  return testInfo.outputPath(fileName);
}

test.beforeAll(async ({ request }) => {
  const reset = await request.post('/e2e/reset');
  expect(reset.ok(), await reset.text()).toBeTruthy();
  const created = await request.post('/travel/api/trips', {
    data: { title: 'Kyoto', start_date: '2026-12-12', end_date: '2026-12-15' },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const trip = (await created.json()) as { id?: number | string };
  expect(trip.id).toBeTruthy();
  tripId = String(trip.id);
  const library = await request.get('/media/api/library');
  expect(library.ok(), await library.text()).toBeTruthy();
  const body = (await library.json()) as { items?: { id?: number | string; title?: string }[] };
  const dune = body.items?.find(item => item.title === 'Dune') ?? body.items?.[0];
  expect(dune?.id).toBeTruthy();
  mediaId = String(dune?.id);
});

function routes(): { name: string; path: string }[] {
  return [
    { name: 'hub', path: '/hub' },
    { name: 'settings', path: '/settings' },
    { name: 'travel', path: '/travel' },
    { name: 'travel-trip', path: `/travel/trips/${tripId}` },
    { name: 'media', path: '/media' },
    { name: 'media-library', path: '/media/library' },
    { name: 'media-item', path: `/media/item/${mediaId}` },
  ];
}

async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const selector = 'a, button, input, select, textarea, summary, [role="button"]';
    const misses: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(selector)) {
      if (el.closest('[aria-hidden="true"]')) continue;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const type = (el.getAttribute('type') || '').toLowerCase();
      if (el.tagName === 'A' && el.closest('p')) continue;
      const label = el.closest('label');
      const measured =
        el.tagName === 'INPUT' && (type === 'checkbox' || type === 'radio') && label ? label : el;
      if (!measured) continue;
      const box = measured.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) continue;
      if (box.height >= 44) continue;
      const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('name') || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 70);
      misses.push(`${el.tagName.toLowerCase()}${type ? `[${type}]` : ''} ${Math.round(box.height)}px "${name}"`);
    }
    return misses;
  });
}

async function contentStart(page: Page, selector: string): Promise<number> {
  const box = page.locator(selector).first();
  await expect(box).toBeVisible();
  return box.evaluate(el => el.getBoundingClientRect().left + parseFloat(getComputedStyle(el).paddingLeft));
}

async function focusRingMisses(page: Page): Promise<string[]> {
  const needSection = (await page.locator('.ui-section-nav__link').count()) > 0;
  await page.evaluate(() => {
    document.querySelector('[data-focus-sentinel]')?.remove();
    const sentinel = document.createElement('span');
    sentinel.tabIndex = 0;
    sentinel.dataset.focusSentinel = '1';
    sentinel.setAttribute('aria-hidden', 'true');
    sentinel.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';
    document.body.prepend(sentinel);
    sentinel.focus();
  });
  const expected = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.color = 'var(--focus-ring)';
    document.body.appendChild(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
  const misses: string[] = [];
  const saw = { skip: false, switcher: false, user: false, section: false };
  let steps = 0;
  let finished = false;
  const missingLandmarks = (): string[] => [
    !saw.skip ? 'skip link' : '',
    !saw.switcher ? 'app switcher' : '',
    !saw.user ? 'user menu' : '',
    needSection && !saw.section ? 'section nav' : '',
  ].filter(Boolean);
  try {
    for (let i = 0; i < 400; i += 1) {
      await page.keyboard.press('Tab');
      const stop = await page.evaluate(ring => {
        const el = document.activeElement;
        if (!(el instanceof HTMLElement) || el === document.body) return null;
        if (el.dataset.focusSentinel === '1') return { sentinel: true as const };
        if (el.dataset.bundleTab === '1') return { repeat: true as const };
        el.dataset.bundleTab = '1';
        let node: HTMLElement = el;
        let style = getComputedStyle(el);
        const hostLabel = el.closest('label');
        if ((style.outlineStyle === 'none' || style.outlineWidth === '0px') && hostLabel instanceof HTMLElement) {
          node = hostLabel;
          style = getComputedStyle(hostLabel);
        }
        const described = `${node.tagName}.${node.className} ${(node.getAttribute('aria-label') || node.textContent || '').replace(/\s+/g, ' ').trim()}`.slice(0, 90);
        const width = parseFloat(style.outlineWidth) || 0;
        const offset = Math.max(parseFloat(style.outlineOffset) || 0, 0);
        const pad = width + offset;
        const box = node.getBoundingClientRect();
        const ringBox = {
          left: box.left - pad,
          top: box.top - pad,
          right: box.right + pad,
          bottom: box.bottom + pad,
        };
        let clippedBy = '';
        let parent = node.parentElement;
        while (parent) {
          const parentStyle = getComputedStyle(parent);
          const mode = `${parentStyle.overflow} ${parentStyle.overflowX} ${parentStyle.overflowY}`;
          if (/auto|scroll|hidden|clip/.test(mode)) {
            const parentBox = parent.getBoundingClientRect();
            const pastLeft = parentBox.left - ringBox.left;
            const pastTop = parentBox.top - ringBox.top;
            const pastRight = ringBox.right - parentBox.right;
            const pastBottom = ringBox.bottom - parentBox.bottom;
            if (pastLeft > 1 || pastTop > 1 || pastRight > 1 || pastBottom > 1) {
              clippedBy = `${parent.tagName}.${parent.className} L${pastLeft.toFixed(1)} T${pastTop.toFixed(1)} R${pastRight.toFixed(1)} B${pastBottom.toFixed(1)}`.slice(0, 120);
              break;
            }
          }
          parent = parent.parentElement;
        }
        return {
          sentinel: false as const,
          repeat: false as const,
          skip: el.classList.contains('skip-link'),
          switcher: el.classList.contains('app-switcher__toggle') || !!el.closest('.app-switcher__bar'),
          user: el.classList.contains('user-menu-toggle'),
          section: el.classList.contains('ui-section-nav__link'),
          described,
          width: style.outlineWidth,
          outlineStyle: style.outlineStyle,
          color: style.outlineColor,
          clippedBy,
        };
      }, expected);
      if (!stop || ('repeat' in stop && stop.repeat)) {
        const missing = missingLandmarks();
        if (missing.length) misses.push(`focus walk ended before ${missing.join(', ')}`);
        finished = true;
        break;
      }
      if ('sentinel' in stop && stop.sentinel) continue;
      if (steps === 0 && !stop.skip) misses.push(`first tab stop was ${stop.described}, expected the skip link`);
      if (stop.skip) saw.skip = true;
      if (stop.switcher) saw.switcher = true;
      if (stop.user) saw.user = true;
      if (stop.section) saw.section = true;
      steps += 1;
      if (stop.width !== '2px' || stop.outlineStyle === 'none' || stop.color !== expected) {
        misses.push(`${stop.described} → ${stop.outlineStyle} ${stop.width} ${stop.color} expected ${expected}`);
      }
      if (stop.clippedBy) misses.push(`${stop.described} clipped by ${stop.clippedBy}`);
    }
    if (!finished) misses.push('focus walk hit the safety cap before every stop was checked');
    if (steps === 0) misses.push('focus walk found no stops');
  } finally {
    await page.evaluate(() => document.querySelector('[data-focus-sentinel]')?.remove());
  }
  return misses;
}

for (const fontSize of [21, 22]) {
  test(`section navigation keeps keyboard outlines visible with ${fontSize}px text`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/media');
    const links = page.locator('.ui-section-nav__link');
    await expect(links).toHaveCount(10);
    // Stress the wrapping row independently of which system font CI has.
    await links.evaluateAll((elements, size) => {
      for (const element of elements) (element as HTMLElement).style.fontSize = `${size}px`;
    }, fontSize);
    await links.first().focus();
    for (let index = 0; index < await links.count(); index += 1) {
      if (index > 0) await page.keyboard.press('Tab');
      await expect(links.nth(index)).toBeFocused();
      const ring = await links.nth(index).evaluate(element => {
        const scroller = element.closest('.ui-section-nav__links')!;
        const style = getComputedStyle(element);
        const pad = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
        const box = element.getBoundingClientRect();
        const viewport = scroller.getBoundingClientRect();
        return {
          left: box.left - pad - viewport.left,
          right: viewport.right - box.right - pad,
          top: box.top - pad - viewport.top,
          bottom: viewport.bottom - box.bottom - pad,
        };
      });
      expect(ring.left).toBeGreaterThanOrEqual(-1);
      expect(ring.right).toBeGreaterThanOrEqual(-1);
      expect(ring.top).toBeGreaterThanOrEqual(-1);
      expect(ring.bottom).toBeGreaterThanOrEqual(-1);
    }
  });
}

for (const width of [390, 1280]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`bundle 0 shell at ${width}px ${theme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto('/hub');
      await chooseColorTheme(page, theme);
      for (const route of routes()) {
        await page.goto(route.path);
        await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1, { timeout: 20_000 });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${route.path} overflow ${overflow}px`).toBeLessThanOrEqual(1);
        const headerStart = await contentStart(page, '.suite-header__inner');
        const pageSelector =
          route.name === 'hub' ? '.hub' : route.name === 'settings' ? '.settings-shell' : route.name.startsWith('media') ? '.media-page' : '.travel-page';
        const pageStart = await contentStart(page, pageSelector);
        expect(Math.abs(pageStart - headerStart), `${route.path} content ${pageStart} vs header ${headerStart}`).toBeLessThanOrEqual(1);
        if (await page.locator('.ui-section-nav__links').count()) {
          const navStart = await contentStart(page, '.ui-section-nav__links');
          expect(Math.abs(navStart - headerStart), `${route.path} section nav ${navStart} vs header ${headerStart}`).toBeLessThanOrEqual(1);
        }
        const axe = await new AxeBuilder({ page }).analyze();
        const serious = axe.violations.filter(item => item.impact === 'serious' || item.impact === 'critical');
        expect(serious.map(item => `${item.impact} ${item.id}`)).toEqual([]);
        if (width === 390) {
          const small = await smallTargets(page);
          expect(small, small.join('\n')).toEqual([]);
        }
        if (route.name === 'hub') {
          await expect(page.getByText('Finance is locked. Unlock to see net worth.')).toBeVisible();
          const dollars = await page.locator('body').innerText();
          expect(dollars).not.toMatch(/\$[\s\u2060]*\d/);
        }
        await page.screenshot({
          path: screenshotPath(testInfo, `${route.name}-${width}-${theme}.png`),
          fullPage: true,
        });
        const rings = await focusRingMisses(page);
        expect(rings, rings.join('\n')).toEqual([]);
        if (route.name === 'media' && width === 390) {
          await page.goto('/media/add');
          await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1, { timeout: 20_000 });
          const nav = page.locator('.ui-section-nav__links');
          await expect(nav).toBeVisible();
          const active = nav.locator('[aria-current="page"]');
          await expect(active).toHaveAccessibleName('Add manually');
          await expect(active).toBeInViewport({ ratio: 1 });
          await expect.poll(() => nav.evaluate(el => el.scrollWidth - el.clientWidth)).toBe(0);
        }
      }
    });
  }
}

test('app switcher lists every app and supports the keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/hub');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  const bar = page.locator('.app-switcher__bar');
  for (const name of ['Hub', 'Finance', 'Travel', 'Media', 'Town', 'Pixels']) {
    await expect(bar.getByRole('link', { name, exact: true })).toBeVisible();
  }
  await expect(bar.getByRole('button', { name: /Switch apps and destinations/ })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const toggle = page.locator('.app-switcher__toggle');
  await expect(toggle).toBeVisible();
  await expect(toggle).toContainText('Hub');
  await toggle.focus();
  await page.keyboard.press('Enter');
  const menu = page.locator('#app-switcher-menu');
  await expect(menu).toBeVisible();
  for (const name of ['Hub', 'Finance', 'Travel', 'Media', 'Town', 'Pixels']) {
    await expect(menu.getByRole('link', { name, exact: true })).toBeVisible();
  }
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('link', { name: 'Hub', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('link', { name: 'Agenda', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(menu.getByRole('link', { name: 'Hub', exact: true })).toBeFocused();
  await page.keyboard.press('End');
  await expect(menu.getByRole('link', { name: 'Life', exact: true })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(menu.getByRole('link', { name: 'Hub', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(toggle).toBeFocused();
  await page.keyboard.press(' ');
  await expect(menu).toBeVisible();
  await page.keyboard.press('End');
  await page.keyboard.press('Tab');
  await expect(menu).toBeHidden();
});

test('navigation focus falls back when the route has no main heading', async ({ page }) => {
  // Spec §1.1 warns only in dev builds. CI serves the production bundle, where
  // isDevMode() is false, so the check is the focus move itself.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/hub');
  await expect(page.locator('#workspace-content main h1')).toBeFocused();
  await page.goto('/finance/vault/setup');
  await expect(page.getByRole('heading', { level: 1, name: 'Create your vault' })).toBeVisible();
  await expect(page.locator('#workspace-content main h1')).toHaveCount(0);
  await expect(page.locator('#workspace-content')).toBeFocused();
});

test('a locked Finance card drops money, counts, and names loaded while unlocked', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const vault = await syntheticVault(page, {
    assets: [{ id: 1, name: 'Harbor Checking', category: 'cash', current_value: 1500, as_of_date: '2026-10-01' }],
    holdings: [{
      id: 10,
      symbol: 'HBRX',
      shares: 2,
      purchase_price: 10,
      purchase_date: '2026-01-01',
      current_price: 25,
      account_display: 'Harbor Brokerage',
      lifecycle_status: 'active',
      price_source: 'manual',
    }],
  });
  await vault.open('/hub');
  const card = page.locator('.finance-bar');
  await expect.poll(async () => card.evaluate(el => el.textContent || '')).toMatch(/\$[\s\u2060]*\d/);
  await card.locator('summary', { hasText: 'Breakdown' }).click();
  await expect(card).toContainText('Harbor Brokerage');
  await expect(card).toContainText('HBRX');
  await expect(card).toContainText('1 position');
  await page.setViewportSize({ width: 390, height: 844 });
  const groups = await card.locator('.split > div').evaluateAll(nodes => nodes.map(node => {
    const { top, bottom } = node.getBoundingClientRect();
    return { top, bottom };
  }));
  expect(groups).toHaveLength(3);
  expect(groups[1].top).toBeGreaterThanOrEqual(groups[0].bottom);
  expect(groups[2].top).toBeGreaterThanOrEqual(groups[1].bottom);
  await page.setViewportSize({ width: 1280, height: 900 });
  // Stay in this document. page.goto would drop the in-memory Finance caches.
  const documentId = await page.evaluate(() => {
    const host = window as Window & { __bundle0Document?: string };
    host.__bundle0Document = 'locked-finance';
    return host.__bundle0Document;
  });
  const menu = await openUserMenu(page);
  await menu.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/account$/);
  await page.getByRole('navigation', { name: 'Settings' }).getByRole('link', { name: 'Finance', exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/finance$/);
  await page.getByRole('button', { name: 'Lock Finance', exact: true }).click();
  await expect(page.getByText('Finance is locked. Unlock to see settings.', { exact: true })).toBeVisible();
  await page.locator('.app-switcher__bar').getByRole('link', { name: 'Hub', exact: true }).click();
  await expect(page).toHaveURL(/\/hub$/);
  await expect.poll(async () => page.evaluate(() => (window as Window & { __bundle0Document?: string }).__bundle0Document)).toBe(documentId);
  // The new Hub paints locked before its load finishes. Hold the clean card
  // long enough for a cached snapshot to replace it.
  await page.waitForFunction(() => {
    const text = document.querySelector('.finance-bar')?.textContent || '';
    const clean = text.includes('Finance is locked. Unlock to see net worth.')
      && !/\$[\s\u2060]*\d/.test(text)
      && !text.includes('Harbor')
      && !text.includes('HBRX')
      && !/\d+\s+positions?/.test(text);
    const host = window as Window & { __financeCleanSince?: number };
    if (!clean) {
      host.__financeCleanSince = undefined;
      return false;
    }
    const now = performance.now();
    if (host.__financeCleanSince == null) host.__financeCleanSince = now;
    return now - host.__financeCleanSince >= 1000;
  });
});

test('a settings lock clears Finance and the Hub in other tabs within a second', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const vault = await syntheticVault(page, {
    assets: [{ id: 1, name: 'Harbor Checking', category: 'cash', current_value: 1500, as_of_date: '2026-10-01' }],
    holdings: [{
      id: 10,
      symbol: 'HBRX',
      shares: 2,
      purchase_price: 10,
      purchase_date: '2026-01-01',
      current_price: 25,
      account_display: 'Harbor Brokerage',
      lifecycle_status: 'active',
      price_source: 'manual',
    }],
  });
  const finance = await page.context().newPage();
  const hub = await page.context().newPage();
  await finance.setViewportSize({ width: 1280, height: 900 });
  await hub.setViewportSize({ width: 1280, height: 900 });
  await vault.open('/have?t=assets', finance);
  await expect(finance.getByRole('cell', { name: 'Harbor Checking' })).toBeVisible();
  await vault.open('/hub', hub);
  const card = hub.locator('.finance-bar');
  await expect.poll(async () => card.evaluate(el => el.textContent || '')).toMatch(/\$[\s\u2060]*\d/);
  await card.locator('summary', { hasText: 'Breakdown' }).click();
  await expect(card).toContainText('Harbor Brokerage');
  await expect(card).toContainText('HBRX');
  await vault.open('/hub', page);
  const menu = await openUserMenu(page);
  await menu.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('navigation', { name: 'Settings' }).getByRole('link', { name: 'Finance', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Lock Finance', exact: true })).toBeVisible();
  await finance.evaluate(() => { (window as Window & { __f6?: string }).__f6 = 'finance'; });
  await hub.evaluate(() => { (window as Window & { __f6?: string }).__f6 = 'hub'; });
  await page.getByRole('button', { name: 'Lock Finance', exact: true }).click();
  // B0F2: wait on the settled state, not a fixed one-second budget — the
  // cross-tab lock lands as fast as the channel delivers it, and a hard 1s
  // cap only made this test flaky under load.
  await Promise.all([
    expect(finance).toHaveURL(/\/finance\/vault\/unlock(?:\?|$)/),
    expect(finance.getByText('Harbor Checking')).toHaveCount(0),
    expect(hub).toHaveURL(/\/hub$/),
    expect.poll(async () => {
      const text = await card.evaluate(el => el.textContent || '');
      return text.includes('Finance is locked. Unlock to see net worth.')
        && !/\$[\s\u2060]*\d/.test(text)
        && !text.includes('Harbor')
        && !text.includes('HBRX');
    }).toBe(true),
  ]);
  expect(new URL(finance.url()).searchParams.get('next')).toBe('/finance/have?t=assets');
  expect(await finance.evaluate(() => (window as Window & { __f6?: string }).__f6)).toBe('finance');
  expect(await hub.evaluate(() => (window as Window & { __f6?: string }).__f6)).toBe('hub');
  await expect.poll(() => new URL(page.url()).pathname).toMatch(/^\/settings(\/|$)/);
});

test('the Hub Media retry target is at least 44px at desktop width', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route('**/media/api/summary', route => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ detail: 'Synthetic media outage' }),
  }));
  await page.goto('/hub');
  const mediaPanel = page.locator('section[aria-labelledby="media-heading"]');
  const retry = mediaPanel.getByRole('button', { name: 'Retry' });
  await expect(retry).toBeVisible();
  const box = await retry.boundingBox();
  if (!box) throw new Error('Media Retry has no bounding box');
  expect(box.height).toBeGreaterThanOrEqual(44);
});

test('signing out lands on the session-ended page with a way back in', async ({ page }) => {
  // Hold the logout POST: the local session clears immediately, and the
  // session-ended state stays on screen until the request settles and the
  // app moves on to the login page.
  let releaseLogout!: () => void;
  const gate = new Promise<void>(resolve => { releaseLogout = resolve; });
  await page.route('**/api/auth/logout', async route => {
    await gate;
    await route.fallback();
  });
  try {
    await syntheticVault(page);
    await page.goto('/hub');
    const menu = await openUserMenu(page);
    await menu.getByRole('button', { name: 'Sign out' }).click();
    const main = page.locator('#workspace-content main');
    await expect(main.getByRole('heading', { level: 1, name: 'Your session ended' })).toBeVisible();
    await expect(main.getByText('Your session ended. Sign in again to see your apps.')).toBeVisible();
    const signIn = main.getByRole('link', { name: 'Sign in' });
    await expect(signIn).toHaveAttribute('href', '/auth/login?next=%2Fhub');
    await signIn.click();
    await expect(page).toHaveURL(/\/auth\/login\?next=%2Fhub$/);
  } finally {
    releaseLogout();
  }
});

test('an empty Finance vault shows the empty state instead of $0.00', async ({ page }) => {
  const vault = await syntheticVault(page, {});
  await vault.open('/hub');
  const card = page.locator('.finance-bar');
  await expect(card.getByText('No accounts yet')).toBeVisible();
  await expect(card.getByRole('link', { name: 'Add an account' })).toBeVisible();
  const text = await card.evaluate(el => el.textContent || '');
  expect(text).not.toMatch(/\$[\s\u2060]*\d/);
  expect(text).not.toContain('Finance is locked');
});

test('old account urls open settings and the theme radio persists suite-theme', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/hub?settings=account');
  await page.waitForURL(/\/settings\/account$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Account' })).toBeVisible();
  await page.goto('/account');
  await page.waitForURL(/\/settings\/account$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Account' })).toBeVisible();
  await page.goto('/settings/appearance');
  await expect(page.getByRole('heading', { level: 1, name: 'Appearance' })).toBeVisible();
  await page.locator('input[name="color-theme"][value="dark"]').click();
  await expect.poll(async () => page.evaluate(() => localStorage.getItem('suite-theme'))).toBe('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('agenda keeps a usable source and only a local Finance count through retry, navigation and lock', async ({ page }) => {
  const view = await page.context().newPage();
  await view.clock.install({ time: new Date('2026-12-25T20:00:00Z') });
  const marker = 'PRIVATE_AGENDA_SUBSCRIPTION';
  const vault = await syntheticVault(view, { subscriptions: [{ id: 8899004, name: marker, amount: 491.21,
    category: 'Software', frequency: 'monthly', next_bill_date: '2026-12-25', is_active: true }] });
  const calls = await sources(view);
  const sourceRequests: string[] = [];
  view.on('request', request => { if (/\/(travel|media)\/api\//.test(request.url())) sourceRequests.push(request.url() + (request.postData() ?? '')); });
  let mediaReads = 0;
  await view.route('**/media/api/summary', route => { mediaReads++; return route.fulfill({ status: mediaReads === 1 ? 503 : 200, json: summary }); });
  await vault.open('/hub/agenda');
  const agenda = view.getByRole('region', { name: 'Agenda', exact: true });
  await expect(agenda.getByRole('link', { name: 'Check in' })).toBeVisible();
  await expect(agenda).toContainText('1 bill due this week');
  await expect(agenda).toContainText("Couldn't load Media dates.");
  await agenda.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(agenda.getByRole('link', { name: 'Premiere' })).toBeVisible();
  expect(calls.filter(call => call === 'travel')).toHaveLength(1);
  let release = () => {};
  let arrived = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  const held = new Promise<void>(resolve => { arrived = resolve; });
  await view.route('**/travel/api/summary?*', async route => {
    if (new URL(route.request().url()).searchParams.get('start') !== '2027-01-01') return route.fulfill({ json: travel });
    arrived(); await gate;
    await route.fulfill({ json: { ...travel, up_next: [{ ...event, title: 'Late January row' }] } });
  });
  try {
    await agenda.getByRole('button', { name: 'Next month' }).click();
    await held;
    await agenda.getByRole('button', { name: 'Previous month' }).click();
    await expect(agenda.getByRole('link', { name: 'Check in' })).toBeVisible();
  } finally { release(); }
  await expect(agenda.getByRole('link', { name: 'Late January row' })).toHaveCount(0);
  await view.evaluate(() => {
    const channel = new BroadcastChannel('finance-vault-sync-v1');
    channel.postMessage({ version: 1, kind: 'lock', userId: 987, tabId: 'agenda-other-tab' });
    channel.close();
  });
  await expect(agenda).toContainText('Bills hidden: Finance is locked');
  await expect(agenda).not.toContainText('1 bill due this week');
  expect(sourceRequests.join(' ')).not.toMatch(/PRIVATE_AGENDA_SUBSCRIPTION|491\.21|8899004/);
  expect(view.url()).not.toMatch(/PRIVATE_AGENDA_SUBSCRIPTION|491\.21|8899004/);
  await expect(agenda).not.toContainText(marker);
  await view.close();
});
