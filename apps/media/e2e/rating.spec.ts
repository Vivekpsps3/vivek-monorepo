import { expect, type Page, test } from '../../../tests/e2e/fixtures';
import AxeBuilder from '@axe-core/playwright';
import { addItem, openItem, resetMedia, savedItem } from './media-test';

test.beforeEach(async ({ request }) => {
  await resetMedia(request);
});

async function saveChanges(page: Page, id: number) {
  const saved = page.waitForResponse((res) => res.request().method() === 'PATCH' && res.url().includes('/media/api/entries/' + id) && res.ok());
  await page.getByRole('button', { name: 'Save changes' }).click();
  await saved;
  await expect(page.getByText('Changes saved.', { exact: true })).toBeVisible();
}

function ratingRadio(page: Page, value: number) {
  return page.getByRole('radio', { name: value + ' out of 10', exact: true });
}

function watchPatches(page: Page, id: number) {
  const patches: Record<string, unknown>[] = [];
  page.on('request', (req) => {
    if (req.method() === 'PATCH' && req.url().includes('/media/api/entries/' + id)) patches.push(req.postDataJSON());
  });
  return patches;
}

async function ratingRowCount(page: Page): Promise<number> {
  const tops = await page.getByRole('radiogroup', { name: 'Rating', exact: true }).getByRole('radio').evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect().top),
  );
  const sorted = [...tops].sort((a, b) => a - b);
  let rows = sorted.length ? 1 : 0;
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index] - sorted[index - 1] > 8) rows += 1;
  }
  return rows;
}

test('integer and null ratings save exactly and a saved half rating is not rounded', async ({ page, request }) => {
  const item = await addItem(request);
  await openItem(page, item.id);
  const patches = watchPatches(page, item.id);
  await expect(page.locator('form.media-editor input[name="rating"]')).toHaveCount(0);
  await expect(page.getByRole('radiogroup', { name: 'Rating', exact: true }).getByRole('radio')).toHaveCount(11);
  for (const value of [0, 10]) {
    await expect(ratingRadio(page, value)).toHaveAttribute('aria-checked', 'false');
  }

  const zero = ratingRadio(page, 0);
  await zero.focus();
  await page.keyboard.press('Home');
  await expect(zero).toBeChecked();
  await saveChanges(page, item.id);
  expect(patches.at(-1)?.rating).toBe(0);
  expect((await savedItem(request, item.id)).rating).toBe(0);
  await page.goto('/media/library');
  await expect(page.locator('.media-card').filter({ has: page.getByRole('heading', { name: 'Browser story' }) })).toContainText('0 / 10');

  await openItem(page, item.id);
  const ten = ratingRadio(page, 10);
  await ten.focus();
  await page.keyboard.press('End');
  await expect(ten).toBeChecked();
  await expect(ten).toBeFocused();
  await saveChanges(page, item.id);
  expect(patches.at(-1)?.rating).toBe(10);
  expect((await savedItem(request, item.id)).rating).toBe(10);

  await page.getByRole('button', { name: 'Clear rating', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(ten).not.toBeChecked();
  await saveChanges(page, item.id);
  expect(patches.at(-1)?.rating).toBeNull();
  expect((await savedItem(request, item.id)).rating).toBeNull();
  await page.goto('/media/library');
  await expect(page.locator('.media-card').filter({ has: page.getByRole('heading', { name: 'Browser story' }) })).not.toContainText('/ 10');

  const half = await addItem(request, { title: 'Half story', rating: 7.5 });
  await openItem(page, half.id, 'Half story');
  const halfPatches = watchPatches(page, half.id);
  await expect(page.getByText('Current rating: 7.5. Pick a whole number to change it.', { exact: true })).toBeVisible();
  await expect(page.locator('form.media-editor input[name="rating"]')).toHaveCount(0);
  for (const value of [7, 8]) {
    await expect(ratingRadio(page, value)).toHaveAttribute('aria-checked', 'false');
  }
  await page.getByLabel('Note').fill('Still half');
  await saveChanges(page, half.id);
  expect(halfPatches[0].review).toBe('Still half');
  expect(halfPatches[0].rating).toBeUndefined();
  expect((await savedItem(request, half.id)).rating).toBe(7.5);
  await page.reload();
  await expect(page.getByText('Current rating: 7.5. Pick a whole number to change it.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Note')).toHaveValue('Still half');

  await ratingRadio(page, 8).click();
  await expect(page.getByText('Current rating: 7.5. Pick a whole number to change it.')).toHaveCount(0);
  await saveChanges(page, half.id);
  expect(halfPatches.at(-1)?.rating).toBe(8);
  expect((await savedItem(request, half.id)).rating).toBe(8);

  const cleared = await addItem(request, { title: 'Clear half', rating: 7.5 });
  await openItem(page, cleared.id, 'Clear half');
  const clearPatches = watchPatches(page, cleared.id);
  await page.getByRole('button', { name: 'Clear rating', exact: true }).click();
  await expect(page.getByText('Current rating: 7.5. Pick a whole number to change it.')).toHaveCount(0);
  await saveChanges(page, cleared.id);
  expect(clearPatches[0].rating).toBeNull();
  expect((await savedItem(request, cleared.id)).rating).toBeNull();
});

test('arrow keys, width, theme, and cancelling leave keep the unsaved rating', async ({ page, request }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const item = await addItem(request);
  await openItem(page, item.id);
  await page.getByLabel('Note').fill('Keep this note');
  const zero = ratingRadio(page, 0);
  await zero.focus();
  await expect(zero).toBeFocused();
  await page.keyboard.press('ArrowRight');
  const one = ratingRadio(page, 1);
  await expect(one).toBeChecked();
  await expect(one).toBeFocused();
  await page.keyboard.press('ArrowRight');
  const two = ratingRadio(page, 2);
  await expect(two).toBeChecked();
  await expect(two).toBeFocused();
  await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();

  for (const width of [390, 1280]) for (const theme of ['light', 'dark'] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate((value) => {
      localStorage.setItem('suite-theme', value);
      document.documentElement.setAttribute('data-theme', value);
      document.documentElement.setAttribute('data-theme-choice', value);
      document.documentElement.style.colorScheme = value;
    }, theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect.poll(() => page.locator('body').evaluate((node) => getComputedStyle(node).color)).toBe(theme === 'dark' ? 'rgb(246, 241, 234)' : 'rgb(28, 25, 22)');
    await expect.poll(() => ratingRowCount(page)).toBe(width === 390 ? 2 : 1);
    const group = await page.getByRole('radiogroup', { name: 'Rating', exact: true }).boundingBox();
    expect(group).toBeTruthy();
    expect(group!.x).toBeGreaterThanOrEqual(0);
    expect(group!.x + group!.width).toBeLessThanOrEqual(width + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const value of [0, 2, 10]) await expect(ratingRadio(page, value)).toBeVisible();
    await expect(two).toBeChecked();
    await expect(page.getByLabel('Note')).toHaveValue('Keep this note');
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations.filter((item) => ['serious', 'critical'].includes(item.impact || '')), width + ' ' + theme).toEqual([]);
  }

  await page.getByRole('link', { name: '← Library' }).click();
  await expect(page.getByRole('heading', { name: 'Leave unsaved changes?', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Browser story', exact: true })).toBeVisible();
  await expect(two).toBeChecked();
  await expect(page.getByLabel('Note')).toHaveValue('Keep this note');
  const draft = JSON.parse(await page.evaluate((id) => sessionStorage.getItem('media-item-draft:1:' + id) || 'null', item.id));
  expect(draft.fields.rating).toBe(2);
  expect(draft.fields.review).toBe('Keep this note');
  expect((await savedItem(request, item.id)).rating).toBeNull();
  expect((await savedItem(request, item.id)).review).toBeNull();
});

test('a failed rating save keeps the unsaved note and the chosen integer', async ({ page, request }) => {
  const item = await addItem(request);
  await openItem(page, item.id);
  const patches = watchPatches(page, item.id);
  await page.route('**/media/api/entries/' + item.id, (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Rating save failed.' }) });
  });
  await page.getByLabel('Note').fill('Keep this note');
  await ratingRadio(page, 9).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('main [role=alert]')).toContainText('Rating save failed.');
  expect(patches).toEqual([{ review: 'Keep this note', rating: 9, review_base: item.review_updated_at || '' }]);
  await expect(ratingRadio(page, 9)).toBeChecked();
  await expect(page.getByLabel('Note')).toHaveValue('Keep this note');
  const draft = JSON.parse(await page.evaluate((id) => sessionStorage.getItem('media-item-draft:1:' + id) || 'null', item.id));
  expect(draft.fields.rating).toBe(9);
  expect(draft.fields.review).toBe('Keep this note');
  expect((await savedItem(request, item.id)).rating).toBeNull();
  expect((await savedItem(request, item.id)).review).toBeNull();
});
