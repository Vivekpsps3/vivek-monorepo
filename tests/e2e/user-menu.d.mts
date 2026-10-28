import type { Locator, Page } from '@playwright/test';
export function openUserMenu(page: Page): Promise<Locator>;
export function chooseColorTheme(page: Page, theme: 'light' | 'dark' | 'system'): Promise<void>;
