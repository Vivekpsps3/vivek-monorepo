import { expect, test, type Page } from '@playwright/test';
import { resetMedia } from './media-test';

test.beforeEach(async ({ request }) => resetMedia(request));

const viewports = [
  { label: '390', width: 390, height: 844 },
  { label: '1280', width: 1280, height: 800 },
] as const;
const themes = ['light', 'dark'] as const;

async function openAdd(page: Page, theme: string, violations: string[]) {
  await page.addInitScript((t) => localStorage.setItem('suite-theme', t), theme);
  page.on('console', (msg) => {
    if (/Content Security Policy|Trusted Types/i.test(msg.text())) violations.push(msg.text());
  });
  page.on('pageerror', (err) => {
    if (/Content Security Policy|Trusted Types/i.test(err.message)) violations.push(err.message);
  });
  await page.goto('/media/add');
  await expect(page.getByRole('heading', { name: 'Add manually', exact: true })).toBeVisible();
}

async function expectCleanPage(page: Page, violations: string[]) {
  expect(violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const viewport of viewports) {
  for (const theme of themes) {
    test.describe(`[${viewport.label} ${theme}]`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      test('submit enabled on empty form', async ({ page }) => {
        const violations: string[] = [];
        await openAdd(page, theme, violations);
        await expect(page.getByRole('button', { name: 'Add to library' })).toBeEnabled();
        await expectCleanPage(page, violations);
      });

      test('empty submit focuses title with error', async ({ page }) => {
        const violations: string[] = [];
        await openAdd(page, theme, violations);
        await page.getByRole('button', { name: 'Add to library' }).click();
        const title = page.getByRole('textbox', { name: 'Title', exact: true });
        await expect(page.getByText('Enter a title.', { exact: true })).toBeVisible();
        await expect(title).toBeFocused();
        await expect(title).toHaveAttribute('aria-invalid', 'true');
        await expectCleanPage(page, violations);
      });

      test('invalid year opens details and focuses year', async ({ page }) => {
        const violations: string[] = [];
        await openAdd(page, theme, violations);
        await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Synthetic year');
        await page.getByText('Optional details', { exact: true }).click();
        await page.getByLabel('Release year').fill('99');
        await page.getByRole('button', { name: 'Add to library' }).click();
        await expect(page.getByText('Enter a year between 1000 and 3000.', { exact: true })).toBeVisible();
        await expect(page.locator('details')).toHaveAttribute('open', '');
        await expect(page.getByLabel('Release year')).toBeFocused();
        await expectCleanPage(page, violations);
      });

      test('error clears after fixing once submitted', async ({ page }) => {
        const violations: string[] = [];
        await openAdd(page, theme, violations);
        await page.getByRole('button', { name: 'Add to library' }).click();
        await expect(page.getByText('Enter a title.', { exact: true })).toBeVisible();
        await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Fixed title');
        await expect(page.getByText('Enter a title.', { exact: true })).toHaveCount(0);
        await expectCleanPage(page, violations);
      });

      test('required legend visible', async ({ page }) => {
        const violations: string[] = [];
        await openAdd(page, theme, violations);
        await expect(page.locator('.required-legend')).toBeVisible();
        await expect(page.locator('.required-legend')).toContainText('Required');
        await expectCleanPage(page, violations);
      });

      test('valid submit navigates to item', async ({ page }) => {
        const violations: string[] = [];
        await openAdd(page, theme, violations);
        await page.getByRole('textbox', { name: 'Title', exact: true }).fill('A valid synthetic title');
        await page.getByRole('button', { name: 'Add to library' }).click();
        await expect(page).toHaveURL(/\/media\/item\/\d+$/);
        await expect(page.getByRole('heading', { name: 'A valid synthetic title', exact: true })).toBeVisible();
        await expectCleanPage(page, violations);
      });

      test('no request sent when invalid', async ({ page }) => {
        const violations: string[] = [];
        let posts = 0;
        page.on('request', (request) => {
          if (request.method() === 'POST' && request.url().includes('/media/api/library')) posts++;
        });
        await openAdd(page, theme, violations);
        await page.getByRole('button', { name: 'Add to library' }).click();
        await expect(page.getByText('Enter a title.', { exact: true })).toBeVisible();
        await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Synthetic year');
        await page.getByText('Optional details', { exact: true }).click();
        await page.getByLabel('Release year').fill('99');
        await page.getByRole('button', { name: 'Add to library' }).click();
        await expect(page.getByText('Enter a year between 1000 and 3000.', { exact: true })).toBeVisible();
        expect(posts).toBe(0);
        await expectCleanPage(page, violations);
      });
    });
  }
}
