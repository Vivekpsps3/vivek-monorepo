import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

for (const width of [390, 1280]) for (const theme of ['light', 'dark'] as const) {
  test(`Settings calendar capability lifecycle at ${width} ${theme}`, async ({page, request}, info) => {
    expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
    await page.setViewportSize({width, height: 900});
    await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
    let active = false, generation = 0, fail = true;
    const urls: string[] = [];
    await page.route('**/api/account/calendar-feeds{,/**}', async route => {
      const method = route.request().method();
      const row = {id: 1, scope: 'media', timezone: 'Asia/Kolkata'};
      if (method === 'GET') return route.fulfill({json: active ? [row] : []});
      if (method === 'DELETE') { active = false; return route.fulfill({status: 204}); }
      if (fail) { fail = false; return route.fulfill({status: 503, json: {detail: 'synthetic outage'}}); }
      active = true;
      const url = `https://calendar.example.test/calendar/feed.ics?token=synthetic-capability-${++generation}`;
      urls.push(url);
      return route.fulfill({status: 201, json: {...row, url}});
    });
    await page.goto('/settings/calendars');
    await expect(page.getByRole('heading', {level: 1, name: 'Calendars'})).toBeVisible();
    await expect(page.getByText('Anyone with the URL', {exact: false})).toBeVisible();
    await page.getByLabel('Calendar', {exact: true}).selectOption('media');
    await page.getByLabel('Timezone', {exact: true}).fill('Asia/Kolkata');
    await page.getByRole('button', {name: 'Create subscription'}).click();
    await expect(page.getByRole('status').filter({hasText: 'Could not update'})).toBeFocused();
    await expect(page.getByLabel('Timezone', {exact: true})).toHaveValue('Asia/Kolkata');
    await page.getByRole('button', {name: 'Create subscription'}).click();
    const field = page.getByLabel('One-time calendar URL');
    await expect(field).toBeFocused();
    await expect.poll(() => urls[0]).toBeTruthy();
    await expect(field).toHaveValue(urls[0]);
    await page.getByRole('button', {name: 'Copy URL', exact: true}).click();
    // HTTP fixture origins may deny clipboard permissions; manual-selection fallback is supported.
    await expect(page.getByRole('status').filter({hasText: /copied|Select and copy/})).toBeVisible();
    expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
    await page.screenshot({path: info.outputPath('calendar-subscription.png')});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    const stored = await page.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]));
    expect(stored).not.toContain('synthetic-capability');
    await page.getByRole('button', {name: 'Hide URL'}).click();
    await expect(field).toHaveCount(0);
    await expect(page.getByLabel('Calendar', {exact: true})).toBeFocused();
    await page.getByRole('button', {name: 'Rotate URL for media'}).click();
    await page.getByRole('dialog', {name: 'Rotate calendar URL?'}).getByRole('button', {name: 'Rotate URL', exact: true}).click();
    await expect.poll(() => urls[1]).toBeTruthy();
    await expect(field).toHaveValue(urls[1]);
    expect(urls[1]).not.toBe(urls[0]);
    await page.getByRole('button', {name: 'Revoke URL for media'}).click();
    await page.getByRole('dialog', {name: 'Revoke calendar URL?'}).getByRole('button', {name: 'Revoke URL', exact: true}).click();
    await expect(field).toHaveCount(0);
    await expect(page.getByText('No calendar subscriptions.', {exact: true})).toBeVisible();
    await expect(page.getByLabel('Calendar', {exact: true})).toBeFocused();
    await page.reload();
    await expect(field).toHaveCount(0);
  });
}
