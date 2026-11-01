import { chooseColorTheme, openUserMenu } from '../../../tests/e2e/user-menu.mjs';
import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { ptoChoice } from './dates.mjs';
import AxeBuilder from '@axe-core/playwright';

const tile = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
const tileUrl = 'https://tile.openstreetmap.org/**';
const mapRegion = page => page.getByRole('region', { name: 'Trip map', exact: true });

async function createTrip(request, extra = {}) {
  const response = await request.post('/travel/api/trips', { data: {
    title: 'Map recovery trip', start_date: '2026-11-01', end_date: '2026-11-04',
    stays: [{ city: 'Zero Island', arrive_on: '2026-11-01', leave_on: '2026-11-04', lat: 0, lng: 0 }],
    ...extra,
  } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

async function observeSecurity(page) {
  const errors = [];
  const referrers = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (request.url().startsWith('https://tile.openstreetmap.org/')) referrers.push(request.headers()['referer']);
  });
  await page.addInitScript(() => {
    window.mapCspFailures = [];
    document.addEventListener('securitypolicyviolation', event => window.mapCspFailures.push(event.violatedDirective));
  });
  return async () => {
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => window.mapCspFailures)).toEqual([]);
    expect(referrers.length).toBeGreaterThan(0);
    expect(referrers.every(value => value === new URL(page.url()).origin + '/')).toBe(true);
  };
}

test.beforeEach(async ({ request }) => {
  expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
});

for (const [width, theme] of [[390, 'light'], [1280, 'dark']]) test.describe(`map recovery at ${width}px ${theme}`, () => {
  test.use({ viewport: { width, height: 900 } });

  test('tile outage stays visible while showing a place, and explicit retry recovers', async ({ page, request }) => {
    const trip = await createTrip(request);
    const clean = await observeSecurity(page);
    let unavailable = true;
    await page.route(tileUrl, route => unavailable
      ? route.abort('failed') : route.fulfill({ contentType: 'image/png', body: tile }));
    await page.goto('/travel/trips/' + trip.id + '?private=never-send-to-tiles');
    await chooseColorTheme(page, theme);
    await page.getByRole('button', { name: 'Show map', exact: true }).click();
    const map = mapRegion(page);
    await expect(map.getByRole('button', { name: 'Retry map' })).toBeVisible();
    await map.getByRole('button', { name: 'Show on map' }).click();
    await expect(map.getByRole('status')).toContainText('Map tiles could not load', { timeout: 3000 });
    await expect(map.getByRole('status')).toContainText('Showing Zero Island');
    await expect(map.locator('.map-canvas')).toBeFocused();
    await expect(map.locator('.leaflet-popup')).toContainText('Zero Island');
    const popup = await map.locator('.leaflet-popup-content-wrapper').boundingBox();
    const header = await page.locator('.suite-header').boundingBox();
    expect(popup.y).toBeGreaterThanOrEqual(header.y + header.height);
    await expect(map.getByRole('link', { name: 'Open map', exact: false })).toHaveAttribute('href', 'https://www.openstreetmap.org/?mlat=0&mlon=0#map=12/0/0');
    await expect(map.getByRole('link', { name: 'OpenStreetMap contributors' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: test.info().outputPath('map-tile-outage.png'), fullPage: true });
    unavailable = false;
    await map.getByRole('button', { name: 'Retry map' }).click();
    await expect(map.getByRole('button', { name: 'Retry map' })).toHaveCount(0);
    await expect(map.getByRole('status')).toContainText('Map ready');
    await expect(map.locator('.map-canvas')).toBeFocused();
    await expect(map.locator('.leaflet-interactive')).toHaveCount(1);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: test.info().outputPath('map-recovered.png'), fullPage: true });
    await clean();
  });

  test('keyboard zoom survives shell rendering and closing/reopening destroys the previous map', async ({ page, request }) => {
    const trip = await createTrip(request);
    const clean = await observeSecurity(page);
    await page.route(tileUrl, route => route.fulfill({ contentType: 'image/png', body: tile }));
    await page.addInitScript(() => {
      const orig = Map.prototype.set, maps = [], seen = new Set();
      window.__lviewMaps = maps;
      Map.prototype.set = function (key, value) {
        if (typeof key === 'number' && Array.isArray(value) && !seen.has(this)) { seen.add(this); maps.push(this); }
        return orig.call(this, key, value);
      };
    });
    await page.goto('/travel/trips/' + trip.id);
    await page.getByRole('button', { name: 'Show map', exact: true }).click();
    const map = mapRegion(page);
    await expect(map.getByRole('status')).toContainText('Map ready', { timeout: 3000 });
    const zooms = () => map.locator('.leaflet-tile[src]').evaluateAll(images => [...new Set(images.map(image => Number(new URL(image.src).pathname.split('/')[1])))].sort((a, b) => a - b));
    await expect.poll(zooms).toEqual([12]);
    await map.locator('.map-canvas').focus();
    await page.keyboard.press('+');
    await expect.poll(zooms).toEqual([13]);
    const openCanvas = await map.locator('.map-canvas').elementHandle();
    await page.evaluate(() => {
      const raw = document.querySelector('app-root').__ngContext__;
      const view = typeof raw === 'number' ? window.__lviewMaps.map(map => map.get(raw)).find(Boolean) : raw;
      const strategy = view[8].router.routeReuseStrategy;
      let handle = null, armed = true;
      strategy.shouldDetach = route => armed && route.routeConfig?.path === 'trips/:id';
      strategy.store = (route, next) => {
        if (route.routeConfig?.path !== 'trips/:id') return;
        handle = next;
        if (next) armed = false;
      };
      strategy.shouldAttach = route => route.routeConfig?.path === 'trips/:id' && !!handle;
      strategy.retrieve = route => route.routeConfig?.path === 'trips/:id' ? handle : null;
    });
    await (await openUserMenu(page)).getByRole('link', { name: 'Settings', exact: true }).click();
    await page.getByRole('link', { name: 'Appearance', exact: true }).click();
    const radio = page.locator(`input[name="color-theme"][value="${theme}"]`);
    if (!(await radio.isChecked())) await radio.click();
    await expect(radio).toBeChecked();
    expect(page.context().pages()).toHaveLength(1);
    await page.goBack();
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/travel/trips/${trip.id}$`));
    expect(await openCanvas.evaluate(node => node.isConnected)).toBe(true);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme-choice', theme);
    await expect(map.getByRole('status')).toContainText('Map ready');
    await expect.poll(zooms).toEqual([13]);
    const oldCanvas = openCanvas;
    for (let visit = 0; visit < 3; visit++) {
      await page.getByRole('button', { name: 'Hide map', exact: true }).click();
      await expect(map).toHaveCount(0);
      await page.getByRole('button', { name: 'Show map', exact: true }).click();
      await expect(map.locator('.leaflet-tile-pane')).toHaveCount(1);
      await expect(map.locator('.leaflet-interactive')).toHaveCount(1);
      await expect(map.getByRole('status')).toContainText('Map ready');
    }
    expect(await oldCanvas.evaluate(node => node.isConnected)).toBe(false);
    await page.getByRole('navigation', { name: 'Travel sections', exact: true }).getByRole('link', { name: 'Trips', exact: true }).click();
    await expect(page.locator('.leaflet-container')).toHaveCount(0);
    await page.getByRole('heading', { name: 'Map recovery trip', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Show map', exact: true })).toBeVisible();
    await expect(page.locator('.leaflet-container')).toHaveCount(0);
    await clean();
  });

  test('partial tile failure stays actionable across an unrelated trip save', async ({ page, request }) => {
    const trip = await createTrip(request);
    let failed = false;
    await page.route(tileUrl, route => {
      if (!failed) { failed = true; return route.abort('failed'); }
      return route.fulfill({ contentType: 'image/png', body: tile });
    });
    await page.goto('/travel/trips/' + trip.id);
    await page.getByRole('button', { name: 'Show map', exact: true }).click();
    const map = mapRegion(page);
    await expect(map.getByRole('button', { name: 'Retry map' })).toBeVisible();
    await page.getByText('Add more', { exact: true }).click();
    await page.getByRole('button', { name: 'Add note', exact: true }).click();
    await page.getByRole('textbox', { name: 'Note', exact: true }).fill('Keep the map state while saving this note');
    await page.getByRole('button', { name: 'Save note', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(map.getByRole('status')).toContainText('Map tiles could not load', { timeout: 3000 });
    await map.getByRole('button', { name: 'Retry map' }).click();
    await expect(map.getByRole('status')).toContainText('Map ready');
    await expect(map.getByRole('button', { name: 'Retry map' })).toHaveCount(0);
  });

  test('unresolved places need explicit search and selection; timeout, throttling and no-match remain distinct', async ({ page, request }) => {
    const trip = await createTrip(request, { stays: [{ city: 'Springfield', arrive_on: '2026-11-01', leave_on: '2026-11-04' }] });
    let tiles = 0;
    await page.route(tileUrl, route => { tiles++; return route.fulfill({ contentType: 'image/png', body: tile }); });
    let searches = 0;
    await page.route('**/travel/api/places/search?**', route => {
      searches++;
      if (searches === 1) return route.fulfill({ status: 504, json: { code: 'timeout', message: 'Place search timed out. Try again.' } });
      if (searches === 2) return route.fulfill({ status: 429, json: { code: 'throttled', message: 'Place search is busy. Try again shortly.' } });
      return route.fulfill({ json: { results: searches === 3 ? [] : [{ label: 'Springfield, USA', lat: 39.78, lng: -89.64 }, { label: 'Springfield, Australia', lat: -27.65, lng: 152.91 }] } });
    });
    await page.goto('/travel/trips/' + trip.id);
    await chooseColorTheme(page, theme);
    await page.getByRole('button', { name: 'Show map', exact: true }).click();
    await expect(mapRegion(page).getByText('Location has not been chosen.', { exact: true })).toBeVisible();
    await expect(mapRegion(page).locator('.leaflet-interactive')).toHaveCount(0);
    expect(tiles).toBe(0);
    await page.getByRole('button', { name: 'Choose location', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Choose location', exact: true });
    await dialog.getByLabel('Place search').fill('  ');
    await dialog.getByRole('button', { name: 'Find places' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Enter a place name between 2 and 200 characters.');
    expect(searches).toBe(0);
    await dialog.getByLabel('Place search').fill('Springfield');
    expect(searches).toBe(0);
    await dialog.getByRole('button', { name: 'Find places' }).click();
    await expect(dialog.getByRole('alert')).toContainText('timed out');
    await expect(dialog.getByLabel('Place search')).toHaveValue('Springfield');
    await dialog.getByRole('button', { name: 'Find places' }).click();
    await expect(dialog.getByRole('alert')).toContainText('busy');
    await dialog.getByRole('button', { name: 'Find places' }).click();
    await expect(dialog.getByText('No matching locations. Try a more specific place name.', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Find places' }).click();
    await expect(dialog.getByRole('button', { name: 'Springfield, USA', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Springfield, Australia', exact: true })).toBeVisible();
    const before = await (await request.get('/travel/api/trips/' + trip.id)).json();
    expect(before.stays[0].lat).toBeNull();
    await dialog.getByRole('button', { name: 'Springfield, Australia', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(mapRegion(page).locator('.leaflet-interactive')).toHaveCount(1);
    await expect.poll(() => tiles).toBeGreaterThan(0);
    const after = await (await request.get('/travel/api/trips/' + trip.id)).json();
    expect([after.stays[0].lat, after.stays[0].lng]).toEqual([-27.65, 152.91]);
    expect(searches).toBe(4);
  });
});

test('changing a place query cancels the old request and cannot select an obsolete result', async ({ page, request }) => {
  const trip = await createTrip(request);
  let release, entered, finished;
  const held = new Promise(resolve => { release = resolve; });
  const ready = new Promise(resolve => { entered = resolve; });
  const completed = new Promise(resolve => { finished = resolve; });
  await page.route('**/travel/api/places/search?**', async route => {
    const old = new URL(route.request().url()).searchParams.get('q') === 'Old city';
    if (old) { entered(); await held; }
    await route.fulfill({ json: { results: [{ label: old ? 'Obsolete place' : 'Current place', lat: old ? 10 : 20, lng: 0 }] } });
    if (old) finished();
  });
  await page.goto('/travel/trips/' + trip.id);
  await page.getByRole('button', { name: 'Choose location', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Choose location', exact: true });
  await dialog.getByLabel('Place search').fill('Old city');
  await dialog.getByRole('button', { name: 'Find places' }).click();
  await ready;
  const cancelled = page.waitForEvent('requestfailed', event => event.url().includes('q=Old'));
  await dialog.getByLabel('Place search').fill('New city');
  await cancelled;
  await expect(dialog.getByRole('button', { name: 'Find places' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Find places' }).click();
  await expect(dialog.getByRole('button', { name: 'Current place', exact: true })).toBeVisible();
  release();
  await completed;
  await expect(dialog.getByRole('button', { name: 'Obsolete place', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Current place', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const saved = await (await request.get('/travel/api/trips/' + trip.id)).json();
  expect([saved.stays[0].lat, saved.stays[0].lng]).toEqual([20, 0]);
});

test('multiple places retain literal labels and selected-place focus after resizing', async ({ page, request }) => {
  const label = 'Pacific <Coast>';
  const trip = await createTrip(request, { stays: [
    { city: 'Zero Island', arrive_on: '2026-11-01', leave_on: '2026-11-02', lat: 0, lng: 0 },
    { city: label, arrive_on: '2026-11-03', leave_on: '2026-11-04', lat: 35.68, lng: 139.69 },
  ] });
  const clean = await observeSecurity(page);
  await page.route(tileUrl, route => route.fulfill({ contentType: 'image/png', body: tile }));
  await page.goto('/travel/trips/' + trip.id);
  await page.getByRole('button', { name: 'Show map', exact: true }).click();
  const map = mapRegion(page);
  await expect(map.locator('.leaflet-interactive')).toHaveCount(2);
  await expect(map.getByRole('status')).toContainText('2 chosen locations');
  await page.setViewportSize({ width: 390, height: 900 });
  await map.getByRole('button', { name: 'Show on map' }).nth(1).click();
  await expect(map.locator('.map-canvas')).toBeFocused();
  await expect(map.locator('.leaflet-popup-content')).toHaveText(label);
  await expect(map.locator('.leaflet-popup-content coast')).toHaveCount(0);
  await expect(map.getByRole('status')).toContainText('Showing ' + label);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await clean();
});

test('missing map module reload protects unsaved PTO and works after the module becomes available', async ({ page, request }) => {
  const build = new URL('../../../dist/web/browser/', import.meta.url);
  const chunks = fs.readdirSync(build).filter(name => name.endsWith('.js') && fs.readFileSync(new URL(name, build), 'utf8').includes('1.9.4'));
  expect(chunks).toHaveLength(1);
  const trip = await createTrip(request);
  let missing = true;
  await page.route('**/' + chunks[0], route => missing ? route.abort('failed') : route.continue());
  await page.route(tileUrl, route => route.fulfill({ contentType: 'image/png', body: tile }));
  await page.goto('/travel/trips/' + trip.id);
  await page.getByRole('button', { name: 'Show map', exact: true }).click();
  await expect(mapRegion(page).getByRole('status')).toContainText('The map could not start');
  await expect(mapRegion(page).getByRole('link', { name: 'Open map', exact: false })).toBeVisible();
  await page.getByText('PTO · 3 days', { exact: true }).click();
  const pto = ptoChoice(page, '2026-11-01');
  await pto.selectOption({ label: 'PTO' });
  const warning = page.waitForEvent('dialog');
  const reload = mapRegion(page).getByRole('button', { name: 'Reload map page' }).click();
  const prompt = await warning;
  expect(prompt.type()).toBe('beforeunload');
  await prompt.dismiss();
  await reload;
  await expect(pto.locator('option:checked')).toHaveText('PTO');
  await expect(mapRegion(page).getByRole('button', { name: 'Reload map page' })).toBeVisible();
  missing = false;
  page.once('dialog', dialog => dialog.accept());
  await mapRegion(page).getByRole('button', { name: 'Reload map page' }).click();
  await page.getByRole('button', { name: 'Show map', exact: true }).click();
  await expect(mapRegion(page).getByRole('status')).toContainText('Map ready');
  await expect(page.getByRole('heading', { name: 'Map recovery trip', exact: true })).toBeVisible();
});
