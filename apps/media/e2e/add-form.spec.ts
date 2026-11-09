import { expect, test } from '../../../tests/e2e/fixtures';
import { expectSectionHeading, resetMedia } from './media-test';

test.beforeEach(async ({ request }) => resetMedia(request));

// Responsive layout, themes and contrast belong to bundle-m's accessibility
// matrix. Exercise the form's validation and recovery once here.
test('manual add validates locally, keeps the draft, and saves after correction', async ({ page }) => {
  let posts = 0;
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/media/api/library') posts++;
  });
  await page.goto('/media/add');
  await expectSectionHeading(page, 'Add manually');
  const title = page.getByRole('textbox', { name: 'Title', exact: true });
  const submit = page.getByRole('button', { name: 'Add to library' });
  await expect(submit).toBeEnabled();
  await expect(page.locator('.required-legend')).toBeVisible();
  await expect(page.locator('.required-legend')).toContainText('Required');

  await test.step('empty title is accessible and makes no request', async () => {
    await submit.click();
    await expect(page.getByText('Enter a title.', { exact: true })).toBeVisible();
    await expect(title).toBeFocused();
    await expect(title).toHaveAttribute('aria-invalid', 'true');
    expect(posts).toBe(0);
    await title.fill('A valid synthetic title');
    await expect(page.getByText('Enter a title.', { exact: true })).toHaveCount(0);
  });

  await test.step('invalid year preserves the title and focuses its error', async () => {
    await page.getByText('Optional details', { exact: true }).click();
    const year = page.getByLabel('Release year');
    await year.fill('99');
    await submit.click();
    await expect(page.getByText('Enter a year between 1000 and 3000.', { exact: true })).toBeVisible();
    await expect(page.locator('details')).toHaveAttribute('open', '');
    await expect(year).toBeFocused();
    await expect(title).toHaveValue('A valid synthetic title');
    await expect(page).toHaveURL(/\/media\/add$/);
    expect(posts).toBe(0);
    await year.fill('2026');
  });

  await submit.click();
  await expect(page).toHaveURL(/\/media\/item\/\d+$/);
  await expect(page.getByRole('heading', { name: 'A valid synthetic title', exact: true })).toBeVisible();
  expect(posts).toBe(1);
});
