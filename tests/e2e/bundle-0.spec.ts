import { mkdirSync } from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { syntheticVault } from '../../apps/finance/frontend/e2e/synthetic-vault';
import { chooseColorTheme } from './user-menu.mjs';

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
        if (await page.locator('.ui-section-nav__scroller').count()) {
          const navStart = await contentStart(page, '.ui-section-nav__scroller');
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
          const nav = page.locator('.ui-section-nav__scroller');
          await expect(nav).toBeVisible();
          await expect.poll(async () => nav.evaluate(el => {
            const active = el.querySelector('[aria-current="page"]');
            if (!(active instanceof HTMLElement)) return 'missing active item';
            const activeBox = active.getBoundingClientRect();
            const navBox = el.getBoundingClientRect();
            const inView = activeBox.left >= navBox.left - 1 && activeBox.right <= navBox.right + 1;
            const style = getComputedStyle(el);
            const mask = style.maskImage && style.maskImage !== 'none' ? style.maskImage : style.webkitMaskImage;
            const faded = (el.classList.contains('is-fade-start') || el.classList.contains('is-fade-end'))
              && /gradient/i.test(mask);
            if (!(el.scrollWidth - el.clientWidth > 1 && el.scrollLeft > 1 && inView && faded)) {
              return `scroll ${el.scrollLeft} overflow ${el.scrollWidth - el.clientWidth} inView ${inView} fade ${el.className} mask ${mask}`;
            }
            return 'ok';
          })).toBe('ok');
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
  for (const name of ['Hub', 'Finance', 'Travel', 'Media']) {
    await expect(bar.getByRole('link', { name, exact: true })).toBeVisible();
  }
  await expect(page.locator('.app-switcher__toggle')).toBeHidden();

  await page.setViewportSize({ width: 390, height: 844 });
  const toggle = page.locator('.app-switcher__toggle');
  await expect(toggle).toBeVisible();
  await expect(toggle).toContainText('Hub');
  await toggle.focus();
  await page.keyboard.press('Enter');
  const menu = page.locator('#app-switcher-menu');
  await expect(menu).toBeVisible();
  for (const name of ['Hub', 'Finance', 'Travel', 'Media']) {
    await expect(menu.getByRole('link', { name, exact: true })).toBeVisible();
  }
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('link', { name: 'Hub', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('link', { name: 'Finance', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(menu.getByRole('link', { name: 'Hub', exact: true })).toBeFocused();
  await page.keyboard.press('End');
  await expect(menu.getByRole('link', { name: 'Media', exact: true })).toBeFocused();
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
  await page.goto('/settings/finance');
  await page.getByRole('button', { name: 'Lock now' }).click();
  await expect(page.getByText('Finance is locked. Unlock to see settings.')).toBeVisible();
  await page.goto('/hub');
  await expect(card).toContainText('Finance is locked. Unlock to see net worth.');
  const locked = await card.evaluate(el => el.textContent || '');
  expect(locked).not.toMatch(/\$[\s\u2060]*\d/);
  expect(locked).not.toContain('Harbor');
  expect(locked).not.toContain('HBRX');
  expect(locked).not.toMatch(/\d+\s+positions?/);
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
