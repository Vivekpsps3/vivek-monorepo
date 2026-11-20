import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../../../tests/e2e/fixtures';

const FOREIGN_HABIT = "Other's habit";

test.describe('Town habit actions', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });
  test.beforeEach(async ({ page, request }) => {
    expect((await request.post('/e2e/reset?seed=town')).ok()).toBeTruthy();
    await page.clock.setFixedTime(new Date('2026-10-29T19:00:00Z'));
    await page.addInitScript(() => localStorage.setItem('suite-theme', 'light'));
  });

  test('keyboard check-in, undo, history legend, and focus return at 1280', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/town');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    const check = page.locator('app-town-today').getByRole('button', { name: /Read 20 pages/ });
    await expect(check).toHaveAccessibleName('Mark Read 20 pages done for today');
    await check.focus();
    await page.keyboard.press('Enter');
    await expect(check).toHaveAccessibleName('Read 20 pages, done today. Undo');
    await expect(check).toBeFocused();
    await expect(page.locator('app-town-today [aria-live="polite"]')).toContainText(/Read 20 pages checked\. \d+-day streak\./);
    await page.keyboard.press('Enter');
    await expect(check).toHaveAccessibleName('Mark Read 20 pages done for today');
    await expect(page.locator('app-town-today [aria-live="polite"]')).toContainText('Read 20 pages undone.');

    const history = page.getByRole('button', { name: 'History' });
    await history.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'History' })).toBeVisible();
    const legend = dialog.getByRole('list', { name: 'History legend' });
    await expect(legend).toContainText('Done');
    await expect(legend).toContainText('Rest');
    await expect(legend).toContainText('Missed');
    await expect(legend).toContainText('Pending');
    await expect(legend).toContainText('No check');
    await expect(dialog.locator('table .mark[data-kind="done"]').first()).toBeVisible();
    const kinds = await legend.locator('.mark').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-kind')));
    expect(kinds).toEqual(['done', 'rest', 'miss', 'pending', 'empty']);
    await page.keyboard.press('Escape');
    await expect(history).toBeFocused();

    await page.getByRole('button', { name: /Walk 30 minutes/ }).first().focus();
    await page.keyboard.press('Enter');
    await page.locator('app-town-exterior').getByRole('button', { name: 'Edit habit' }).focus();
    await page.keyboard.press('Enter');
    const cadence = page.getByLabel('Cadence');
    await expect(cadence).toBeVisible();
    await expect(page.getByRole('button', { name: 'Archive habit' })).toBeVisible();
    await cadence.selectOption('4');
    await page.getByRole('button', { name: 'Save' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.getByRole('button', { name: /Walk 30 minutes/ }).first().focus();
    await page.keyboard.press('Enter');
    await page.locator('app-town-exterior').getByRole('button', { name: 'Edit habit' }).click();
    await expect(page.getByText('Changes to 4× a week from Mon 2 Nov')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('app-town-exterior').getByRole('button', { name: 'Edit habit' })).toBeFocused();
    expect(await page.content()).not.toContain(FOREIGN_HABIT);
  });

  test('a held check-in does not post twice', async ({ page }) => {
    let posts = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route(/\/api\/town\/habits\/\d+\/checkins/, async route => {
      if (route.request().method() !== 'POST') return route.continue();
      posts += 1;
      await gate;
      await route.continue();
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/town');
    const button = page.locator('app-town-today').getByRole('button', { name: /Read 20 pages/ });
    await button.click();
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    await expect(button).toHaveAccessibleName('Read 20 pages, done today. Undo');
    await button.click({ force: true });
    await expect.poll(() => posts).toBe(1);
    release();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(button).not.toHaveAttribute('aria-disabled', 'true');
    expect(posts).toBe(1);
  });

  test('failed history blocks yesterday marking at 1280 and 390', async ({ page }) => {
    let posts = 0;
    await page.route(/\/api\/town\/habits\/\d+\/checkins/, async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'unavailable' }) });
        return;
      }
      posts += 1;
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    });
    for (const [width, height, theme] of [[1280, 800, 'light'], [390, 844, 'dark']] as const) {
      await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
      await page.setViewportSize({ width, height });
      await page.goto('/town');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.getByRole('button', { name: 'History' }).click();
      const dialog = page.getByRole('dialog');
      const yesterday = dialog.getByRole('button', { name: 'Mark yesterday' });
      await expect(yesterday).toHaveAttribute('aria-disabled', 'true');
      await expect(dialog.getByRole('status').filter({ hasText: 'Yesterday cannot be marked' })).toBeVisible();
      await yesterday.click({ force: true });
      expect(posts).toBe(0);
      const box = await yesterday.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('heading', { name: 'History' })).toHaveCount(0);
    }
  });
});

test.describe('Town habit actions by touch', () => {
  test.use({ hasTouch: true, timezoneId: 'America/Los_Angeles' });

  test('creates, checks in, edits cadence, and archives at 390 night with reduced motion', async ({ page, request }, info) => {
    test.setTimeout(120_000);
    expect((await request.post('/e2e/reset?seed=town')).ok()).toBeTruthy();
    await page.clock.setFixedTime(new Date('2026-10-29T19:00:00Z'));
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.addInitScript(() => localStorage.setItem('suite-theme', 'dark'));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/town');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.getByRole('button', { name: '+ New habit' }).tap();
    await page.locator('#habit-name').fill('Stretch 10 minutes');
    await page.getByRole('button', { name: 'Save' }).tap();
    const created = page.locator('app-town-today').getByRole('button', { name: /Stretch 10 minutes/ });
    await expect(created).toHaveAccessibleName('Mark Stretch 10 minutes done for today');
    const box = await created.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
    await created.tap();
    await expect(created).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('app-town-today [aria-live="polite"]')).toContainText(/Stretch 10 minutes checked/);

    await page.getByRole('list', { name: 'Town buildings' }).getByRole('button', { name: /Stretch 10 minutes/ }).tap();
    await page.locator('app-town-exterior').getByRole('button', { name: 'Edit habit' }).tap();
    await page.getByLabel('Cadence').selectOption('4');
    await page.getByRole('button', { name: 'Save' }).tap();
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.getByRole('list', { name: 'Town buildings' }).getByRole('button', { name: /Stretch 10 minutes/ }).tap();
    await page.locator('app-town-exterior').getByRole('button', { name: 'Edit habit' }).tap();
    await expect(page.getByText(/Changes to 4× a week from Mon 2 Nov/)).toBeVisible();
    await page.getByRole('button', { name: 'Archive habit' }).tap();
    await page.getByRole('dialog', { name: 'Archive habit' }).getByRole('button', { name: 'Archive', exact: true }).tap();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.getByRole('button', { name: 'History' }).tap();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('list', { name: 'History legend' })).toBeVisible();
    await expect(dialog).toContainText('Stretch 10 minutes');
    await expect(dialog.getByText(/Archived /)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    const scan = await new AxeBuilder({ page }).include('app-town').analyze();
    expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
    await info.attach('town-habits-390-night', { body: await page.screenshot(), contentType: 'image/png' });
    expect(await page.content()).not.toContain(FOREIGN_HABIT);
  });
});
