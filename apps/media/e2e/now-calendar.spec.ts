import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Locator, type Page } from '../../../tests/e2e/fixtures';
import {
  addItem,
  deferred,
  expectCleanMediaPage,
  expectSectionHeading,
  resetMedia,
  watchMediaConsole,
} from './media-test';

test.beforeEach(async ({ request }) => resetMedia(request));
test.use({ reducedMotion: 'reduce' });

function thisMonth(now = new Date()) {
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const next = new Date(now.getFullYear(), now.getMonth() + 2, 1);
  const nextMonth = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
  return {
    month,
    label: now.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    day: `${month}-${String(last).padStart(2, '0')}`,
    nextMonth,
  };
}

async function seed(request: APIRequestContext) {
  const when = thisMonth();
  const show = await addItem(request, { kind: 'tv', title: 'Harbor Signal', status: 'in_progress' });
  expect((await request.post(`/media/api/entries/${show.id}/episodes`, {
    data: { season_number: 1, episode_number: 1, title: 'Pilot', air_date: '2000-01-01' },
  })).ok()).toBeTruthy();
  const band = await addItem(request, {
    kind: 'movie',
    title: 'Paper Month',
    status: 'anticipating',
    anticipated: true,
    release_on: `${when.month}-20`,
    release_precision: 'month',
    release_status: 'scheduled',
  });
  const night = await addItem(request, {
    kind: 'movie',
    title: 'Night Screening',
    status: 'anticipating',
    anticipated: true,
    release_on: when.day,
    release_precision: 'day',
  });
  const undated = await addItem(request, {
    kind: 'movie',
    title: 'Undated Reel',
    status: 'anticipating',
    anticipated: true,
  });
  const later = await addItem(request, {
    kind: 'movie',
    title: 'December Lantern',
    status: 'anticipating',
    anticipated: true,
    release_on: `${when.nextMonth}-15`,
    release_precision: 'day',
  });
  return { when, show, band, night, undated, later };
}

function countCalendar(page: Page) {
  const counts = { get: 0, post: 0 };
  page.on('request', (request) => {
    if (!request.url().includes('/media/api/calendar')) return;
    if (request.method() === 'POST') counts.post += 1;
    else if (request.method() === 'GET') counts.get += 1;
  });
  return counts;
}

async function theme(page: Page, choice: 'light' | 'dark') {
  await page.addInitScript((value) => localStorage.setItem('suite-theme', value), choice);
}

async function activate(control: Locator, pointer: 'keyboard' | 'touch') {
  await control.scrollIntoViewIfNeeded();
  if (pointer === 'touch') {
    await control.tap();
    return;
  }
  await control.focus();
  await control.press('Enter');
}

async function expectTarget(control: Locator) {
  const box = await control.boundingBox();
  expect(box).toBeTruthy();
  expect(Math.min(box!.width, box!.height)).toBeGreaterThanOrEqual(44);
}

async function expectAxe(page: Page) {
  const scan = await new AxeBuilder({ page }).include('main').analyze();
  expect(scan.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
}

test('Now and Calendar share one saved read at phone size', async ({ page, request }) => {
  test.setTimeout(90_000);
  const violations: string[] = [];
  const counts = countCalendar(page);
  const { when } = await seed(request);
  watchMediaConsole(page, violations);
  await theme(page, 'light');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/media');
  await expectSectionHeading(page, 'Now');
  const card = page.locator('media-card').filter({ hasText: 'Harbor Signal' });
  const next = card.getByRole('button', { name: /Watched S1E1/ });
  await expect(next).toBeVisible();
  await expect(page.getByText('Paper Month', { exact: true })).toBeVisible();
  await expect(page.getByText(when.label, { exact: false }).first()).toBeVisible();
  await expect(page.getByText(/Paper Month · .*, 1/)).toHaveCount(0);
  await expect(page.getByText(/\d{4}-\d{2}-\d{2}/)).toHaveCount(0);
  await expect(page.getByText('Undated Reel', { exact: true })).toBeVisible();
  await expect(page.getByText('Date unknown', { exact: false }).first()).toBeVisible();
  const calendarLink = page.getByRole('link', { name: 'See where these dates sit' });
  await expectTarget(calendarLink);
  await expectTarget(next);
  const refresh = page.getByRole('button', { name: 'Refresh release metadata' });
  await expectTarget(refresh);
  expect(counts.post).toBe(0);
  const getsAfterNow = counts.get;
  expect(getsAfterNow).toBe(1);
  await activate(calendarLink, 'keyboard');
  await expect(page).toHaveURL(new RegExp(`/media/calendar\\?month=${when.month}`));
  await expect(page.getByRole('heading', { name: 'This month', exact: true })).toBeVisible();
  await expect(page.getByText(`Paper Month · ${when.label}`, { exact: true })).toBeVisible();
  await expect(page.getByText(/Paper Month · .*, 1/)).toHaveCount(0);
  await expect(page.getByText('Undated Reel · Date unknown', { exact: true })).toBeVisible();
  expect(counts.get).toBe(getsAfterNow);
  expect(counts.post).toBe(0);
  const monthInput = page.getByLabel('Month');
  await expectTarget(monthInput);
  await expect(monthInput).toHaveValue(when.month);
  await activate(page.getByRole('button', { name: 'Refresh release metadata' }), 'keyboard');
  await expect.poll(() => counts.post).toBe(1);
  await expect(page.getByRole('button', { name: 'Refresh release metadata' })).toBeFocused();
  expect(counts.get).toBe(getsAfterNow);
  const body = await (await request.get(`/media/api/calendar?month=${when.month}`)).json();
  if ((body.unconfigured || []).includes('tmdb')) {
    await expect(page.getByText('TMDB is not configured. Saved release dates stay available.')).toBeVisible();
  } else {
    await expect(page.getByText('TMDB is not configured')).toHaveCount(0);
  }
  await expectAxe(page);
  await expectCleanMediaPage(page, violations);
});

test.describe('night touch', () => {
  test.use({ hasTouch: true, viewport: { width: 1280, height: 800 } });

test('night touch uses the same saved calendar', async ({ page, request }) => {
  test.setTimeout(90_000);
  const violations: string[] = [];
  const counts = countCalendar(page);
  const { when } = await seed(request);
  watchMediaConsole(page, violations);
  await theme(page, 'dark');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/media');
  await expectSectionHeading(page, 'Now');
  await expect.poll(() => page.locator('body').evaluate((node) => getComputedStyle(node).color)).toBe('rgb(255, 240, 212)');
  const refresh = page.getByRole('button', { name: 'Refresh release metadata' });
  await expect(refresh).toBeVisible();
  expect(counts.get).toBe(1);
  expect(counts.post).toBe(0);
  await refresh.tap();
  await expect.poll(() => counts.post).toBe(1);
  await page.getByRole('link', { name: 'See where these dates sit' }).tap();
  await expect(page).toHaveURL(new RegExp(`month=${when.month}`));
  await expect(page.getByText(`Paper Month · ${when.label}`, { exact: true })).toBeVisible();
  expect(counts.get).toBe(1);
  expect(counts.post).toBe(1);
  await expectAxe(page);
  await expectCleanMediaPage(page, violations);
});
});

test('a late refresh does not move the other month', async ({ page, request }) => {
  test.setTimeout(90_000);
  const violations: string[] = [];
  const counts = countCalendar(page);
  const { when } = await seed(request);
  const pending = deferred();
  await page.route('**/media/api/calendar/refresh**', async (route) => {
    await pending.promise;
    await route.fulfill({
      json: {
        month: '2020-01',
        today: '2020-01-15',
        partial: false,
        days: [{
          date: '2020-01-02',
          events: [{
            type: 'anticipated',
            title: 'Late Ghost',
            detail: 'Anticipated',
            entry_id: null,
            precision: 'day',
            on: '2020-01-02',
            release_on: '2020-01-02',
            watched: false,
          }],
        }],
        month_band: [],
        year_band: [],
        unknown: [],
      },
    });
  });
  watchMediaConsole(page, violations);
  await theme(page, 'light');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/media/calendar?month=${when.month}`);
  await expect(page.getByText('Paper Month', { exact: true })).toBeVisible();
  const refresh = page.getByRole('button', { name: 'Refresh release metadata' });
  const refreshing = refresh.click();
  await expect.poll(() => counts.post).toBe(1);
  const monthInput = page.getByLabel('Month');
  await monthInput.fill(when.nextMonth);
  await expect(page).toHaveURL(new RegExp(`month=${when.nextMonth}`));
  await expect(page.getByText('December Lantern', { exact: true })).toBeVisible();
  pending.resolve();
  await refreshing;
  await expect(page.getByText('Late Ghost')).toHaveCount(0);
  await expect(page.getByText('December Lantern', { exact: true })).toBeVisible();
  await expect(monthInput).toHaveValue(when.nextMonth);
  expect(counts.post).toBe(1);
  await expectCleanMediaPage(page, violations);
});

test.describe('phone touch outage', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

test('a provider outage keeps the saved calendar and the next episode', async ({ page, request }) => {
  test.setTimeout(90_000);
  const violations: string[] = [];
  const counts = countCalendar(page);
  const { when } = await seed(request);
  await page.route('**/media/api/calendar/refresh**', (route) => {
    return route.fulfill({ status: 502, json: { message: 'Release source unavailable' } });
  });
  watchMediaConsole(page, violations);
  await theme(page, 'dark');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/media');
  await expectSectionHeading(page, 'Now');
  const next = page.locator('media-card').filter({ hasText: 'Harbor Signal' }).getByRole('button', { name: /Watched S1E1/ });
  await expect(next).toBeVisible();
  await expect(page.getByText(`Paper Month`, { exact: true })).toBeVisible();
  const gets = counts.get;
  expect(gets).toBe(1);
  expect(counts.post).toBe(0);
  await page.getByRole('button', { name: 'Refresh release metadata' }).tap();
  await expect(page.locator('main [role=alert]')).toContainText('Release source unavailable');
  await expect(page.getByText('Paper Month', { exact: true })).toBeVisible();
  await expect(next).toBeVisible();
  expect(counts.post).toBe(1);
  expect(counts.get).toBe(gets);
  await page.getByRole('link', { name: 'See where these dates sit' }).tap();
  await expect(page).toHaveURL(new RegExp(`month=${when.month}`));
  await expect(page.getByText(`Paper Month · ${when.label}`, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Watched S1E1/ })).toHaveCount(0);
  expect(counts.get).toBe(gets);
  expect(counts.post).toBe(1);
  await page.goBack();
  await expect(next).toBeVisible();
  expect(counts.get).toBe(gets);
  expect(counts.post).toBe(1);
  await expectAxe(page);
  await expectCleanMediaPage(page, violations);
});
});

test('series shelf next episode and detail back still return to the collection', async ({ page, request }) => {
  test.setTimeout(90_000);
  const violations: string[] = [];
  await seed(request);
  watchMediaConsole(page, violations);
  await theme(page, 'light');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/media/library?kind=tv&sort=title');
  const card = page.locator('.lounge-row').filter({ hasText: 'Harbor Signal' });
  const next = card.getByRole('button', { name: /Watched S1E1/ });
  await expect(next).toBeVisible();
  await card.getByRole('link', { name: 'Harbor Signal', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Harbor Signal', exact: true })).toBeVisible();
  await page.getByRole('link', { name: '← Library' }).click();
  await expect(page).toHaveURL(/kind=tv/);
  await expect(page.getByRole('button', { name: /Watched S1E1/ })).toBeVisible();
  await expectAxe(page);
  await expectCleanMediaPage(page, violations);
});
