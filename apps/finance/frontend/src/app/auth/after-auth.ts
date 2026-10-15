import { Router } from '@angular/router';

/** Same-origin path back to an app after the shared sign-in. */
export function safeNextPath(): string | null {
  return safeNextPathFrom(new URLSearchParams(window.location.search).get('next') ?? '');
}

export function safeNextPathFrom(next: string): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return null;

  let url: URL;
  try {
    url = new URL(next, window.location.origin);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin || /%(?:2f|5c)/i.test(url.pathname)) return null;

  let decodedPath: string;
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

export function authPath(page: 'login' | 'signup'): string {
  const next = safeNextPath();
  return next ? `/auth/${page}?next=${encodeURIComponent(next)}` : `/auth/${page}`;
}

/** Where an unsigned visitor should go, keeping their current app path. */
export function loginHref(): string {
  const pathOnly = window.location.pathname;
  if (pathOnly === '/auth/login' || pathOnly === '/auth/signup' || pathOnly === '/login' || pathOnly === '/signup') {
    return authPath('login');
  }
  const here = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const next = safeNextPathFrom(here);
  return next ? `/auth/login?next=${encodeURIComponent(next)}` : '/auth/login';
}

export const authNavigation = {
  goToLogin(includeNext = true): void {
    this.assignPath(includeNext ? loginHref() : '/auth/login');
  },
  assignPath(path: string): void {
    window.location.assign(path);
  },
};

export function afterAuthUrl(): string {
  const next = safeNextPath();
  if (next) {
    const url = new URL(next, window.location.origin);
    const decodedPath = decodeURIComponent(url.pathname).replace(/\/{2,}/g, '/');
    if (decodedPath === '/finance' || decodedPath.startsWith('/finance/')) {
      const innerPath = decodedPath.slice('/finance'.length) || '/';
      const encodedPath = innerPath.split('/').map(segment => encodeURIComponent(segment)).join('/') || '/';
      return `${encodedPath}${url.search}${url.hash}`;
    }
    return next;
  }
  return window.self === window.top ? '/hub' : '/embed';
}

/** Travel lives outside the Angular router, so a travel return leaves this page. */
export function continueAfterAuth(router: Router): Promise<boolean> {
  const next = safeNextPath();
  if (next) {
    const url = new URL(next, window.location.origin);
    const path = decodeURIComponent(url.pathname).replace(/\/{2,}/g, '/');
    if (
      path === '/travel' || path.startsWith('/travel/') ||
      path === '/media' || path.startsWith('/media/')
    ) {
      const encodedPath = path === '/travel' || path === '/media'
        ? `${path}/`
        : path.split('/').map(segment => encodeURIComponent(segment)).join('/');
      authNavigation.assignPath(`${encodedPath}${url.search}${url.hash}`);
      return Promise.resolve(true);
    }
  }
  return router.navigateByUrl(afterAuthUrl());
}
