/** Shared appearance choice. Apps still write their old key so a reader that
 * has not picked up suite-theme keeps working.
 */
export const SUITE_THEME_KEY = "suite-theme";

const CHOICES = new Set(["system", "light", "dark"]);

function readKey(key) {
  try {
    const value = localStorage.getItem(key);
    return CHOICES.has(value) ? value : "";
  } catch {
    return "";
  }
}

export function readSuiteTheme(legacyKey = "") {
  const shared = readKey(SUITE_THEME_KEY);
  if (shared) return shared;
  const legacy = legacyKey ? readKey(legacyKey) : "";
  if (legacy) {
    try { localStorage.setItem(SUITE_THEME_KEY, legacy); } catch { /* private mode */ }
    return legacy;
  }
  return "system";
}

export function writeSuiteTheme(choice, legacyKey = "") {
  const value = CHOICES.has(choice) ? choice : "system";
  try {
    localStorage.setItem(SUITE_THEME_KEY, value);
    if (legacyKey) localStorage.setItem(legacyKey, value);
  } catch { /* private mode */ }
  return value;
}
