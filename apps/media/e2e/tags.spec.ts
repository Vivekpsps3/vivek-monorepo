import { expect, test } from '../../../tests/e2e/fixtures';
import { addItem, openItem, reloadDraft, resetMedia, savedItem } from './media-test';

test.beforeEach(async ({ request }) => {
  await resetMedia(request);
});

function tagInput(page: import('@playwright/test').Page) {
  return page.getByRole('textbox', { name: 'Tags', exact: true });
}

test('keyboard tag editing normalizes, caps, saves and reloads', async ({ page, request }) => {
  test.setTimeout(60_000);
  const item = await addItem(request);
  await openItem(page, item.id);
  const input = tagInput(page);
  const patches: { tags?: string[]; review?: string; rating?: number }[] = [];
  page.on('request', (req) => {
    if (req.method() === 'PATCH' && req.url().includes('/media/api/entries/' + item.id)) {
      patches.push(req.postDataJSON());
    }
  });

  await input.fill('  café   opera  ');
  await input.press('Enter');
  await expect(page.getByRole('button', { name: 'Remove tag café opera' })).toBeVisible();
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
  expect(patches).toEqual([]);

  await input.fill('CAFÉ OPERA');
  await input.press('Enter');
  await expect(page.getByText('“café opera” is already a tag.')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Remove tag / })).toHaveCount(1);
  await expect(input).toHaveValue('CAFÉ OPERA');

  const exact = 'é'.repeat(40);
  await input.fill(exact);
  await input.press('Enter');
  await expect(page.getByRole('button', { name: 'Remove tag ' + exact })).toBeVisible();

  const emoji = '🎬'.repeat(40);
  await input.fill(emoji);
  await input.press('Enter');
  await expect(page.getByRole('button', { name: 'Remove tag ' + emoji })).toBeVisible();

  await input.fill('🎬'.repeat(41));
  await input.press('Enter');
  await expect(page.getByText('Tags can be up to 40 characters.')).toBeVisible();
  await expect(input).toHaveValue('🎬'.repeat(41));
  await expect(page.getByRole('button', { name: /^Remove tag / })).toHaveCount(3);

  for (let i = 0; i < 17; i++) {
    await input.fill('n' + i);
    await input.press('Enter');
  }
  await expect(page.getByRole('button', { name: /^Remove tag / })).toHaveCount(20);
  await input.fill('one more');
  await input.press('Enter');
  await expect(page.getByText('You can have up to 20 tags. Remove one to add another.')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Remove tag / })).toHaveCount(20);
  expect(patches).toEqual([]);

  await input.fill('');
  await input.press('Backspace');
  await expect(page.getByRole('button', { name: 'Remove tag one more' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Remove tag n16' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved.', { exact: true })).toBeVisible();
  expect(patches).toHaveLength(1);
  expect(patches[0].tags).toHaveLength(19);
  expect(patches[0].tags?.[0]).toBe('café opera');
  expect(patches[0].tags).toContain(exact);
  expect(patches[0].tags).toContain(emoji);
  expect(patches[0].tags).not.toContain('one more');
  expect(patches[0].tags).not.toContain('CAFÉ OPERA');
  expect(patches[0].review).toBeUndefined();
  expect(patches[0].rating).toBeUndefined();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Remove tag café opera' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Remove tag / })).toHaveCount(19);
  const saved = await savedItem(request, item.id);
  expect(saved.tags).toEqual(patches[0].tags);
  expect(saved.tags[0]).toBe('café opera');
});

test('Backspace and remove move focus to the input or the next tag', async ({ page, request }) => {
  const item = await addItem(request);
  await openItem(page, item.id);
  const input = tagInput(page);
  await input.fill('Alpha');
  await input.press('Enter');
  await input.fill('Beta');
  await input.press('Enter');
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
  await input.press('Backspace');
  await expect(page.getByRole('button', { name: 'Remove tag Beta' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Remove tag Alpha' })).toBeVisible();
  await expect(input).toBeFocused();

  await input.fill('Beta');
  await input.press('Enter');
  await expect(input).toHaveValue('');
  await page.getByRole('button', { name: 'Remove tag Alpha' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Remove tag Alpha' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Remove tag Beta' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Remove tag Beta' })).toHaveCount(0);
  await expect(input).toBeFocused();
});

test('Enter does not submit notes or ratings and a failed save keeps the draft', async ({ page, request }) => {
  const item = await addItem(request);
  await openItem(page, item.id);
  const patches: { review?: string; rating?: number; review_base?: string; tags?: string[] }[] = [];
  const posts: string[] = [];
  page.on('request', (req) => {
    if (!req.url().includes('/media/api/entries/' + item.id)) return;
    if (req.method() === 'POST') posts.push(req.url());
    if (req.method() === 'PATCH') patches.push(req.postDataJSON());
  });
  await page.getByLabel('Note').fill('Keep this note');
  await page.getByRole('radio', { name: '7 out of 10', exact: true }).click();
  const input = tagInput(page);
  await input.fill('Vault');
  await input.press('Enter');
  await expect(page.getByRole('button', { name: 'Remove tag Vault' })).toBeVisible();
  await expect(page.getByLabel('Note')).toHaveValue('Keep this note');
  await expect(page.getByRole('radio', { name: '7 out of 10', exact: true })).toBeChecked();
  expect(patches).toEqual([]);
  expect(posts).toEqual([]);

  await input.fill('still typing');
  await page.route('**/media/api/entries/' + item.id, (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    return route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Tag save failed.' }),
    });
  });
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('main [role=alert]')).toContainText('Tag save failed.');
  expect(posts).toEqual([]);
  expect(patches).toEqual([
    {
      review: 'Keep this note',
      rating: 7,
      review_base: item.review_updated_at || '',
      tags: ['Vault'],
    },
  ]);
  await expect(page.getByLabel('Note')).toHaveValue('Keep this note');
  await expect(page.getByRole('radio', { name: '7 out of 10', exact: true })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Remove tag Vault' })).toBeVisible();
  await expect(input).toHaveValue('still typing');
  const draft = JSON.parse(await page.evaluate((id) => sessionStorage.getItem('media-item-draft:1:' + id) || 'null', item.id));
  expect(draft.fields.review).toBe('Keep this note');
  expect(draft.fields.rating).toBe(7);
  expect(draft.fields.tags).toEqual(['Vault']);
  expect(draft.fields.tagText).toBe('still typing');

  await reloadDraft(page);
  await expect(page.getByLabel('Note')).toHaveValue('Keep this note');
  await expect(page.getByRole('radio', { name: '7 out of 10', exact: true })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Remove tag Vault' })).toBeVisible();
  await expect(tagInput(page)).toHaveValue('still typing');
  const saved = await savedItem(request, item.id);
  expect(saved.review).toBeNull();
  expect(saved.rating).toBeNull();
  expect(saved.tags).toEqual([]);
});

test('a draft from before tags still restores the note', async ({ page, request }) => {
  const item = await addItem(request, { review: 'Saved note' });
  const saved = await savedItem(request, item.id);
  await page.goto('/media/library');
  await page.evaluate(({ id, base }) => sessionStorage.setItem('media-item-draft:1:' + id, JSON.stringify({
    base,
    fields: {
      review: 'Older local draft',
      rating: 4,
      status: 'want',
      progress: null,
      unit: '',
      favorite: false,
      anticipated: false,
    },
  })), { id: item.id, base: saved.updated_at });
  await openItem(page, item.id);
  await expect(page.getByLabel('Note')).toHaveValue('Older local draft');
  await expect(page.getByRole('radio', { name: '4 out of 10', exact: true })).toBeChecked();
  await expect(page.getByRole('button', { name: /^Remove tag / })).toHaveCount(0);
  await expect(tagInput(page)).toHaveValue('');
  expect((await savedItem(request, item.id)).review).toBe('Saved note');
});
