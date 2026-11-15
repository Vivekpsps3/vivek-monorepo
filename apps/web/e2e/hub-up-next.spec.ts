import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '../../../tests/e2e/fixtures';

const reminder = { id: 7, title: 'Check in', due_at: '2026-12-24T09:00', done: false, kind: 'flight', notes: 'Keep this note' };
const event = { id: 7, kind: 'reminder', date: '2026-12-24', time: '09:00', tz: null, title: 'Check in', overdue: true,
  trip_id: 12, trip_title: 'Kyoto', href: '/travel/trips/12', reminder };
const travel = { today: '2026-12-25', next_trip: { id: 12, title: 'Kyoto', destination: 'Kyoto', start_date: '2026-12-26',
  end_date: '2027-01-07', phase: 'upcoming', days_until: 1, next_action: 'Leaves tomorrow', href: '/travel/trips/12' },
  up_next: [event, { ...event, id: 12, kind: 'trip_start', date: '2026-12-26', time: null, title: 'Kyoto starts', overdue: false, reminder: null }] };
const summary = { currently: [{ id: 4, title: 'Example series', kind: 'tv', progress_label: 'S1 E1' }], recent_reviews: [], upcoming: [], next_episodes: [] };
const mediaEvent = (title: string) => ({ type: 'episode', title, entry_id: 4, watched: false, release_status: 'scheduled' });

async function sources(page: Page) {
  const calls: string[] = [];
  await page.route('**/travel/api/summary?*', route => { calls.push('travel'); return route.fulfill({ json: travel }); });
  await page.route('**/media/api/summary', route => { calls.push('media'); return route.fulfill({ json: summary }); });
  await page.route('**/media/api/calendar?*', route => {
    const month = new URL(route.request().url()).searchParams.get('month');
    calls.push(month!);
    return route.fulfill({ json: { days: [{ date: month === '2026-12' ? '2026-12-25' : '2027-01-07', events: [mediaEvent(month === '2026-12' ? 'Premiere' : 'Finale')] }] } });
  });
  return calls;
}

test.beforeEach(async ({ page, request }) => {
  expect((await request.post('/e2e/reset?seed=pixels')).ok()).toBeTruthy();
  await page.clock.setFixedTime(new Date('2026-12-25T20:00:00Z'));
});

test('one set of source reads feeds the cards and filtered list across a year boundary', async ({ page }) => {
  const calls = await sources(page);
  const forbidden: string[] = [];
  page.on('request', request => { if (/\/calendar\/refresh|tmdb|musicbrainz|geocod/i.test(request.url())) forbidden.push(request.url()); });
  await page.goto('/hub');
  const next = page.getByRole('region', { name: 'Up next' });
  await expect(next.getByRole('link', { name: 'Check in' })).toBeVisible();
  await expect(next.getByRole('link', { name: 'Premiere' })).toBeVisible();
  await expect(next.getByRole('link', { name: 'Finale' })).toBeVisible();
  await expect(next).toContainText('Overdue');
  await expect(next).toContainText('Bills hidden: Finance is locked');
  await expect(page.getByRole('region', { name: 'In progress' })).toContainText('Example series');
  await expect(page.getByRole('region', { name: 'Next trip' })).toContainText('Kyoto');
  const filter = next.getByRole('button', { name: 'Travel', exact: true });
  await filter.focus(); await page.keyboard.press('Space');
  await expect(filter).toHaveAttribute('aria-pressed', 'false');
  await expect(next.getByRole('link', { name: 'Check in' })).toHaveCount(0);
  await expect(next.getByRole('link', { name: 'Premiere' })).toBeVisible();
  await page.keyboard.press('Space');
  await expect(next.getByRole('link', { name: 'Check in' })).toBeVisible();
  expect(calls.sort()).toEqual(['2026-12', '2027-01', 'media', 'travel']);
  expect(forbidden).toEqual([]);
});

test('reminder failure rolls back, retry sends the full replacement and Undo preserves it', async ({ page }) => {
  await sources(page);
  const bodies: unknown[] = [];
  await page.route('**/travel/api/reminders/7', route => {
    bodies.push(route.request().postDataJSON());
    return route.fulfill({ status: bodies.length === 1 ? 503 : 200, json: {} });
  });
  await page.goto('/hub');
  const next = page.getByRole('region', { name: 'Up next' });
  const done = next.getByRole('button', { name: 'Mark Check in done' });
  await done.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toContainText('Couldn\'t mark "Check in" done. Try again.');
  await expect(done).toBeEnabled();
  await done.click();
  await expect(next.locator('li.done')).toContainText('Check in');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(done).toBeEnabled();
  await expect(next.locator('li.done')).toHaveCount(0);
  const { id: _id, ...body } = reminder;
  expect(bodies).toEqual([{ ...body, done: true }, { ...body, done: true }, body]);
});

test('a failed source retries alone while Travel actions remain usable', async ({ page }) => {
  const calls = await sources(page);
  let reads = 0;
  await page.route('**/media/api/summary', route => { calls.push('media'); reads += 1; return route.fulfill({ status: reads === 1 ? 503 : 200, json: summary }); });
  await page.goto('/hub');
  const next = page.getByRole('region', { name: 'Up next' });
  await expect(next.getByRole('link', { name: 'Check in' })).toBeVisible();
  await expect(next).toContainText("Couldn't load Media dates.");
  await next.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(next.getByRole('link', { name: 'Finale' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'In progress' })).toContainText('Example series');
  expect(calls.filter(call => call === 'travel')).toHaveLength(1);
  expect(calls.filter(call => call === 'media')).toHaveLength(2);
  expect(calls.filter(call => call === '2026-12')).toHaveLength(2);
  expect(calls.filter(call => call === '2027-01')).toHaveLength(2);
});

test('the existing episode action refreshes the shared Media snapshot and removes watched dates', async ({ page }) => {
  const calls = await sources(page);
  let watched = false;
  await page.route('**/media/api/summary', route => {
    calls.push('media');
    return route.fulfill({ json: { ...summary, next_episodes: watched ? [] : [{ entry_id: 4, episode_id: 1,
      show_title: 'Example series', season: 1, episode: 1, state: 'next', air_date: '2026-12-25' }] } });
  });
  await page.route('**/media/api/calendar?*', route => {
    const month = new URL(route.request().url()).searchParams.get('month')!;
    calls.push(month);
    return route.fulfill({ json: { days: month === '2026-12' ? [{ date: '2026-12-25', events: [{ ...mediaEvent('Premiere'), watched }] }] : [] } });
  });
  await page.route('**/media/api/entries/4/episodes/next', route => {
    watched = true;
    return route.fulfill({ json: { marked: { episode_id: 1, season_number: 1, episode_number: 1, title: 'Premiere', label: 'S1E1' }, show: { next_episode: null } } });
  });
  await page.goto('/hub');
  const next = page.getByRole('region', { name: 'Up next' });
  await expect(next.getByRole('link', { name: 'Premiere' })).toBeVisible();
  await page.getByRole('region', { name: 'In progress' }).getByRole('button', { name: 'Watched S1E1' }).click();
  await expect(page.locator('.toast').filter({ hasText: 'Marked S1E1 watched' })).toBeVisible();
  await expect(next.getByRole('link', { name: 'Premiere' })).toHaveCount(0);
  await expect(next.getByRole('link', { name: 'Check in' })).toBeVisible();
  expect(calls.filter(call => call === 'travel')).toHaveLength(1);
  for (const source of ['media', '2026-12', '2027-01']) expect(calls.filter(call => call === source)).toHaveLength(2);
});

for (const width of [390, 1280]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`compact Hub actions and states at ${width} ${theme}`, async ({ page, request }, info) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
      await sources(page);
      await page.goto('/hub');
      const next = page.getByRole('region', { name: 'Up next' });
      await expect(next.getByRole('link', { name: 'Check in' })).toBeVisible();
      await expect(page.locator('.pixel-strip .pixel')).toHaveCount(91);
      expect(await page.locator('#up-next-heading').evaluate(node => node.getBoundingClientRect().top)).toBeLessThan(350);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      for (const control of [next.getByRole('button', { name: 'Mark Check in done' }), page.getByRole('link', { name: 'Open Travel', exact: true }), page.getByRole('link', { name: 'Open Media', exact: true }), page.getByRole('link', { name: 'Open Finance', exact: true })]) {
        const box = await control.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await info.attach(`hub-up-next-${width}-${theme}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      expect((await request.post('/e2e/reset?seed=pixels-empty')).ok()).toBeTruthy();
      await page.route('**/travel/api/summary?*', route => route.fulfill({ json: { today: '2026-12-25', next_trip: null, up_next: [] } }));
      await page.route('**/media/api/summary', route => route.fulfill({ json: { currently: [], upcoming: [], recent_reviews: [], next_episodes: [] } }));
      await page.route('**/media/api/calendar?*', route => route.fulfill({ json: { days: [] } }));
      await page.reload();
      await expect(page.getByRole('region', { name: 'Next trip' })).toContainText('No trips yet');
      await expect(page.getByRole('region', { name: 'In progress' })).toContainText('Nothing in progress');
      await expect(page.locator('.compact-locked')).toContainText('Finance is locked');
      expect((await page.getByRole('region', { name: 'Net worth' }).boundingBox())!.height).toBeLessThan(215);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await info.attach(`hub-empty-${width}-${theme}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    });
  }
}
