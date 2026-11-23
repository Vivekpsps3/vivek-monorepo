import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '../../../tests/e2e/fixtures';
import type { TownResponse } from '../src/app/town/town.types';

const FOREIGN_HABIT = "Other's habit";

test.describe('Town check-in', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });
  test.beforeEach(async ({ page, request }) => {
    expect((await request.post('/e2e/reset?seed=town')).ok()).toBeTruthy();
    await page.clock.setFixedTime(new Date('2026-10-29T19:00:00Z'));
    await page.goto('/town');
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.locator('main > header')).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1, name: 'Terraria-on-Sea' })).toBeVisible();
    expect(await page.content()).not.toContain(FOREIGN_HABIT);
  });

  test('2: check-in and undo announce, keep focus, and persist', async ({ page }) => {
    const button = page.locator('app-town-today').getByRole('button', { name: /Read 20 pages/ });
    await expect(button).toHaveAccessibleName('Mark Read 20 pages done for today');
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(button).toBeFocused();
    await expect(button).toHaveAccessibleName('Read 20 pages, done today. Undo');
    await expect(page.locator('app-town-today [aria-live="polite"]')).toContainText(/Read 20 pages checked\. \d+-day streak\./);
    await expect(page.locator('[data-scene-object="slot-0"] [data-habit-feedback="smoke"]')).toHaveCount(1);
    await expect(page.locator('[data-scene-object="slot-0"] [data-celebration]')).toHaveCount(1);
    await expect(page.locator('[data-building="slot-0"]')).toContainText('Chimney smoke');
    await button.click();
    await expect(page.locator('app-town-today [aria-live="polite"]')).toContainText('Read 20 pages undone.');
    await expect(page.locator('[data-scene-object="slot-0"] [data-habit-feedback]')).toHaveCount(0);
    await expect(button).toHaveAccessibleName('Mark Read 20 pages done for today');
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await page.reload();
    await expect(page.locator('app-town-today').getByRole('button', { name: 'Mark Read 20 pages done for today' })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('[data-celebration]')).toHaveCount(0);
    await expect(page.locator('[data-habit-feedback="smoke"]')).toHaveCount(0);
  });

  test('3: one level-up toast', async ({ page }) => {
    await rememberOneTownLevelDown(page);
    await page.reload();
    await expect(page.getByRole('status').filter({ hasText: /reached Lv|Level up!/ })).toHaveCount(1);
  });

  test('3: reduced motion shows the toast without a swap', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ timezoneId: 'America/Los_Angeles', reducedMotion: 'reduce', baseURL });
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date('2026-10-29T19:00:00Z'));
    expect((await page.request.post('/e2e/reset?seed=town')).ok()).toBeTruthy();
    await page.goto('/town');
    await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'Terraria-on-Sea' })).toBeVisible();
    await rememberOneTownLevelDown(page);
    await page.reload();
    await expect(page.locator('.swap')).toHaveCount(0);
    await expect(page.getByText(/reached Lv|Level up!/)).toBeVisible();
    expect(await page.content()).not.toContain(FOREIGN_HABIT);
    await context.close();
  });

  test('13: visibility after the local date changes refetches unchecked rows', async ({ page, request }) => {
    // Keep HTTP timer advancement stable across this synthetic wall-clock change.
    await page.clock.pauseAt(new Date('2026-10-29T19:00:00Z'));
    expect((await request.post('/e2e/town/clock', { data: { iso: '2026-10-30T07:10:00Z' } })).ok()).toBeTruthy();
    let receive!: (body: TownResponse) => void;
    const refresh = new Promise<TownResponse>(resolve => { receive = resolve; });
    // Capture the real response before Chromium can evict its body from the
    // DevTools network buffer. This still exercises the page's visibility GET.
    await page.route(/\/api\/town\?/, async route => {
      const response = await route.fetch();
      const payload = await response.json() as TownResponse;
      await route.fulfill({ response });
      if (payload.town?.today === '2026-10-30' && payload.town?.tz === 'America/Los_Angeles') receive(payload);
    });
    await page.clock.setFixedTime(new Date('2026-10-30T07:10:00Z'));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    const body = await refresh;
    await page.clock.resume();
    expect(body.town.tz).toBe('America/Los_Angeles');
    expect(body.town.today).toBe('2026-10-30');
    await expect(page.getByRole('button', { name: 'Mark Read 20 pages done for today' })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('button', { name: 'Mark Walk 30 minutes done for today' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('check-in after the server day moves names the change and stays on this town', async ({ page, request }) => {
    expect((await request.post('/e2e/town/clock', { data: { iso: '2026-11-05T19:00:00Z' } })).ok()).toBeTruthy();
    const button = page.locator('app-town-today').getByRole('button', { name: /Read 20 pages/ });
    await button.click();
    await expect(page.getByRole('alert')).toContainText('The day changed. Try again.');
    await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'Terraria-on-Sea' })).toBeVisible();
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('[data-habit-feedback="smoke"], [data-habit-feedback="garden"], [data-habit-feedback="light"]')).toHaveCount(0);
    expect(await page.content()).not.toContain(FOREIGN_HABIT);
  });

  test('a held or failed check-in never celebrates or grants credit', async ({ page }) => {
    const before = await page.locator('app-town header p').first().innerText();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route(/\/api\/town\/habits\/\d+\/checkins/, async route => {
      if (route.request().method() !== 'POST') return route.continue();
      await gate;
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'conflict', message: 'Check not saved. Try again.' }),
      });
    });
    const read = page.locator('app-town-today').getByRole('button', { name: /Read 20 pages/ });
    const walk = page.locator('app-town-today').getByRole('button', { name: /Walk 30 minutes/ });
    const pending = page.locator('[data-scene-object="slot-0"] [data-habit-feedback="pending"]');
    const clicked = read.click();
    await expect(pending).toHaveCount(1);
    const pendingMs = Number(await page.locator('app-town-today').getAttribute('data-pending-ms'));
    expect(pendingMs).toBeGreaterThanOrEqual(0);
    expect(pendingMs).toBeLessThan(100);
    await expect(page.locator('[data-habit-feedback="smoke"], [data-habit-feedback="garden"], [data-habit-feedback="light"]')).toHaveCount(0);
    await expect(read).toHaveAttribute('aria-busy', 'true');
    await expect(walk).not.toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('app-town header p').first()).toHaveText(before);
    await expect(page.locator('[data-building="slot-0"]')).toContainText('Saving check');
    await expect(page.locator('[data-scene-object="slot-1"] [data-habit-feedback]')).toHaveCount(0);
    release();
    await expect(page.getByRole('alert')).toContainText('Check not saved. Try again.');
    await expect(read).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('[data-habit-feedback]')).toHaveCount(0);
    await expect(page.locator('app-town header p').first()).toHaveText(before);
    await expect(page.locator('app-town-today [aria-live="polite"]')).not.toContainText('checked');
  });

  test('garden and window feedback work at both sizes, themes, and motion settings', async ({ page }, info) => {
    test.setTimeout(120_000);
    const cases = [
      { width: 390, height: 844, theme: 'light' as const, night: false, reduced: true },
      { width: 390, height: 844, theme: 'dark' as const, night: true, reduced: true },
      { width: 1280, height: 800, theme: 'light' as const, night: false, reduced: false },
      { width: 1280, height: 800, theme: 'dark' as const, night: true, reduced: false },
    ];
    for (const item of cases) {
      await page.setViewportSize({ width: item.width, height: item.height });
      await page.emulateMedia({
        colorScheme: item.theme === 'dark' ? 'dark' : 'light',
        reducedMotion: item.reduced ? 'reduce' : 'no-preference',
      });
      await page.evaluate(theme => localStorage.setItem('suite-theme', theme), item.theme);
      await page.clock.setFixedTime(new Date(item.night ? '2026-10-30T05:30:00Z' : '2026-10-29T19:00:00Z'));
      await page.goto('/town');
      await expect(page.locator('html')).toHaveAttribute('data-theme', item.theme);
      await expect(page.locator('.viewport')).toHaveAttribute('data-day', item.night ? 'night' : 'day');
      const button = page.locator('app-town-today').getByRole('button', { name: /Walk 30 minutes/ });
      await button.focus();
      await button.press('Enter');
      const mark = page.locator('[data-scene-object="slot-1"] [data-habit-feedback="garden"]');
      await expect(mark).toHaveCount(1);
      await expect(page.locator('[data-building="slot-1"]')).toContainText('Flower open');
      await expect(page.locator('[data-scene-object="slot-0"] [data-habit-feedback="garden"]')).toHaveCount(0);
      const animation = await mark.evaluate(el => getComputedStyle(el).animationName);
      if (item.reduced) expect(animation).toBe('none');
      else expect(animation).toContain('habit-grow');
      const checkBox = await button.boundingBox();
      expect(checkBox && checkBox.width >= 44 && checkBox.height >= 44).toBeTruthy();
      await page.locator('[data-building="slot-1"]').click();
      await expect(page.locator('.inspector')).toContainText('Flower open');
      const buildingBox = await page.locator('[data-building="slot-1"]').boundingBox();
      expect(buildingBox && buildingBox.width >= 44 && buildingBox.height >= 44).toBeTruthy();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
      const scan = await new AxeBuilder({ page }).include('app-town').analyze();
      expect(scan.violations.filter(violation => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([]);
      await info.attach(`feedback-${item.width}-${item.theme}-${item.night ? 'night' : 'day'}`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
      await button.click();
      await expect(page.locator('app-town-today [aria-live="polite"]')).toContainText('Walk 30 minutes undone.');
      await expect(page.locator('[data-scene-object="slot-1"] [data-habit-feedback]')).toHaveCount(0);
    }

    const created = await page.request.post('/api/town/habits?tz=America%2FLos_Angeles', {
      headers: { 'X-CSRF-Token': 'synthetic-csrf' },
      data: { name: 'Sleep by 12', slot: 2, per_week: 7, building_style: 'cottage' },
    });
    expect(created.ok()).toBeTruthy();
    await page.clock.setFixedTime(new Date('2026-10-30T05:30:00Z'));
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.evaluate(() => localStorage.setItem('suite-theme', 'dark'));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/town');
    await expect(page.locator('.viewport')).toHaveAttribute('data-day', 'night');
    const sleep = page.locator('app-town-today').getByRole('button', { name: /Sleep by 12/ });
    await sleep.click();
    await expect(page.locator('[data-scene-object="slot-2"] [data-habit-feedback="light"]')).toHaveCount(1);
    await expect(page.locator('[data-building="slot-2"]')).toContainText('Window lit');
    const light = page.locator('[data-scene-object="slot-2"] [data-habit-feedback="light"]');
    expect(await light.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
    await info.attach('feedback-390-dark-night-window', { body: await page.screenshot(), contentType: 'image/png' });
    await sleep.click();
    await expect(page.locator('[data-scene-object="slot-2"] [data-habit-feedback]')).toHaveCount(0);
  });
});

test.describe('Town check-in touch', () => {
  test.use({ hasTouch: true, timezoneId: 'America/Los_Angeles', viewport: { width: 390, height: 844 } });
  test.beforeEach(async ({ page, request }) => {
    expect((await request.post('/e2e/reset?seed=town')).ok()).toBeTruthy();
    await page.clock.setFixedTime(new Date('2026-10-29T19:00:00Z'));
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.addInitScript(() => localStorage.setItem('suite-theme', 'dark'));
    await page.goto('/town');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('a tap checks the garden lot and undo clears it', async ({ page }) => {
    const button = page.locator('app-town-today').getByRole('button', { name: /Walk 30 minutes/ });
    await button.tap();
    await expect(page.locator('[data-scene-object="slot-1"] [data-habit-feedback="garden"]')).toHaveCount(1);
    await expect(page.locator('[data-building="slot-1"]')).toContainText('Flower open');
    await button.tap();
    await expect(page.locator('app-town-today [aria-live="polite"]')).toContainText('Walk 30 minutes undone.');
    await expect(page.locator('[data-scene-object="slot-1"] [data-habit-feedback]')).toHaveCount(0);
  });
});

async function rememberOneTownLevelDown(page: Page): Promise<void> {
  const body: TownResponse = await (await page.request.get('/api/town?tz=America%2FLos_Angeles')).json();
  const b: Record<string, number> = {
    library: body.buildings.library.level,
    inn: body.buildings.inn.level,
  };
  for (const habit of body.habits) b[`h${habit.id}`] = habit.level;
  await page.evaluate(seen => localStorage.setItem('town.seen.v1.1', JSON.stringify(seen)), { town: body.town.level - 1, b });
}
