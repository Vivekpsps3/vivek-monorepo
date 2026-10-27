/** Translate old domain hash bookmarks before Angular reads the browser URL. */
export function translateLegacyLocation(href) {
  const url = new URL(href, 'https://suite.invalid');
  let path = url.pathname.replace(/\/+$/, '');
  if (path === '/hub/media') path = '/media';
  if (!['/travel', '/media', '/finance'].includes(path) || !url.hash.startsWith('#/')) return null;
  const fragment = url.hash.slice(1);
  if (fragment.startsWith('//') || /\\|%(?:2f|5c)/i.test(fragment)) return null;
  const target = new URL(path + fragment, url.origin);
  if (!target.pathname.startsWith(path + '/')) return null;
  for (const [key, value] of url.searchParams) {
    if (!target.searchParams.has(key)) target.searchParams.append(key, value);
  }
  return `${target.pathname}${target.search}${target.hash}`;
}
