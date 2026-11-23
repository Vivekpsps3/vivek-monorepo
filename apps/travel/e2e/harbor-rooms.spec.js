import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../../../tests/e2e/fixtures';
import { chooseColorTheme } from '../../../tests/e2e/user-menu.mjs';

const usd = (amount) => new RegExp(`\\$\\u2060${amount.replace('.', '\\.')}`);

const views = [
  { name: 'phone', viewport: { width: 390, height: 844 }, theme: 'dark', hasTouch: true },
  { name: 'desktop', viewport: { width: 1280, height: 800 }, theme: 'light', hasTouch: false },
];

function tripByTitle(home, title) {
  return [...home.in_progress, ...home.upcoming, ...home.past].find((trip) => trip.title === title);
}

async function press(page, locator, touch) {
  if (touch) await locator.tap();
  else {
    await locator.focus();
    await page.keyboard.press('Enter');
  }
}

async function expectTarget(locator) {
  const box = await locator.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
}

async function createTrip(request, data) {
  const created = await request.post('/travel/api/trips', { data });
  expect(created.ok(), await created.text()).toBeTruthy();
  return created.json();
}

async function seedHarbor(request) {
  const coast = await createTrip(request, {
    title: 'Paper coast',
    status: 'planning',
    start_date: '2026-12-01',
    end_date: '2026-12-03',
    counts_as_pto: false,
    stays: [{
      city: 'Paper Harbor',
      arrive_on: '2026-12-01',
      leave_on: '2026-12-03',
      lat: 1,
      lng: 2,
    }],
  });
  const base = `/travel/api/trips/${coast.id}`;
  expect((await request.post(`${base}/plans`, {
    data: { title: 'Museum hour', kind: 'activity', on_date: '2026-12-02', cost: '15.00', currency: 'USD', paid: false },
  })).ok()).toBeTruthy();
  expect((await request.post(`${base}/transports`, {
    data: { mode: 'flight', role: 'outbound', carrier: 'SYN', number: '1', cost: '12.00', currency: 'USD', paid: true },
  })).ok()).toBeTruthy();
  expect((await request.post(`${base}/transports`, {
    data: { mode: 'ferry', role: 'local', number: 'BELL' },
  })).ok()).toBeTruthy();
  const returned = await createTrip(request, {
    title: 'Paper return',
    status: 'done',
    start_date: '2026-10-01',
    end_date: '2026-10-03',
    counts_as_pto: false,
    stays: [{ city: 'Paper City', arrive_on: '2026-10-01', leave_on: '2026-10-03' }],
  });
  expect((await request.post(`/travel/api/trips/${returned.id}/plans`, {
    data: { title: 'Paper card', kind: 'activity', on_date: '2026-10-02', cost: '3.00', currency: 'USD', paid: true },
  })).ok()).toBeTruthy();
  return { coast, returned };
}

test.beforeEach(async ({ request }) => {
  expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
});

for (const view of views) {
  test.describe(`harbor rooms ${view.name}`, () => {
    test.use({ viewport: view.viewport, hasTouch: view.hasTouch, reducedMotion: 'reduce' });

    test(`postcards, a failed map, and locked Finance stay on the saved trip (${view.name})`, async ({ page, request }) => {
      test.setTimeout(90_000);
      const { coast } = await seedHarbor(request);
      const ptoBefore = await (await request.get('/travel/api/pto')).json();
      const memories = await (await request.get('/travel/api/memories?tz=UTC')).json();
      const planned = memories.memories.find((row) => row.title === 'Paper coast');
      const completed = memories.memories.find((row) => row.title === 'Paper return');
      const home = await (await request.get('/travel/api/home')).json();
      const savedCoast = tripByTitle(home, 'Paper coast');
      expect(savedCoast.pto.counts).toBe(false);
      expect(savedCoast.pto.days).toBe('0');
      expect(planned.status).toBe('planning');
      expect(completed.status).toBe('done');
      expect(planned.span_text).not.toBe(completed.span_text);

      const writes = [];
      page.on('request', (req) => {
        const url = req.url();
        if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method()) && url.includes('/travel/api/')) {
          writes.push(`${req.method()} ${new URL(url).pathname}`);
        }
      });
      await page.route('https://tile.openstreetmap.org/**', (route) => route.abort('failed'));
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: view.theme === 'dark' ? 'dark' : 'light' });
      await page.goto('/travel/terminal?room=gallery');
      await chooseColorTheme(page, view.theme);
      await expect(page.getByRole('heading', { level: 2, name: 'Souvenir gallery', exact: true })).toBeVisible();
      const plannedCard = page.getByRole('button', { name: 'Select planned postcard Paper coast' });
      const completedCard = page.getByRole('button', { name: 'Select completed postcard Paper return' });
      await expect(plannedCard).toBeVisible();
      await expect(completedCard).toBeVisible();
      await expect(plannedCard).toContainText(planned.span_text);
      await expect(completedCard).toContainText(completed.span_text);

      const facts = page.locator('#harbor-facts');
      await press(page, plannedCard, view.hasTouch);
      await expect(facts).toContainText(`Status ${planned.status}.`);
      await expect(facts).toContainText(planned.span_text);
      await expect(facts).toContainText(`${planned.span_start} through ${planned.span_end}`);
      await expect(facts).not.toContainText(`Status ${completed.status}.`);
      await expect(facts).toContainText('PTO charge 0 days.');
      await expect(facts).toContainText(savedCoast.pto.note);
      await expect(facts).toContainText('This room does not add a PTO charge.');
      await expect(facts.getByText(usd('15.00'))).toBeVisible();
      await expect(facts.getByText(usd('12.00'))).toBeVisible();
      await expect(facts.getByText('Hidden while Finance is locked').first()).toBeVisible();

      await press(page, completedCard, view.hasTouch);
      await expect(facts).toContainText(`Status ${completed.status}.`);
      await expect(facts).toContainText(completed.span_text);
      await expect(facts).toContainText(`${completed.span_start} through ${completed.span_end}`);
      await expect(facts).not.toContainText(planned.span_text);
      await expect(facts).not.toContainText(`Status ${planned.status}.`);

      await press(page, plannedCard, view.hasTouch);
      const note = page.locator('#harbor-note');
      await note.fill('quay pencil');
      const reloaded = page.waitForResponse((res) => res.url().includes('/travel/api/memories') && res.ok());
      await press(page, page.getByRole('button', { name: 'Reload this room', exact: true }), view.hasTouch);
      await reloaded;
      await expect(note).toHaveValue('quay pencil');

      await press(page, page.getByRole('button', { name: 'Ring the model ferry', exact: true }), view.hasTouch);
      const ferry = page.locator('#harbor-ferry-status');
      await expect(ferry).toContainText('Trip status remains planning.');
      await expect(ferry).toContainText('does not complete a trip');
      await expect(ferry).not.toContainText('done');
      const afterRing = await (await request.get(`/travel/api/trips/${coast.id}`)).json();
      expect(afterRing.status).toBe('planning');
      expect(afterRing.end_date).toBe('2026-12-03');
      expect(afterRing.counts_as_pto).toBe(false);
      expect(writes).toEqual([]);

      await expectTarget(plannedCard);
      await expectTarget(page.getByRole('button', { name: 'Ring the model ferry', exact: true }));
      await expectTarget(note);
      await expectTarget(page.getByRole('link', { name: 'Open allocation', exact: true }));
      expect(await page.locator('.harbor-room').evaluate((node) => getComputedStyle(node).animationName)).toBe('none');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect.poll(() => page.locator('body').evaluate((node) => getComputedStyle(node).color)).toBe(
        view.theme === 'dark' ? 'rgb(255, 240, 212)' : 'rgb(24, 46, 64)',
      );
      const galleryAxe = await new AxeBuilder({ page }).analyze();
      expect(galleryAxe.violations.filter((item) => item.id === 'color-contrast' || ['serious', 'critical'].includes(item.impact))).toEqual([]);
      await page.screenshot({ path: test.info().outputPath(`harbor-gallery-${view.name}.png`), fullPage: true });

      const back = page.getByRole('button', { name: '← Terminal', exact: true });
      await press(page, back, view.hasTouch);
      await expect(page).toHaveURL(/\/travel\/terminal\?/);
      await expect(page.locator('#terminal-souvenir-gallery')).toBeFocused();

      await press(page, page.getByRole('button', { name: 'Map room', exact: true }), view.hasTouch);
      await expect(page.getByRole('heading', { level: 2, name: 'Map room', exact: true })).toBeVisible();
      const destination = page.getByRole('button', { name: 'Select City Paper Harbor, Paper coast', exact: true });
      await expect(destination).toBeVisible();
      await press(page, destination, view.hasTouch);
      const map = page.getByRole('region', { name: 'Trip map', exact: true });
      await expect(map.getByRole('status')).toContainText('Map tiles could not load', { timeout: 8_000 });
      await expect(page.getByRole('button', { name: 'Show day 2026-12-01, Paper coast, Paper Harbor', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Show day 2026-12-03, Paper coast, Paper Harbor', exact: true })).toBeVisible();
      await expect(page.getByText('Saved ferry BELL', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Ring the model ferry', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Saved souvenir Planned Paper coast' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Saved souvenir Completed Paper return' })).toBeVisible();
      await expect(facts).toContainText('PTO charge 0 days.');
      await expect(facts).toContainText('Hidden while Finance is locked');
      await expect(facts.getByText(usd('15.00'))).toBeVisible();
      await expect(facts.getByText(usd('12.00'))).toBeVisible();
      await expectTarget(destination);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const mapAxe = await new AxeBuilder({ page }).analyze();
      expect(mapAxe.violations.filter((item) => item.id === 'color-contrast' || ['serious', 'critical'].includes(item.impact))).toEqual([]);
      await page.screenshot({ path: test.info().outputPath(`harbor-map-${view.name}.png`), fullPage: true });

      await press(page, page.getByRole('link', { name: 'Open allocation', exact: true }), view.hasTouch);
      await expect(page).toHaveURL(new RegExp(`/travel/trips/${coast.id}$`));
      await expect(page.getByRole('heading', { level: 1, name: 'Paper coast', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: /^PTO/ })).toBeVisible();
      const ptoAfter = await (await request.get('/travel/api/pto')).json();
      expect(ptoAfter.entries).toEqual(ptoBefore.entries);
      const still = await (await request.get(`/travel/api/trips/${coast.id}`)).json();
      expect(still.status).toBe('planning');
      expect(still.end_date).toBe('2026-12-03');
    });
  });
}

test('a failed souvenir load keeps the private note', async ({ page, request }) => {
  await seedHarbor(request);
  let failed = false;
  await page.route('**/travel/api/memories**', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    if (!failed) {
      failed = true;
      return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    }
    return route.continue();
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/travel/terminal?room=gallery');
  const note = page.locator('#harbor-note');
  await expect(note).toBeVisible();
  await note.fill('quay pencil');
  await expect(page.getByText("Couldn't load saved souvenirs.", { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Select planned postcard Paper coast' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Retry souvenirs', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Select planned postcard Paper coast' })).toBeVisible();
  await expect(note).toHaveValue('quay pencil');
  const home = await (await request.get('/travel/api/home')).json();
  const titles = [...home.in_progress, ...home.upcoming, ...home.past].map((trip) => trip.title).sort();
  expect(titles).toEqual(['Paper coast', 'Paper return']);
});

test('a late room response does not restore a note after sign-out', async ({ page }) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let held;
  const started = new Promise((resolve) => { held = resolve; });
  const hold = async (route, body) => {
    if (route.request().method() !== 'GET') return route.continue();
    held();
    await gate;
    await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify(body) });
  };
  await page.route('**/travel/api/home', (route) => hold(route, {
    in_progress: [],
    upcoming: [{ id: 9, title: 'Secret harbor', transports: [], days: [], stays: [] }],
    past: [],
  }));
  await page.route('**/travel/api/memories**', (route) => hold(route, {
    memories: [{
      id: 'trip:9',
      trip_id: 9,
      title: 'Secret harbor',
      status: 'done',
      mark: 'completed',
      mark_label: 'Completed',
      span_start: '2026-01-01',
      span_end: '2026-01-02',
      span_text: 'January 1, 2026 through January 2, 2026',
    }],
  }));
  const loading = page.goto('/travel/terminal?room=gallery');
  await started;
  await page.locator('#harbor-note').fill('quay pencil');
  const ended = await page.request.post('/api/auth/logout', {
    headers: { 'X-CSRF-Token': 'synthetic-csrf', Origin: new URL(page.url()).origin },
  });
  expect(ended.ok(), await ended.text()).toBeTruthy();
  release();
  await loading;
  await expect(page).toHaveURL(/\/auth\/login/);
  await expect(page.getByText('Secret harbor')).toHaveCount(0);
  await expect(page.getByText('quay pencil')).toHaveCount(0);
  await expect(page.locator('#harbor-note')).toHaveCount(0);
});
