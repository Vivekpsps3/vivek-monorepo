import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';

// Only run against a disposable, initially empty release database.
const base = process.env.SITE_TEST_URL ?? 'http://127.0.0.1:8086';
const tile = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || undefined, args: ['--no-sandbox'] });
async function contextFor(viewport) {
  const context = await browser.newContext({ viewport, baseURL: base, bypassCSP: false });
  await context.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', e => window.__cspViolations.push({ directive: e.effectiveDirective, blocked: e.blockedURI }));
  });
  await context.route(/^https:\/\/(tile\.openstreetmap\.org|image\.tmdb\.org|covers\.openlibrary\.org|coverartarchive\.org)\//,
    route => route.fulfill({ contentType: 'image/png', body: tile }));
  return context;
}
async function clean(page) {
  assert.deepEqual(await page.evaluate(() => window.__cspViolations), [], page.url());
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, `overflow: ${page.url()}`);
}
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await contextFor(viewport);
    const page = await context.newPage();
    const errors = [], apiRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/\/(?:api|travel\/api|media\/api)\//.test(new URL(request.url()).pathname)) apiRequests.push(request.url()); });
    for (const route of ['/', '/home', '/work', '/about']) {
      const response = await page.goto(route, { waitUntil: 'networkidle' });
      assert.equal(response.status(), 200);
      assert.match(await page.title(), /Vivek/);
      await clean(page);
    }
    assert.deepEqual(apiRequests, [], 'public pages must not fetch private APIs');
    await page.goto('/secrets', { waitUntil: 'networkidle' });
    await page.locator('#secret-message').fill('Browser round-trip 🌍');
    await page.getByRole('button', { name: 'Encrypt message', exact: true }).click();
    await page.getByRole('button', { name: 'Decrypt message', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Decrypted message', exact: true })).toBeVisible();
    await expect(page.locator('main')).toContainText('Browser round-trip 🌍');
    await clean(page);
    for (const route of ['/auth/login', '/hub', '/finance/', '/travel/', '/media/']) {
      await page.goto(route, { waitUntil: 'networkidle' });
      await expect(page.locator('app-root')).toHaveCount(1);
      await expect(page.locator('body')).toContainText(/Sign in|Create the first account/);
      await clean(page);
    }
    assert.deepEqual(errors, [], `browser errors at ${viewport.width}`);
    await context.close();
  }
  const context = await contextFor({ width: 1280, height: 900 });
  const page = await context.newPage();
  const errors = [], referrers = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().startsWith('https://tile.openstreetmap.org/')) referrers.push(request.headers()['referer']); });
  await page.goto('/auth/login', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Create the first account', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Username', exact: true }).fill('csp-check');
  await page.getByRole('textbox', { name: 'Display name', exact: true }).fill('CSP Check');
  await page.getByRole('textbox', { name: 'Vault passphrase', exact: true }).fill('synthetic-csp-passphrase');
  await page.getByRole('button', { name: 'Create admin account', exact: true }).click();
  await expect(page).toHaveURL(/\/hub/);
  await clean(page);
  for (const route of ['/finance/', '/finance/transactions', '/finance/embed', '/travel/', '/media/library', '/hub']) {
    await page.evaluate(path => { history.pushState({}, '', path); dispatchEvent(new PopStateEvent('popstate')); }, route);
    await expect(page.locator('main').first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('link', { name: 'Hub', exact: true })).toHaveCount(1);
    await clean(page);
  }
  const csrf = (await context.cookies()).find(cookie => cookie.name === 'finance_csrf')?.value;
  assert.ok(csrf);
  const created = await context.request.post('/travel/api/trips', { headers: { 'X-CSRF-Token': decodeURIComponent(csrf) }, data: {
    title: 'Release map', start_date: '2026-11-01', end_date: '2026-11-02',
    stays: [{ city: 'Zero Island', arrive_on: '2026-11-01', leave_on: '2026-11-02', lat: 0, lng: 0 }],
  } });
  assert.equal(created.status(), 201, await created.text());
  await page.goto('/travel/trips/' + (await created.json()).id, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Show map', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Map ready' })).toBeVisible();
  await page.getByRole('button', { name: 'Show on map', exact: true }).click();
  await expect(page.locator('.leaflet-popup')).toContainText('Zero Island');
  assert.ok(referrers.length > 0);
  assert.ok(referrers.every(value => value === new URL(base).origin + '/'));
  await clean(page);
  for (const host of ['image.tmdb.org', 'covers.openlibrary.org', 'coverartarchive.org']) {
    assert.equal(await page.evaluate(host => new Promise(resolve => {
      const img = new Image(); img.onload = () => resolve(true); img.onerror = () => resolve(false);
      img.src = 'https://' + host + '/synthetic-csp-probe.png';
    }), host), true, `allowed artwork: ${host}`);
  }
  await clean(page);
  assert.deepEqual(errors, []);
  const probes = await page.evaluate(async () => {
    const imageBlocked = await new Promise(resolve => {
      const img = new Image(); img.onerror = () => resolve(true); img.onload = () => resolve(false);
      img.src = 'https://untrusted.invalid/probe.png';
    });
    let htmlBlocked = false;
    try { document.createElement('div').innerHTML = '<b>x</b>'; } catch { htmlBlocked = true; }
    const script = document.createElement('script');
    try { script.textContent = 'window.__injected = 1'; document.head.appendChild(script); } catch { /* Trusted Types rejects before CSP. */ }
    return { imageBlocked, htmlBlocked, injected: window.__injected || 0 };
  });
  assert.deepEqual(probes, { imageBlocked: true, htmlBlocked: true, injected: 0 });
  await context.close();
  console.log('Browser checks passed: public pages, local crypto, shared sign-in, private SPA journeys, Leaflet, artwork, CSP and Trusted Types');
} finally { await browser.close(); }
