import { bindSystemTheme } from './theme-preference';

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
});
