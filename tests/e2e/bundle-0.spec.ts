import { mkdirSync } from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { chooseColorTheme } from './user-menu.mjs';

const SHOTS = '/srv/work/specs/bundle-0/screenshots';

test.describe.configure({ timeout: 300_000 });

let tripId = '';
let mediaId = '';

test.beforeAll(async ({ request }) => {
  mkdirSync(SHOTS, { recursive: true });
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

async function focusRingMisses(page: Page): Promise<string[]> {
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  });
  const misses: string[] = [];
  let steps = 0;
  for (let i = 0; i < 60; i += 1) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const el = document.activeElement;
      if (!(el instanceof HTMLElement) || el === document.body) return null;
      if (el.dataset.bundleTab === '1') return { repeat: true as const };
      el.dataset.bundleTab = '1';
      const described = `${el.tagName}.${el.className} ${(el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim()}`.slice(0, 90);
      let node: HTMLElement = el;
      let style = getComputedStyle(el);
      const hostLabel = el.closest('label');
      if ((style.outlineStyle === 'none' || style.outlineWidth === '0px') && hostLabel instanceof HTMLElement) {
        node = hostLabel;
        style = getComputedStyle(hostLabel);
      }
      return { repeat: false as const, described, width: style.outlineWidth, outlineStyle: style.outlineStyle };
    });
    if (!stop || stop.repeat) break;
    steps += 1;
    if (stop.width !== '2px' || stop.outlineStyle === 'none') {
      misses.push(`${stop.described} → ${stop.outlineStyle} ${stop.width}`);
    }
  }
  expect(steps).toBeGreaterThan(0);
  return misses;
}

for (const width of [390, 1280]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`bundle 0 shell at ${width}px ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto('/hub');
      await chooseColorTheme(page, theme);
      for (const route of routes()) {
        await page.goto(route.path);
        await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1, { timeout: 20_000 });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${route.path} overflow ${overflow}px`).toBeLessThanOrEqual(1);
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
          expect(dollars).not.toMatch(/\$\s*\d/);
        }
        if (route.name === 'media' && width === 390) {
          const nav = page.locator('.ui-section-nav__scroller');
          await expect(nav).toBeVisible();
          const fade = await nav.evaluate(el => {
            const hidden = el.scrollWidth - el.clientWidth;
            const active = el.querySelector('[aria-current="page"]');
            const activeBox = active?.getBoundingClientRect();
            const navBox = el.getBoundingClientRect();
            const inView = !!activeBox && activeBox.left >= navBox.left - 1 && activeBox.right <= navBox.right + 1;
            return {
              hidden,
              fade: el.classList.contains('is-fade-end') || el.classList.contains('is-fade-start'),
              inView,
            };
          });
          expect(fade.inView).toBe(true);
          if (fade.hidden > 1) expect(fade.fade).toBe(true);
        }
        await page.screenshot({
          path: path.join(SHOTS, `${route.name}-${width}-${theme}.png`),
          fullPage: true,
        });
        if (theme === 'light') {
          const rings = await focusRingMisses(page);
          expect(rings, rings.join('\n')).toEqual([]);
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
