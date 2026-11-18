import { returnPath, vaultUnlockHref } from './return-context';

describe('return context', () => {
  it('carries known date, collection and pagination coordinates', () => {
    for (const path of [
      '/finance/spending?t=calendar&month=2026-11&date=2026-11-18',
      '/pixels?year=2024&day=2024-02-29',
      '/media/library?kind=artist&sort=title&offset=24',
    ]) {
      expect(returnPath(path)).withContext(path).toBe(path);
    }
  });

  it('drops private values, invalid dates, duplicate coordinates and fragments', () => {
    expect(returnPath('/finance/spending?t=calendar&date=2026-02-31&name=private&account=private&edit=42#private'))
      .toBe('/finance/spending?t=calendar');
    expect(returnPath('/media/library?kind=artist&kind=book&q=private&tag=private&offset=24&expanded=42'))
      .toBe('/media/library?offset=24');
  });

  it('rejects external, unknown, and recursive authentication destinations', () => {
    for (const path of [
      '//example.test', '/finance/%2F%2Fexample.test', '/finance/vault/unlock?next=/pixels',
      '/finance/vault/setup', '/auth/login', '/finance/not-an-app-route',
    ]) {
      expect(vaultUnlockHref(path)).withContext(path).toBe('/finance/vault/unlock');
    }
  });
});
