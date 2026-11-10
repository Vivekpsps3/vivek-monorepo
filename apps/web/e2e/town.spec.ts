import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../../../tests/e2e/fixtures';
import type { TownResponse } from '../src/app/town/town.types';

const FOREIGN_HABIT = "Other's habit";

test.describe('Town', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });
  test.beforeEach(async ({ page, request }) => {
    expect((await request.post('/e2e/reset?seed=town')).ok()).toBeTruthy();
    await page.clock.setFixedTime(new Date('2026-10-29T19:00:00Z'));
  });
  test('7: locked lots are read in order and skipped by Tab; 9: other users stay out of the DOM', async ({ page }) => {
    await page.goto('/town');
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.locator('main > header')).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'Terraria-on-Sea' })).toBeVisible();
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
    const html = await page.content();
    expect(html).not.toContain(FOREIGN_HABIT);
    expect(html).not.toContain('Other User');
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
      await expect(page.getByRole('main')).toHaveCount(1);
      await expect(page.locator('main > header')).toHaveCount(1);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(page.getByRole('list', { name: 'Town buildings' })).toBeVisible();
      const body: TownResponse = await (await page.request.get('/api/town?tz=America%2FLos_Angeles')).json();
      await expect(page.locator('app-town header')).toContainText(`Lv ${body.town.level} · ${body.town.xp} / ${body.town.next_level_xp} XP`);
      await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(body.town.name);
      expect(await page.content()).not.toContain(FOREIGN_HABIT);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      expect(await page.getByRole('list', { name: 'Town buildings' }).evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(3);
      for (const img of await page.locator('app-town-lot img').all()) {
        await expect(img).toHaveAttribute('alt', '');
        expect(await img.evaluate(el => el.getBoundingClientRect().width)).toBe(width === 390 ? 96 : 128);
        expect(await img.evaluate(el => getComputedStyle(el).imageRendering)).toBe('pixelated');
      }
      if (width === 1280) expect(await page.locator('app-town ui-card').evaluate(el => el.getBoundingClientRect().width)).toBe(360);
      const scan = await new AxeBuilder({ page }).include('app-town').analyze();
      expect(scan.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
      await info.attach(`town-${width}-${theme}`, { body: await page.screenshot(), contentType: 'image/png' });
    });
  }
  test('15: DST check-in keeps the server calendar day', async ({ page, request }) => {
    expect((await request.post('/e2e/town/clock', { data: { iso: '2026-11-01T19:00:00Z' } })).ok()).toBeTruthy();
    await page.clock.setFixedTime(new Date('2026-11-01T19:00:00Z'));
    await page.goto('/town');
    const before: TownResponse = await (await page.request.get('/api/town?tz=America%2FLos_Angeles')).json();
    expect(before.town.tz).toBe('America/Los_Angeles');
    expect(before.town.today).toBe('2026-11-01');
    const habit = before.habits.find(h => h.name === 'Read 20 pages')!;
    const result = await page.request.post(`/api/town/habits/${habit.id}/checkins?tz=America%2FLos_Angeles`, {
      headers: { 'X-CSRF-Token': 'synthetic-csrf' }, data: { day: before.town.today },
    });
    expect(result.ok()).toBeTruthy();
    const checked = await result.json();
    expect(checked.day).toBe('2026-11-01'); expect(checked.checked).toBeTruthy();
    await page.reload();
    const lot = page.locator('app-town-lot').filter({ hasText: 'Read 20 pages' }).getByRole('button');
    await expect(lot).toContainText(`Lv ${checked.habit.level} · ${checked.habit.streak.current}-day streak`);
    expect(await page.content()).not.toContain(FOREIGN_HABIT);
  });
});
