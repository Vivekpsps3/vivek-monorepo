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
    await button.click();
    await expect(button).toHaveAccessibleName('Mark Read 20 pages done for today');
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await page.reload();
    await expect(page.locator('app-town-today').getByRole('button', { name: 'Mark Read 20 pages done for today' })).toHaveAttribute('aria-pressed', 'false');
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
    expect((await request.post('/e2e/town/clock', { data: { iso: '2026-10-30T07:10:00Z' } })).ok()).toBeTruthy();
    await page.clock.setFixedTime(new Date('2026-10-30T07:10:00Z'));
    let body: TownResponse | undefined;
    const refresh = page.waitForResponse(async response => {
      if (new URL(response.url()).pathname !== '/api/town' || response.request().method() !== 'GET') return false;
      try {
        const payload = await response.json() as TownResponse;
        if (payload.town?.today === '2026-10-30' && payload.town?.tz === 'America/Los_Angeles') {
          body = payload;
          return true;
        }
      } catch {
        return false;
      }
      return false;
    });
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await refresh;
    expect(body?.town.tz).toBe('America/Los_Angeles');
    expect(body?.town.today).toBe('2026-10-30');
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
    expect(await page.content()).not.toContain(FOREIGN_HABIT);
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
