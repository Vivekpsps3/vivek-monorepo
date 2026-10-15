import { afterAuthUrl, authNavigation, continueAfterAuth, safeNextPathFrom } from './after-auth';

describe('shared-auth return paths', () => {
  beforeEach(() => {
    history.replaceState({}, '', '/auth/login');
  });

  afterEach(() => {
    history.replaceState({}, '', '/auth/login');
  });

  it('strips only the exact Finance mount prefix', () => {
    history.replaceState({}, '', '/auth/login?next=%2Ffinance%2Ftransactions%3Fpage%3D2%23recent');
    expect(afterAuthUrl()).toBe('/transactions?page=2#recent');

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

  it('keeps Travel return paths on a full-page navigation including query and hash', async () => {
    history.replaceState({}, '', '/auth/login?next=%2Ftravel%3Ftrip%3D1%23day-2');
    const assign = spyOn(authNavigation, 'assignPath');
    const router = { navigateByUrl: jasmine.createSpy('navigateByUrl').and.resolveTo(true) } as any;

    await continueAfterAuth(router);

    expect(assign).toHaveBeenCalledWith('/travel/?trip=1#day-2');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('keeps Media return paths on a full-page navigation', async () => {
    history.replaceState({}, '', '/auth/login?next=%2Fmedia%2Flibrary');
    const assign = spyOn(authNavigation, 'assignPath');
    const router = { navigateByUrl: jasmine.createSpy('navigateByUrl').and.resolveTo(true) } as any;

    await continueAfterAuth(router);

    expect(assign).toHaveBeenCalledWith('/media/library');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('opens the Hub when sign-in has no return path', () => {
    expect(afterAuthUrl()).toBe(window.self === window.top ? '/hub' : '/embed');
  });
});
