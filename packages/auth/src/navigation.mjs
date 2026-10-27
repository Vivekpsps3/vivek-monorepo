export function safeNextPathFrom(next, origin) {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return null;

  let url;
  try {
    url = new URL(next, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin || /%(?:2f|5c)/i.test(url.pathname)) return null;

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (decodedPath.includes('\\') || decodedPath.startsWith('//')) return null;

  // The URL parser resolves dot segments. Collapse repeated separators too, so
  // auth-route checks and Angular's eventual route parsing use the same path.
  decodedPath = decodedPath.replace(/\/{2,}/g, '/');
  const routePath = decodedPath.replace(/\/+$/, '').toLowerCase() || '/';
  const appPath = routePath === '/finance' ? '/' : routePath.startsWith('/finance/') ? routePath.slice('/finance'.length) : routePath;
  const isAuthPath =
    appPath === '/auth' || appPath.startsWith('/auth/') ||
    appPath === '/login' || appPath === '/signup' || appPath === '/enroll';
  if (isAuthPath) return null;

  const encodedPath = decodedPath.split('/').map(segment => encodeURIComponent(segment)).join('/') || '/';
  return `${encodedPath}${url.search}${url.hash}`;
}
