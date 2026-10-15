export type UiTheme = 'light' | 'dark';
export type ThemeChoice = 'system' | 'light' | 'dark';

function isTheme(value: string | null): value is UiTheme {
  return value === 'light' || value === 'dark';
}

function isChoice(value: string | null): value is ThemeChoice {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function systemTheme(): UiTheme {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/** The saved choice. An absent or unknown value follows the operating system. */
export function readThemeChoice(storageKey: string): ThemeChoice {
  try {
    const saved = localStorage.getItem(storageKey);
    if (isChoice(saved)) return saved;
  } catch {
    // Storage may be unavailable in private browsing or server rendering.
  }
  return 'system';
}

export function resolveThemeChoice(choice: ThemeChoice): UiTheme {
  return choice === 'system' ? systemTheme() : choice;
}

/** Reads the active theme first, then the saved choice, then the operating-system preference. */
export function readThemePreference(storageKey: string): UiTheme {
  if (typeof document !== 'undefined') {
    const active = document.documentElement.getAttribute('data-theme');
    if (isTheme(active)) return active;
  }

  return resolveThemeChoice(readThemeChoice(storageKey));
}

/** Applies a resolved theme without changing the saved user preference. */
export function applyThemePreference(theme: UiTheme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = theme;
}

/** Saves System, Light, or Dark and applies the resolved theme. */
export function setThemePreference(theme: ThemeChoice, storageKey: string): void {
  try {
    localStorage.setItem(storageKey, theme);
  } catch {
    // Storage may be unavailable in private browsing or server rendering.
  }
  const resolved = resolveThemeChoice(theme);
  applyThemePreference(resolved);
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme-choice', theme);
  }
}

/** Re-applies the operating-system theme while the saved choice is System. */
export function bindSystemTheme(storageKey: string, onChange: (resolved: UiTheme) => void): () => void {
  if (typeof matchMedia !== 'function') return () => undefined;
  const media = matchMedia('(prefers-color-scheme: dark)');
  const listener = () => {
    if (readThemeChoice(storageKey) !== 'system') return;
    const resolved = systemTheme();
    applyThemePreference(resolved);
    onChange(resolved);
  };
  media.addEventListener?.('change', listener);
  return () => media.removeEventListener?.('change', listener);
}
