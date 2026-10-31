import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let stored: Map<string, string>;
  beforeEach(() => {
    stored = new Map([['suite-theme', 'system']]);
    spyOn(localStorage, 'getItem').and.callFake((key: string) => stored.get(key) ?? null);
    spyOn(localStorage, 'setItem').and.callFake((key: string, value: string) => { stored.set(key, value); });
    TestBed.configureTestingModule({});
  });
  afterEach(() => { const theme = TestBed.inject(ThemeService); stored.set('suite-theme', 'system'); theme.set('system'); theme.ngOnDestroy(); });
  it('applies a theme saved from another document', () => {
    const theme = TestBed.inject(ThemeService);
    expect(theme.current).toBe('system');
    stored.set('suite-theme', 'dark');
    window.dispatchEvent(new StorageEvent('storage', { key: 'suite-theme', newValue: 'dark' }));
    expect(theme.current).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme-choice')).toBe('dark');
  });
});
