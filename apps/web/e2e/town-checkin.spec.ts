import { expect, test, type Page } from '@playwright/test';
import type { TownResponse } from '../src/app/town/town.types';

// TH1 owns the town server, clock and seeds. These scenarios run with that harness.
// The synthetic principal is user 1, so the seen key is town.seen.v1.1.
test.describe('Town check-in', () => {
  test.fixme(true, 'Waiting for TH1 Town harness and fixtures to merge');
  test.use({ timezoneId: 'America/Los_Angeles' });
  test.beforeEach(async ({ page, request }) => {
    expect((await request.post('/e2e/reset?seed=town')).ok()).toBeTruthy();
    await page.clock.setFixedTime(new Date('2026-10-29T19:00:00Z'));
    await page.goto('/town');
    await expect(page.getByRole('heading', { name: 'Terraria-on-Sea' })).toBeVisible();
  });

  test('2: check-in and undo announce, keep focus, and persist', async ({ page }) => {
    const button = page.getByRole('button', { name: 'Mark Read 20 pages done for today' });
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(button).toBeFocused();
    await expect(page.locator('app-town-today [aria-live="polite"]')).toContainText(/Read 20 pages checked\. \d+-day streak\./);
    await button.click();
    await expect(page.getByRole('button', { name: 'Mark Read 20 pages done for today' })).toHaveAttribute('aria-pressed', 'false');
    await page.reload();
    await expect(page.getByRole('button', { name: 'Mark Read 20 pages done for today' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('3: one level-up toast', async ({ page }) => {
    await rememberOneTownLevelDown(page);
    await page.reload();
    await expect(page.getByRole('status').filter({ hasText: /reached Lv|Level up!/ })).toHaveCount(1);
  });

  test('3: reduced motion shows the toast without a swap', async ({ browser }) => {
    const context = await browser.newContext({ timezoneId: 'America/Los_Angeles', reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date('2026-10-29T19:00:00Z'));
    expect((await page.request.post('/e2e/reset?seed=town')).ok()).toBeTruthy();
    await page.goto('/town');
    await rememberOneTownLevelDown(page);
    await page.reload();
    await expect(page.locator('.swap')).toHaveCount(0);
    await expect(page.getByText(/reached Lv|Level up!/)).toBeVisible();
    await context.close();
  });

  test('13: visibility after the local date changes refetches unchecked rows', async ({ page, request }) => {
    expect((await request.post('/e2e/town/clock', { data: { iso: '2026-10-30T07:10:00Z' } })).ok()).toBeTruthy();
    await page.clock.setFixedTime(new Date('2026-10-30T07:10:00Z'));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.getByRole('button', { name: 'Mark Read 20 pages done for today' })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('button', { name: 'Mark Walk 30 minutes done for today' })).toHaveAttribute('aria-pressed', 'false');
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
