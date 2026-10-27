import { Router } from '@angular/router';

import { afterAuthUrl, authNavigation, continueAfterAuth, safeNextPathFrom } from './after-auth';

function routerStub(): jasmine.SpyObj<Router> {
  const router = jasmine.createSpyObj<Router>('Router', ['navigateByUrl']);
  router.navigateByUrl.and.resolveTo(true);
  return router;
}

describe('shared-auth return paths', () => {
  beforeEach(() => {
    history.replaceState({}, '', '/auth/login');
  });

  afterEach(() => {
    history.replaceState({}, '', '/auth/login');
  });

  it('preserves the Finance feature prefix', () => {
    history.replaceState({}, '', '/auth/login?next=%2Ffinance%2Ftransactions%3Fpage%3D2%23recent');
    expect(afterAuthUrl()).toBe('/finance/transactions?page=2#recent');

    history.replaceState({}, '', '/auth/login?next=%2Ffinance-other%2Fabout');
    expect(afterAuthUrl()).toBe('/finance-other/about');
  });

  it('rejects auth aliases and normalized paths that would return to sign-in', () => {
    for (const path of [
      '/auth/login', '/auth/signup/', '/login', '/finance/login', '/finance/auth/login',
      '/finance/transactions/../auth/login', '/finance/%2e%2e/auth/login',
    ]) {
      expect(safeNextPathFrom(path)).withContext(path).toBeNull();
    }
  });

  it('rejects cross-origin and encoded separator paths', () => {
    expect(safeNextPathFrom('//attacker.example/path')).toBeNull();
    expect(safeNextPathFrom('/finance/%2f%2fattacker.example')).toBeNull();
  });

  it('keeps Travel query and hash on navigation in the shared runtime', async () => {
    history.replaceState({}, '', '/auth/login?next=%2Ftravel%3Ftrip%3D1%23day-2');
    const assign = spyOn(authNavigation, 'assignPath');
    const router = routerStub();

    await continueAfterAuth(router);

    expect(assign).not.toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/travel?trip=1#day-2');
  });

  it('preserves a legacy Hub Media return for the root alias route', async () => {
    history.replaceState({}, '', '/auth/signup?next=%2Fhub%2Fmedia');
    const assign = spyOn(authNavigation, 'assignPath');
    const router = routerStub();

    await continueAfterAuth(router);

    expect(assign).not.toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/hub/media');
  });

  it('keeps Media return paths in the shared runtime', async () => {
    history.replaceState({}, '', '/auth/login?next=%2Fmedia%2Flibrary');
    const assign = spyOn(authNavigation, 'assignPath');
    const router = routerStub();

    await continueAfterAuth(router);

    expect(assign).not.toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/media/library');
  });

  it('opens the Hub when sign-in has no return path', () => {
    expect(afterAuthUrl()).toBe(window.self === window.top ? '/hub' : '/finance/embed');
  });
});
