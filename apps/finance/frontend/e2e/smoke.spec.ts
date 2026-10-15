import { test, expect } from '@playwright/test';

test('shared sign-in page is visible for anonymous users', async ({ page }) => {
  await page.route('**/api/auth/bootstrap-status', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ needs_setup: false }),
  }));
  await page.route('**/api/auth/me', route => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ detail: 'Not authenticated' }),
  }));

  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});
