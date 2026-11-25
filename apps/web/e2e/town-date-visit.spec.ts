import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '../../../tests/e2e/fixtures';

const YEAR = '/pixels?year=2024&day=2024-02-29';
const LIFE = '/pixels/life?span=2024-02-29';
const YEAR_VISIT = '/town?visit=2024-02-29&from=year&year=2024';

async function activate(page: Page, name: string, touch: boolean): Promise<void> {
  const target = page.getByRole('link', { name, exact: true });
  await target.scrollIntoViewIfNeeded();
  await expect(target).toBeVisible();
  expect((await target.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  if (touch) await target.tap();
  else {
    await target.focus();
    await page.keyboard.press('Enter');
  }
}

function visit(page: Page) {
  return page.locator('app-date-visit');
}

for (const [width, height, theme] of [
  [390, 844, 'light'],
  [390, 844, 'dark'],
  [1280, 800, 'light'],
  [1280, 800, 'dark'],
] as const) {
  test.describe(`date visit at ${width}×${height} ${theme}`, () => {
    test.describe.configure({ timeout: 180_000 });
    test.use({
      viewport: { width, height },
      hasTouch: width === 390,
      timezoneId: 'America/Los_Angeles',
    });

    test.beforeEach(async ({ page, request }) => {
      expect((await request.post('/e2e/reset?seed=pixels-facts')).ok()).toBeTruthy();
      await page.clock.setFixedTime(new Date('2026-10-29T19:00:00Z'));
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme === 'dark' ? 'dark' : 'light' });
      await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
    });

    test('returns the year day and the life week after World, back, forward, and reload', async ({ page }) => {
      const touch = width === 390;
      await page.goto(YEAR);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await activate(page, 'Visit this day', touch);
      await expect(page).toHaveURL(url => url.pathname === '/town'
        && url.searchParams.get('visit') === '2024-02-29'
        && url.searchParams.get('from') === 'year'
        && url.searchParams.get('year') === '2024');
      const panel = visit(page);
      await expect(panel).toHaveAttribute('data-visit-state', 'recorded');
      await expect(panel).toHaveAttribute('data-origin', 'year');
      await expect(panel).toContainText('Thu, Feb 29, 2024');
      await expect(panel).toContainText('Read synthetic');
      await expect(panel).toContainText('Leap harbor');
      await expect(panel).toContainText('Current town layout');
      await expect(panel).not.toContainText('XP');
      await expect(panel).not.toContainText('synthetic private note');
      await expect(panel).not.toContainText('Foreign concept');
      await expect(panel).not.toContainText('Other habit');
      const motion = await panel.evaluate(node => getComputedStyle(node).transitionDuration);
      expect(motion).toBe('0s');
      expect(await panel.evaluate(node => node.getAnimations().length)).toBe(0);
      const scan = await new AxeBuilder({ page }).include('app-date-visit').analyze();
      expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);

      const beforeCamera = await page.evaluate(() => history.length);
      await page.getByText('View controls', { exact: true }).click();
      await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
      await page.getByRole('button', { name: 'Harbor', exact: true }).click();
      await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
      await page.getByRole('list', { name: 'Town buildings' }).getByRole('button', { name: 'Read synthetic' }).click();
      await expect(page).toHaveURL(/inspect=/);
      expect(await page.evaluate(() => history.length)).toBe(beforeCamera);
      expect(new URL(page.url()).searchParams.get('visit')).toBe('2024-02-29');
      await expect(page.locator('app-town-exterior [aria-label="Town buildings"]')).toBeVisible();

      await page.getByRole('button', { name: 'Activity', exact: true }).click();
      await expect(panel.locator('[data-activity="hidden"]')).toBeVisible();
      await expect(panel).toHaveAttribute('data-visit-state', 'recorded');
      await expect(panel).not.toContainText('Read synthetic');
      await expect(page.locator('app-town-exterior [aria-label="Town buildings"]')).toBeVisible();
      await page.getByRole('button', { name: 'Activity', exact: true }).click();
      await expect(panel).toContainText('Read synthetic');

      const beforeWorld = await page.evaluate(() => history.length);
      await activate(page, 'Open World for this date', touch);
      await expect(page).toHaveURL(url => url.pathname === '/town/world'
        && url.searchParams.get('visit') === '2024-02-29'
        && url.searchParams.get('day') === '2024-02-29'
        && url.searchParams.get('from') === 'year'
        && url.searchParams.get('year') === '2024');
      await expect(page.locator('.world-panel')).toHaveAttribute('data-day-state', 'recorded', { timeout: 20_000 });
      await page.getByRole('button', { name: 'Map', exact: true }).click();
      await expect(page.locator('canvas')).toBeVisible();
      const stage = page.locator('.world-stage');
      const box = await stage.boundingBox();
      if (!box) throw new Error('missing world stage');
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2, { steps: 5 });
      await page.mouse.up();
      expect(await page.evaluate(() => history.length)).toBe(beforeWorld + 1);
      const dragged = new URL(page.url());
      expect(dragged.searchParams.get('from')).toBe('year');
      expect(dragged.searchParams.get('year')).toBe('2024');
      await expect(page.getByRole('link', { name: 'See this day in Pixels' })).toHaveAttribute('href', '/pixels?year=2024&day=2024-02-29');
      await page.getByRole('button', { name: 'Activity markers', exact: true }).click();
      await expect(page.locator('.world-landscape')).toHaveAttribute('data-activity', 'off');
      await expect(page.getByRole('list', { name: 'Recorded items for this day' })).toBeVisible();
      await expect(page.locator('canvas')).toBeVisible();

      await page.goBack();
      await expect(page).toHaveURL(url => url.pathname === '/town' && url.searchParams.get('visit') === '2024-02-29');
      await page.goBack();
      await expect(page).toHaveURL(url => url.pathname === '/pixels'
        && url.searchParams.get('year') === '2024'
        && url.searchParams.get('day') === '2024-02-29');
      await page.goForward();
      await expect(page).toHaveURL(url => url.pathname === '/town' && url.searchParams.get('from') === 'year');
      await page.reload();
      await expect(visit(page).getByRole('link', { name: 'Back to 2024' })).toHaveAttribute('href', '/pixels?year=2024&day=2024-02-29');
      await expect(visit(page)).toContainText('Read synthetic');

      await page.goto(LIFE);
      await activate(page, 'Visit this life week', touch);
      await expect(page).toHaveURL(url => url.pathname === '/town'
        && url.searchParams.get('from') === 'life'
        && url.searchParams.get('span') === '2024-02-29'
        && url.searchParams.get('visit') === '2024-02-29');
      await expect(visit(page)).toHaveAttribute('data-origin', 'life');
      await expect(visit(page)).toHaveAttribute('data-origin-span', '2024-02-29');
      await expect(visit(page).getByRole('link', { name: /Back to week of/ })).toHaveAttribute('href', '/pixels/life?span=2024-02-29');
      await page.goBack();
      await expect(page).toHaveURL(/\/pixels\/life\?span=2024-02-29/);
      await page.goForward();
      await page.reload();
      await expect(visit(page)).toHaveAttribute('data-origin-span', '2024-02-29');
      await expect(visit(page)).toContainText('Read synthetic');
    });

    test('keeps an unrecorded day, a future day, an unavailable day, and a bad link distinct', async ({ page }) => {
      await page.goto('/town?visit=2024-01-15&from=year&year=2024');
      await expect(visit(page)).toHaveAttribute('data-visit-state', 'unrecorded');
      await expect(visit(page)).toContainText('Nothing recorded on 2024-01-15');
      await expect(visit(page)).not.toContainText('unavailable');
      await expect(visit(page)).not.toContainText('ahead');
      await expect(visit(page)).not.toContainText('rest');
      await page.getByRole('button', { name: 'Activity', exact: true }).click();
      await expect(visit(page)).toHaveAttribute('data-visit-state', 'unrecorded');
      await expect(page.locator('app-town-exterior')).toBeVisible();

      await page.goto('/town?visit=2026-12-01&from=year&year=2026');
      await expect(visit(page)).toHaveAttribute('data-visit-state', 'future');
      await expect(visit(page)).toContainText('2026-12-01 is still ahead.');
      await expect(visit(page)).not.toContainText('Nothing recorded');
      await expect(visit(page)).not.toContainText('unavailable');

      await page.route('**/api/pixels/day**', route => route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{}',
      }));
      await page.goto('/town?visit=2024-03-03&from=year&year=2024');
      await expect(visit(page)).toHaveAttribute('data-visit-state', 'unavailable');
      await expect(visit(page)).toContainText('Records for 2024-03-03 are unavailable.');
      await expect(visit(page)).not.toContainText('Nothing recorded');
      await expect(visit(page)).not.toContainText('ahead');
      const retry = page.getByRole('button', { name: 'Retry records' });
      expect((await retry.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      await page.unroute('**/api/pixels/day**');

      await page.goto('/town?visit=2024-02-31&from=year&year=2024');
      await expect(visit(page)).toHaveAttribute('data-visit-state', 'invalid');
      await expect(visit(page)).toContainText('2024-02-31 is not a date.');
      await expect(visit(page)).not.toContainText('Nothing recorded');
      await expect(page.getByRole('link', { name: 'Town today' })).toHaveAttribute('href', '/town');
    });
  });
}

test('a direct visit URL is the canonical return when history state is gone', async ({ page, request }) => {
  expect((await request.post('/e2e/reset?seed=pixels-facts')).ok()).toBeTruthy();
  await page.clock.setFixedTime(new Date('2026-10-29T19:00:00Z'));
  await page.goto(YEAR_VISIT);
  await expect(visit(page).getByRole('link', { name: 'Back to 2024' })).toHaveAttribute('href', '/pixels?year=2024&day=2024-02-29');
  await expect(visit(page)).toHaveAttribute('data-visit-state', 'recorded');
  await page.reload();
  await expect(visit(page)).toContainText('Leap harbor');
  await expect(page).toHaveURL(url => url.searchParams.get('visit') === '2024-02-29' && url.searchParams.get('year') === '2024');
});
