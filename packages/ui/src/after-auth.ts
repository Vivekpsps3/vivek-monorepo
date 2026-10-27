import { safeNextPathFrom as validateNextPath } from '@vivek/auth';
import { Router } from '@angular/router';

/** Same-origin path back to an app after the shared sign-in. */
export function safeNextPath(): string | null {
  return safeNextPathFrom(new URLSearchParams(window.location.search).get('next') ?? '');
}

export function safeNextPathFrom(next: string): string | null {
  return validateNextPath(next, window.location.origin);
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
  return safeNextPath() ?? (window.self === window.top ? '/hub' : '/finance/embed');
}

/** Private app transitions share the root router and retain the in-memory vault. */
export function continueAfterAuth(router: Router): Promise<boolean> {
  return router.navigateByUrl(afterAuthUrl());
}
