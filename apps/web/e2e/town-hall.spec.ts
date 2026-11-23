import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../../../tests/e2e/fixtures';
import type { TownResponse } from '../src/app/town/town.types';

const FOREIGN_HABIT = "Other's habit";

async function archiveWalk(page: import('@playwright/test').Page): Promise<TownResponse> {
  const before = await (await page.request.get('/api/town?tz=America%2FLos_Angeles')).json() as TownResponse;
  const walk = before.habits.find(item => item.name === 'Walk 30 minutes');
  expect(walk).toBeTruthy();
  const archived = await page.request.patch(`/api/town/habits/${walk!.id}?tz=America%2FLos_Angeles`, {
    headers: { 'X-CSRF-Token': 'synthetic-csrf' },
    data: { archived: true },
  });
  expect(archived.ok(), `${archived.status()} ${await archived.text()}`).toBeTruthy();
  return before;
}

test.describe('Hall', () => {
  test.use({ timezoneId: 'America/Los_Angeles', hasTouch: true });
  test.beforeEach(async ({ page, request }) => {
    expect((await request.post('/e2e/reset?seed=town')).ok()).toBeTruthy();
    await page.clock.setFixedTime(new Date('2026-10-29T19:00:00Z'));
  });

  for (const [width, theme, touch] of [[1280, 'light', false], [390, 'dark', true]] as const) {
    test(`deep reload shows thresholds and habit links at ${width} ${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
      const hallCalls: string[] = [];
      page.on('request', request => {
        if (!page.url().includes('/town/hall')) return;
        const path = new URL(request.url()).pathname;
        if (path.startsWith('/api/')) hallCalls.push(path);
      });
      await page.goto('/town');
      await archiveWalk(page);
      const entrance = page.getByRole('link', { name: 'Visit the Hall' });
      await entrance.focus();
      if (touch) await entrance.tap();
      else await page.keyboard.press('Enter');
      const hall = page.locator('app-town-hall');
      await expect(hall.getByRole('heading', { name: 'Hall', level: 1 })).toBeVisible();
      await expect(hall.getByRole('heading', { name: 'How Town grows' })).toBeVisible();
      await expect(hall).toContainText('Level 2 starts at 100 XP');
      await expect(hall).toContainText('Level 10 starts at 5000 XP');
      await expect(hall).toContainText('capped at 10 Library XP a day');
      await expect(hall).toContainText('capped at 15 Inn XP a day');
      await expect(hall).toContainText('Kept budget weeks: 0, 1, 2, 4, 8');
      await expect(hall).toContainText('Balances stay in Finance and are not shown here.');
      await expect(hall).toContainText('The Hall does not list them.');
      await expect(hall.getByRole('link', { name: 'Edit Read 20 pages' })).toBeVisible();
      await expect(hall.getByRole('link', { name: 'History for Walk 30 minutes' })).toBeVisible();
      await expect(hall).not.toContainText(FOREIGN_HABIT);
      expect(await hall.innerText()).not.toMatch(/\$\d|\bkg\b|mmHg|bpm/);

      await page.reload();
      await expect(hall.getByRole('link', { name: 'History for Walk 30 minutes' })).toBeVisible();
      await expect(hall).toContainText('Level 10 starts at 5000 XP');
      await expect(hall).toContainText('Edit Read 20 pages');
      const body = await (await page.request.get('/api/town?tz=America%2FLos_Angeles')).json() as TownResponse;
      const read = body.habits.find(item => item.name === 'Read 20 pages');
      const walk = body.archived.find(item => item.name === 'Walk 30 minutes');
      await expect(hall).toContainText(`Level ${body.town.level} · ${body.town.xp} / ${body.town.next_level_xp} XP`);
      await expect(hall).toContainText(`Read 20 pages · Level ${read!.level} · ${read!.xp} XP`);
      await expect(hall).toContainText(`Walk 30 minutes · Level ${walk!.level} · ${walk!.xp} XP`);

      const history = hall.getByRole('link', { name: 'History for Walk 30 minutes' });
      const historyBox = await history.boundingBox();
      expect(historyBox?.width).toBeGreaterThanOrEqual(44);
      expect(historyBox?.height).toBeGreaterThanOrEqual(44);
      if (touch) await history.tap();
      else {
        await history.focus();
        await page.keyboard.press('Enter');
      }
      const dialog = page.getByRole('dialog', { name: 'History' });
      await expect(dialog).toContainText('Walk 30 minutes');
      await expect(dialog).toContainText('Read 20 pages');
      expect(await dialog.innerText()).not.toMatch(/\$\d|\bkg\b|mmHg|bpm/);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(history).toBeFocused();

      const edit = hall.getByRole('link', { name: 'Edit Read 20 pages' });
      await edit.click();
      const name = page.locator('#habit-name');
      await expect(name).toHaveValue('Read 20 pages');
      await name.fill('Read 21 pages');
      const failHabitWrite = (url: URL): boolean => /^\/api\/town\/habits\/\d+$/.test(url.pathname);
      await page.route(failHabitWrite, route => route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Town is unavailable right now.' }),
      }));
      await page.getByRole('button', { name: 'Save' }).click();
      await expect(name).toHaveValue('Read 21 pages');
      await expect(page.getByRole('dialog')).toContainText('Town is unavailable right now.');
      await page.unroute(failHabitWrite);
      await page.getByRole('button', { name: 'Cancel' }).click();
      await expect(page.locator('app-habit-dialog')).toHaveCount(0);

      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      const motion = await hall.evaluate(element => element.getAnimations({ subtree: true }).length);
      expect(motion).toBe(0);
      const scan = await new AxeBuilder({ page }).include('app-town-hall').analyze();
      expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
      expect(hallCalls.filter(path => !path.startsWith('/api/town') && !path.startsWith('/api/auth'))).toEqual([]);
      await info.attach(`hall-${width}-${theme}`, { body: await hall.screenshot(), contentType: 'image/png' });
    });
  }

  test('Back to Town returns focus to the Hall link', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript(() => localStorage.setItem('suite-theme', 'light'));
    await page.goto('/town');
    const entrance = page.getByRole('link', { name: 'Visit the Hall' });
    await entrance.click();
    await expect(page.getByRole('heading', { name: 'Hall', level: 1 })).toBeVisible();
    await page.getByRole('link', { name: 'Back to Town' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Terraria-on-Sea' })).toBeVisible();
    await expect(entrance).toBeFocused();
  });
});
