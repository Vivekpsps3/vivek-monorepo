import { mkdirSync } from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
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
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
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
  let steps = 0;
  let finished = false;
  for (let i = 0; i < 250; i += 1) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(ring => {
      const el = document.activeElement;
      if (!(el instanceof HTMLElement) || el === document.body) return null;
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
        repeat: false as const,
        described,
        width: style.outlineWidth,
        outlineStyle: style.outlineStyle,
        color: style.outlineColor,
        clippedBy,
      };
    }, expected);
    if (!stop) {
      finished = true;
      break;
    }
    if (stop.repeat) {
      finished = true;
      break;
    }
    steps += 1;
    if (stop.width !== '2px' || stop.outlineStyle === 'none' || stop.color !== expected) {
      misses.push(`${stop.described} → ${stop.outlineStyle} ${stop.width} ${stop.color} expected ${expected}`);
    }
    if (stop.clippedBy) misses.push(`${stop.described} clipped by ${stop.clippedBy}`);
  }
  if (!finished) misses.push('focus walk hit the safety cap before every stop was checked');
  expect(steps).toBeGreaterThan(0);
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
            if (!(active instanceof HTMLElement)) return false;
            const activeBox = active.getBoundingClientRect();
            const navBox = el.getBoundingClientRect();
            const inView = activeBox.left >= navBox.left - 1 && activeBox.right <= navBox.right + 1;
            return el.scrollWidth - el.clientWidth > 1 && el.scrollLeft > 1 && inView;
          })).toBe(true);
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
