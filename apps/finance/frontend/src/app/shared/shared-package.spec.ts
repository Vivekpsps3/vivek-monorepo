import { fakeAsync, tick } from '@angular/core/testing';
import { ConfirmService, readThemeChoice, readThemePreference, setThemePreference, ToastService } from '@vivek/ui';

describe('shared UI package helpers', () => {
  const storageKey = 'test-theme-preference';
  let previousTheme: string | null;
  let previousColorScheme: string;

  beforeEach(() => {
    previousTheme = document.documentElement.getAttribute('data-theme');
    previousColorScheme = document.documentElement.style.colorScheme;
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = '';
    localStorage.removeItem(storageKey);
  });

  afterEach(() => {
    if (previousTheme === null) document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', previousTheme);
    document.documentElement.style.colorScheme = previousColorScheme;
    localStorage.removeItem(storageKey);
  });

  it('uses the active document theme before a stored preference', () => {
    localStorage.setItem(storageKey, 'dark');
    document.documentElement.setAttribute('data-theme', 'light');

    expect(readThemePreference(storageKey)).toBe('light');
  });

  it('saves a theme with the app-specific key and applies it to the document', () => {
    setThemePreference('dark', storageKey);

    expect(localStorage.getItem(storageKey)).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('stores system mode and resolves it to the operating system theme', () => {
    setThemePreference('system', storageKey);

    expect(localStorage.getItem(storageKey)).toBe('system');
    expect(readThemeChoice(storageKey)).toBe('system');
    expect(document.documentElement.getAttribute('data-theme-choice')).toBe('system');
    const resolved = document.documentElement.getAttribute('data-theme');
    expect(resolved === 'light' || resolved === 'dark').toBeTrue();
    document.documentElement.removeAttribute('data-theme');
    expect(readThemePreference(storageKey)).toBe(resolved as 'light' | 'dark');
  });

  it('settles the replaced confirmation as cancelled', async () => {
    const service = new ConfirmService();
    const previous = service.ask('First', 'First question');
    const current = service.ask('Second', 'Second question');

    await expectAsync(previous).toBeResolvedTo(false);
    service.close(true);
    await expectAsync(current).toBeResolvedTo(true);
  });

  it('stacks toasts and expires each one on its own timer', fakeAsync(() => {
    const service = new ToastService();
    const visible: string[][] = [];
    service.toasts$.subscribe(value => visible.push(value.map(toast => toast.message)));

    service.show('First');
    tick(3000);
    service.show('Second');
    tick(1000);
    expect(visible.at(-1)).toEqual(['First', 'Second']);

    tick(1000);
    expect(visible.at(-1)).toEqual(['Second']);

    tick(3000);
    expect(visible.at(-1)).toEqual([]);
  }));
});
