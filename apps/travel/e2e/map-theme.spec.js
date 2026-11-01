import { openUserMenu } from '../../../tests/e2e/user-menu.mjs';
import { expect, test } from '@playwright/test';
const tile = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
test('map renders in the Appearance theme after returning to the trip', async ({ page, request }) => {
  expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
  const created = await request.post('/travel/api/trips', { data: { title: 'Theme map trip', start_date: '2026-11-01', end_date: '2026-11-04', stays: [{ city: 'Zero Island', arrive_on: '2026-11-01', leave_on: '2026-11-04', lat: 0, lng: 0 }] } });
  expect(created.ok(), await created.text()).toBeTruthy(); const trip = await created.json();
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ contentType: 'image/png', body: tile })); await page.goto('/travel/trips/' + trip.id);
  await (await openUserMenu(page)).getByRole('link', { name: 'Settings', exact: true }).click(); await page.getByRole('link', { name: 'Appearance', exact: true }).click();
  const radio = page.locator('input[name="color-theme"][value="dark"]');
  if (!(await radio.isChecked())) await radio.click(); await expect(radio).toBeChecked();
  await page.goBack(); await page.goBack(); await expect(page).toHaveURL(new RegExp(`/travel/trips/${trip.id}$`));
  await page.getByRole('button', { name: 'Show map', exact: true }).click();
  const map = page.getByRole('region', { name: 'Trip map', exact: true }); const canvas = map.locator('.map-canvas');
  await expect(map.getByRole('status')).toContainText('Map ready');
  expect(await page.locator('html').evaluate(node => [node.getAttribute('data-theme'), node.getAttribute('data-theme-choice')])).toEqual(['dark', 'dark']);
  await expect(canvas.locator('.leaflet-tile')).not.toHaveCount(0);
  expect(await canvas.evaluate(node => { const pin = node.querySelector('.leaflet-interactive'); const tiles = node.querySelector('.leaflet-tile-pane'); return [node.isConnected, getComputedStyle(node).backgroundColor, tiles ? getComputedStyle(tiles).backgroundColor : '', pin ? getComputedStyle(pin).fill : '']; })).toEqual([true, 'rgb(40, 37, 31)', 'rgb(40, 37, 31)', 'rgb(143, 208, 200)']);
});
