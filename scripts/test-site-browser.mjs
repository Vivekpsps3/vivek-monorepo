import assert from 'node:assert/strict';
import { chromium } from '../apps/finance/frontend/node_modules/playwright/index.mjs';

const base = process.env.SITE_TEST_URL ?? 'http://127.0.0.1:8086';
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || undefined, args: ['--no-sandbox'] });
try {
  for (const viewport of [{width: 1440, height: 1000}, {width: 390, height: 844}]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    assert.match(await page.title(), /Vivek/);
    assert.equal(await page.locator('a[href="/hub"]').count(), 1);
    await page.goto(base + '/secrets', { waitUntil: 'networkidle' });
    await page.locator('#secret-message').fill('Browser round-trip 🌍');
    await page.getByRole('button', { name: 'Encrypt message', exact: true }).click();
    await page.getByRole('button', { name: 'Decrypt message', exact: true }).click();
    await page.getByRole('heading', { name: 'Decrypted message', exact: true }).waitFor();
    assert.match(await page.locator('main').innerText(), /Browser round-trip 🌍/);
    await page.goto(base + '/auth/login', { waitUntil: 'networkidle' });
    assert.equal(await page.locator('app-root').count(), 1);
    assert.match(await page.locator('body').innerText(), /Sign in|Create the first account/i);
    for (const route of ['/finance/', '/hub', '/travel/', '/media/']) {
      await page.goto(base + route, { waitUntil: 'networkidle' });
      assert.match(await page.locator('body').innerText(), /sign in|username|passphrase/i, route);
    }
    assert.deepEqual(errors, [], `Browser errors at viewport ${viewport.width}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
    assert.equal(overflow, false, 'Horizontal overflow');
    await context.close();
  }
  console.log('Browser checks passed: desktop/mobile portfolio, crypto demo, shared login and all protected apps');
} finally {
  await browser.close();
}
