import assert from 'node:assert/strict';
import { chromium } from '../apps/finance/frontend/node_modules/playwright/index.mjs';

const base = process.env.SITE_TEST_URL ?? 'http://127.0.0.1:8086';
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || undefined, args: ['--no-sandbox'] });

async function collectViolations(context) {
  await context.addInitScript(() => {
    const key = '__cspViolations';
    const prior = sessionStorage.getItem(key);
    window.__cspViolations = prior ? JSON.parse(prior) : [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__cspViolations.push({
        directive: event.effectiveDirective || event.violatedDirective,
        blocked: event.blockedURI,
        source: event.sourceFile || '',
        line: event.lineNumber,
      });
      sessionStorage.setItem(key, JSON.stringify(window.__cspViolations));
    });
  });
}

async function violations(page) {
  return page.evaluate(() => window.__cspViolations || JSON.parse(sessionStorage.getItem('__cspViolations') || '[]'));
}

async function assertClean(page, label) {
  const found = await violations(page);
  assert.deepEqual(found, [], `${label} ${page.url()} ${JSON.stringify(found)}`);
}

try {
  for (const viewport of [{width: 1440, height: 1000}, {width: 390, height: 844}]) {
    const context = await browser.newContext({ viewport, bypassCSP: false });
    await collectViolations(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(`${page.url()} ${error.message}`));
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    assert.match(await page.title(), /Vivek/);
    assert.equal(await page.locator('a[href="/hub"]').count(), 1);
    await assertClean(page, 'portfolio');
    await page.goto(base + '/secrets', { waitUntil: 'networkidle' });
    await page.locator('#secret-message').fill('Browser round-trip 🌍');
    await page.getByRole('button', { name: 'Encrypt message', exact: true }).click();
    await page.getByRole('button', { name: 'Decrypt message', exact: true }).click();
    await page.getByRole('heading', { name: 'Decrypted message', exact: true }).waitFor();
    assert.match(await page.locator('main').innerText(), /Browser round-trip 🌍/);
    await assertClean(page, 'secrets');
    await page.goto(base + '/auth/login', { waitUntil: 'networkidle' });
    assert.equal(await page.locator('app-root').count(), 1);
    assert.match(await page.locator('body').innerText(), /Sign in|Create the first account/i);
    await assertClean(page, 'login');
    for (const route of ['/finance/', '/hub']) {
      await page.goto(base + route, { waitUntil: 'networkidle' });
      assert.match(await page.locator('body').innerText(), /sign in|username|passphrase/i, route);
      await assertClean(page, route);
    }
    await page.goto(base + '/travel/', { waitUntil: 'networkidle' });
    assert.match(await page.locator('body').innerText(), /sign in|username|passphrase/i, '/travel/');
    await page.evaluate(() => {
      const div = document.createElement('div');
      div.id = 'csp-map-probe';
      div.style.cssText = 'height:220px;width:320px';
      document.body.appendChild(div);
      if (!window.L || !window.L.map) throw new Error('Leaflet did not load');
      const map = window.L.map(div, { scrollWheelZoom: false });
      window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);
      map.setView([37.77, -122.42], 12);
    });
    await page.waitForTimeout(400);
    await assertClean(page, 'travel map');
    let releaseMedia;
    const mediaGate = new Promise((resolve) => { releaseMedia = resolve; });
    await page.route('**/media/api/**', async (route) => {
      await mediaGate;
      await route.continue();
    });
    await page.goto(base + '/media/', { waitUntil: 'domcontentloaded' });
    await page.locator('#app').waitFor();
    await page.evaluate(() => new Promise((resolve) => {
      const img = new Image();
      const done = () => resolve(true);
      img.onload = done;
      img.onerror = done;
      img.src = 'https://image.tmdb.org/t/p/w342/csp-probe.jpg';
      setTimeout(done, 1500);
    }));
    await assertClean(page, 'media artwork host');
    releaseMedia();
    await page.waitForURL('**/auth/login**', { timeout: 15000 });
    await page.waitForLoadState('networkidle');
    assert.match(await page.locator('body').innerText(), /sign in|username|passphrase/i, '/media/');
    await assertClean(page, 'media after sign-in redirect');
    assert.deepEqual(errors, [], `Browser errors at viewport ${viewport.width}: ${errors.join('\n')}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
    assert.equal(overflow, false, 'Horizontal overflow');
    await context.close();
  }

  const context = await browser.newContext({ bypassCSP: false });
  await collectViolations(context);
  const page = await context.newPage();
  await page.goto(base + '/auth/login', { waitUntil: 'networkidle' });
  const blockedImage = await page.evaluate(() => new Promise((resolve) => {
    const before = window.__cspViolations.length;
    const img = new Image();
    const finish = () => resolve(window.__cspViolations.slice(before));
    img.onload = finish;
    img.onerror = finish;
    img.src = 'https://image.tmdb.org/t/p/w342/csp-probe.jpg';
    setTimeout(finish, 1500);
  }));
  assert.ok(blockedImage.some((item) => String(item.directive).includes('img-src')), `finance should refuse artwork hosts ${JSON.stringify(blockedImage)}`);
  const inlineRan = await page.evaluate(() => {
    const script = document.createElement('script');
    try {
      script.textContent = 'window.__cspRan = 1';
      document.head.appendChild(script);
    } catch {
      return window.__cspRan || 0;
    }
    return window.__cspRan || 0;
  });
  assert.equal(inlineRan, 0, 'finance document executed an injected inline script');
  const htmlAllowed = await page.evaluate(() => {
    const el = document.createElement('div');
    try {
      el.innerHTML = '<b>x</b>';
      return true;
    } catch {
      return false;
    }
  });
  assert.equal(htmlAllowed, false, 'Trusted Types did not block a raw HTML assignment on finance');
  await context.close();
  console.log('Browser checks passed: desktop/mobile portfolio, crypto demo, shared login, all protected apps, and zero CSP violations');
} finally {
  await browser.close();
}
