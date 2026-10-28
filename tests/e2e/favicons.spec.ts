import { expect, test } from '@playwright/test';

test('public prerenders and private navigation use their own complete favicon family', async ({ page, request }) => {
  for (const path of ['/', '/home', '/work', '/about', '/secrets']) {
    const response = await request.get(path);
    expect(response.ok()).toBeTruthy();
    const html = await response.text();
    expect(html).toContain('href="/favicon.svg?v=2"');
    expect(html).toContain('href="/favicon.ico?v=2"');
    expect(html).toContain('href="/apple-touch-icon.png?v=2"');
  }
  for (const path of ['/hub', '/auth/login', '/finance/', '/travel/', '/media/']) {
    const response = await request.get(path);
    expect(response.ok()).toBeTruthy();
    expect(await response.text()).toContain('href="/workspace-icon.svg?v=2"');
  }
  for (const prefix of ['', 'workspace-']) {
    const files = prefix ? ['workspace-icon.svg', 'workspace-icon.ico', 'workspace-touch-icon.png']
      : ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png'];
    for (const file of files) {
      const response = await request.get('/' + file + '?v=2');
      expect(response.ok(), file).toBeTruthy();
      const bytes = await response.body();
      if (file.endsWith('.svg')) {
        expect(response.headers()['content-type']).toContain('image/svg+xml');
        expect(bytes.toString()).toContain('viewBox="0 0 64 64"');
      } else if (file.endsWith('.ico')) {
        expect(bytes.readUInt16LE(2)).toBe(1);
        expect(bytes.readUInt16LE(4)).toBe(4);
        expect([0, 1, 2, 3].map(index => bytes[6 + index * 16])).toEqual([16, 32, 48, 64]);
      } else {
        expect(bytes.readUInt32BE(16)).toBe(180);
        expect(bytes.readUInt32BE(20)).toBe(180);
      }
    }
  }
  const icon = page.locator('link[data-app-icon="svg"]');
  await page.goto('/work');
  await expect(icon).toHaveAttribute('href', '/favicon.svg?v=2');
  await page.getByRole('link', { name: 'Workspace', exact: true }).click();
  await expect(page).toHaveURL(/\/hub$/);
  await expect(icon).toHaveAttribute('href', '/workspace-icon.svg?v=2');
  await page.goto('/travel');
  await expect(icon).toHaveAttribute('href', '/workspace-icon.svg?v=2');
  await page.goto('/about');
  await expect(icon).toHaveAttribute('href', '/favicon.svg?v=2');
});
