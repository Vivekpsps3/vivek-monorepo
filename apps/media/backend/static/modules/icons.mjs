/** Inline icons for the shell and actions. Decorative: every svg is aria-hidden. */

const PATHS = {
  now: '<path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z"/>',
  library: '<path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 3z"/><path d="M5 4v16"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  star: '<path d="m12 3 2.6 5.6L21 9.2l-4.5 4.2 1.2 6.1L12 16.8 6.3 19.5 7.5 13.4 3 9.2l6.4-.6z"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
};

export function icon(name) {
  const body = PATHS[name];
  if (!body) return "";
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

export const ICON_NAMES = Object.keys(PATHS);
