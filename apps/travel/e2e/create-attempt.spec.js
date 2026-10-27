import { expect, test } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
});

test('a lost create response retries the same trip', async ({ page, request }) => {
  await page.goto('/travel/trips/new');
  await page.getByLabel('Departure date').fill('2026-11-01');
  await page.getByLabel('Return date').fill('2026-11-02');
  await page.getByLabel('Destination city').fill('Kyoto');
  let posts = 0;
  await page.route('**/travel/api/trips', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    posts += 1;
    const response = await route.fetch();
    if (posts === 1) return route.abort();
    return route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Save trip', exact: true }).click();
  await expect(page.locator('main .local-error')).toContainText('Failed to fetch');
  await expect(page.getByLabel('Destination city')).toHaveValue('Kyoto');
  await page.getByRole('button', { name: 'Save trip', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Kyoto', exact: true })).toBeVisible();
  const home = await (await request.get('/travel/api/home')).json();
  const titles = [...home.upcoming, ...home.in_progress, ...home.past].map(trip => trip.title);
  expect(titles.filter(title => title === 'Kyoto')).toEqual(['Kyoto']);
  expect(posts).toBe(2);
});
