import { bindStoredTheme, bindSystemTheme, readThemeChoice, setThemePreference } from './theme-preference';

describe('shared theme preference', () => {
  let stored: Map<string, string>;
  let attributes: (string | null)[];
  let colorScheme: string;
  beforeEach(() => {
    stored = new Map();
    attributes = ['data-theme', 'data-theme-choice'].map(name => document.documentElement.getAttribute(name));
    colorScheme = document.documentElement.style.colorScheme;
    spyOn(localStorage, 'getItem').and.callFake(key => stored.get(key) ?? null);
    spyOn(localStorage, 'setItem').and.callFake((key, value) => { stored.set(key, value); });
  });
  afterEach(() => {
    ['data-theme', 'data-theme-choice'].forEach((name, index) => {
      const value = attributes[index];
      if (value === null) document.documentElement.removeAttribute(name);
      else document.documentElement.setAttribute(name, value);
    });
    document.documentElement.style.colorScheme = colorScheme;
  });
  it('gives the suite choice precedence over an old app choice', () => {
    stored.set('suite-theme', 'dark');
    stored.set('travel-theme', 'light');
    expect(readThemeChoice('travel-theme')).toBe('dark');
  });
  it('migrates a legacy choice when the suite has no preference', () => {
    stored.set('media-theme', 'dark');
    expect(readThemeChoice('media-theme')).toBe('dark');
    expect(stored.get('suite-theme')).toBe('dark');
  });
  it('still applies a chosen theme when browser storage is unavailable', () => {
    (localStorage.getItem as jasmine.Spy).and.throwError('storage unavailable');
    (localStorage.setItem as jasmine.Spy).and.throwError('storage unavailable');
    expect(readThemeChoice('ft-theme')).toBe('system');
    expect(() => setThemePreference('dark', 'ft-theme')).not.toThrow();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
  it('follows system changes only while System is selected and releases its listener', () => {
    let dark = false;
    let listener = () => {};
    const removed = jasmine.createSpy('removeEventListener');
    const media = {
      get matches() { return dark; },
      addEventListener: (_name: string, callback: () => void) => { listener = callback; },
      removeEventListener: removed,
    } as unknown as MediaQueryList;
    spyOn(window, 'matchMedia').and.returnValue(media);
    stored.set('suite-theme', 'system');
    const changed = jasmine.createSpy('changed');
    const dispose = bindSystemTheme('ft-theme', changed);
    dark = true;
    listener();
    expect(changed).toHaveBeenCalledOnceWith('dark');
    stored.set('suite-theme', 'light');
    listener();
    expect(changed).toHaveBeenCalledTimes(1);
    dispose();
    expect(removed).toHaveBeenCalledOnceWith('change', listener);
  });
  it('reports a theme saved in another document and releases its listener', () => {
    const changed = jasmine.createSpy('changed');
    const dispose = bindStoredTheme('ft-theme', changed);
    window.dispatchEvent(new StorageEvent('storage', { key: 'finance-dek', newValue: 'x' }));
    stored.set('suite-theme', 'dark');
    window.dispatchEvent(new StorageEvent('storage', { key: 'suite-theme', newValue: 'dark' }));
    expect(changed).toHaveBeenCalledOnceWith('dark');
    dispose();
    stored.set('suite-theme', 'light');
    window.dispatchEvent(new StorageEvent('storage', { key: 'suite-theme', newValue: 'light' }));
    expect(changed).toHaveBeenCalledTimes(1);
  });
});
