import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { TownResponse } from '../src/app/town/town.types';

// TH1 owns domainConfig('town'), the server clock and the synthetic seeds.
// Enable only after TH1 merges, then run against apps/web/e2e/playwright.config.ts.
test.describe('Town TH1 fixtures', () => {
  test.fixme(true, 'Waiting for TH1 Town harness and fixtures to merge');
  test.use({ timezoneId: 'America/Los_Angeles' });
  test.beforeEach(async ({ page, request }) => {
    expect((await request.post('/e2e/reset?seed=town')).ok()).toBeTruthy();
    await page.clock.setFixedTime(new Date('2026-10-29T19:00:00Z'));
  });
  test('7: locked lots are read in order and skipped by Tab; 9: other users stay out of the DOM', async ({ page }) => {
    await page.goto('/town');
    const scene = page.getByRole('list', { name: 'Town buildings' });
    await expect(scene.getByRole('listitem')).toHaveCount(9);
    const locked = scene.getByRole('listitem').filter({ hasText: 'Unlocks at Lv 5' });
    await expect(locked).toHaveCount(1);
    await expect(locked.locator('.tile')).toHaveJSProperty('tabIndex', -1);
    await expect(locked.locator('a, button, [tabindex]')).toHaveCount(0);
    const controls = scene.locator('a, button');
    await controls.first().focus();
    for (let i = 0; i < await controls.count(); i++) {
      await expect(controls.nth(i)).toBeFocused();
      await page.keyboard.press('Tab');
    }
    await expect(page.getByText("Other's habit", { exact: false })).toHaveCount(0);
    const treasury = scene.getByRole('link', { name: /Treasury/ });
    await expect(treasury).toHaveAttribute('href', '/finance/vault/unlock?next=%2Ftown');
    expect(await treasury.innerText()).not.toMatch(/\d/);
  });
  for (const width of [390, 1280]) for (const theme of ['light', 'dark'] as const) {
    test(`14: ${width} ${theme} layout, contrast and decorative sprites`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
      await page.addInitScript(theme => localStorage.setItem('suite-theme', theme), theme);
      await page.goto('/town');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.getByRole('list', { name: 'Town buildings' })).toBeVisible();
      const body: TownResponse = await (await page.request.get('/api/town?tz=America%2FLos_Angeles')).json();
      await expect(page.locator('app-town header')).toContainText(`Lv ${body.town.level} · ${body.town.xp} / ${body.town.next_level_xp} XP`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      expect(await page.locator('app-town ul').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(3);
      for (const img of await page.locator('app-town-lot img').all()) {
        await expect(img).toHaveAttribute('alt', '');
        expect(await img.evaluate(el => el.getBoundingClientRect().width)).toBe(width === 390 ? 96 : 128);
        expect(await img.evaluate(el => getComputedStyle(el).imageRendering)).toBe('pixelated');
      }
      if (width === 1280) expect(await page.locator('app-town ui-card').evaluate(el => el.getBoundingClientRect().width)).toBe(360);
      const scan = await new AxeBuilder({ page }).include('app-town').analyze();
      expect(scan.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
      await info.attach(`town-${width}-${theme}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    });
  }
  test('15: DST check-in keeps the server calendar day', async ({ page, request }) => {
    expect((await request.post('/e2e/town/clock', { data: { iso: '2026-11-01T19:00:00Z' } })).ok()).toBeTruthy();
    await page.clock.setFixedTime(new Date('2026-11-01T19:00:00Z'));
    await page.goto('/town');
    const before: TownResponse = await (await request.get('/api/town?tz=America%2FLos_Angeles')).json();
    expect(before.town.today).toBe('2026-11-01');
    const habit = before.habits.find(h => h.name === 'Read 20 pages')!;
    const result = await request.post(`/api/town/habits/${habit.id}/checkins?tz=America%2FLos_Angeles`, {
      headers: { 'X-CSRF-Token': 'synthetic-csrf' }, data: { day: before.town.today },
    });
    expect(result.ok()).toBeTruthy();
    const checked = await result.json();
    expect(checked.day).toBe('2026-11-01'); expect(checked.checked).toBeTruthy();
    await page.reload();
    await expect(page.getByRole('button', { name: /Read 20 pages/ })).toContainText(`Lv ${checked.habit.level} · ${checked.habit.streak.current}-day streak`);
  });
});
