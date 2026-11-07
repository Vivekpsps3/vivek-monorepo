import { expect, test } from './frozen-clock';
import { syntheticVault } from './synthetic-vault';

const ROUTES = [
  '/',
  '/have',
  '/have?t=holdings',
  '/spending',
  '/spending?t=calendar',
  '/recurring',
  '/recurring?t=spend',
  '/planning',
  '/planning?t=growth',
  '/planning?t=stocks',
] as const;

const COMBOS = [
  { width: 1280, height: 800, theme: 'light' },
  { width: 390, height: 844, theme: 'dark' },
] as const;

for (const combo of COMBOS) {
  test.describe(`console clean [${combo.width} ${combo.theme}]`, () => {
    test.use({ viewport: { width: combo.width, height: combo.height } });

    test.beforeEach(async ({ page }) => {
      await page.addInitScript(value => localStorage.setItem('suite-theme', value), combo.theme);
    });

    test('no CSP, Trusted Types or page errors on Finance routes', async ({ page }) => {
      const problems: string[] = [];
      page.on('console', msg => {
        if (msg.type() === 'error' && /Content Security Policy|TrustedHTML|TrustedScript|Refused to/.test(msg.text())) {
          problems.push(msg.text());
        }
      });
      page.on('pageerror', err => problems.push(String(err)));
      const vault = await syntheticVault(page);
      for (const route of ROUTES) {
        await vault.open(route);
      }
      expect(problems).toEqual([]);
    });

    test('every form control has id or name', async ({ page }) => {
      const vault = await syntheticVault(page);
      const offenders: string[] = [];
      for (const route of ROUTES) {
        await vault.open(route);
        const found = await page.evaluate(() =>
          [...document.querySelectorAll('input, select, textarea')]
            .filter(el => {
              const rect = (el as HTMLElement).getBoundingClientRect();
              return rect.width > 0 && rect.height > 0 && !el.id && !el.getAttribute('name');
            })
            .map(el => `${location.pathname}${location.search} <${el.tagName.toLowerCase()}> ${(el as HTMLInputElement).type ?? ''}`),
        );
        offenders.push(...found);
      }
      expect(offenders).toEqual([]);
    });

    test('no interactive content in summary', async ({ page }) => {
      const vault = await syntheticVault(page);
      await vault.open('/recurring');
      const count = await page.evaluate(() =>
        document.querySelectorAll('summary :is(a,button,input,select,textarea,ui-button,[tabindex])').length,
      );
      expect(count).toBe(0);
      const summaryInLabel = await page.evaluate(() => document.querySelectorAll('label summary').length);
      expect(summaryInLabel).toBe(0);
    });

    test('mobile-web-app-capable meta present', async ({ page }) => {
      const vault = await syntheticVault(page);
      await vault.open('/');
      await expect(page.locator('meta[name="mobile-web-app-capable"]')).toHaveCount(1);
    });
  });
}
