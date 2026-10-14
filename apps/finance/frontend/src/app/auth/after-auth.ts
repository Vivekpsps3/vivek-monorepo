import { Router } from '@angular/router';

/** Same-origin path back to Finance or Travel after sign-in. */
export function safeNextPath(): string | null {
  const next = new URLSearchParams(window.location.search).get('next');
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\') || next.includes('://')) {
    return null;
  }
  if (next === '/travel' || next.startsWith('/travel/') || next === '/finance' || next.startsWith('/finance/')) {
    return next;
  }
  return null;
}

export function afterAuthUrl(): string {
  const next = safeNextPath();
  if (next?.startsWith('/finance')) {
    const inner = next.slice('/finance'.length) || '/';
    return inner.startsWith('/') ? inner : `/${inner}`;
  }
  if (next) return next;
  return window.self === window.top ? '/' : '/embed';
}

/** Travel lives outside the Angular router, so a travel return leaves this page. */
export function continueAfterAuth(router: Router): Promise<boolean> {
  const next = safeNextPath();
  if (next === '/travel' || next?.startsWith('/travel/')) {
    window.location.assign(next === '/travel' ? '/travel/' : next);
    return Promise.resolve(true);
  }
  return router.navigateByUrl(afterAuthUrl());
}
