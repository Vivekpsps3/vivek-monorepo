import { convertToParamMap } from '@angular/router';
import { routes } from '../../app.routes';
import { legacyPayDestination } from './finance-navigation';

describe('legacy Pay destination', () => {
  const redirect = (path: string) => {
    const layout = routes.find(route => route.path === '');
    const route = layout?.children?.find(child => child.path === path);
    return route?.redirectTo as ((snapshot: object) => string) | undefined;
  };

  it('sends spend tabs to Bills and compensation history to Pay', () => {
    expect(legacyPayDestination(convertToParamMap({
      t: 'spend', kind: 'subscription', status: 'active', order: 'latest', name: 'private',
    }))).toBe('/finance/bills?kind=subscription&status=active&order=latest');
    expect(legacyPayDestination(convertToParamMap({
      t: 'compensation', year: '2025', start: '2025-02-01', end: '2025-09-30', employer: 'private',
    }))).toBe('/finance/pay?history=1&year=2025&start=2025-02-01&end=2025-09-30');
    expect(legacyPayDestination(convertToParamMap({ t: 'pay', month: '2026-13', history: '1' })))
      .toBe('/finance/pay?history=1');
    expect(legacyPayDestination(undefined)).toBe('/finance/pay');
  });

  it('accepts the empty snapshot used by route parity', () => {
    for (const path of ['recurring', 'income']) {
      const target = redirect(path);
      expect(target).withContext(path).toEqual(jasmine.any(Function));
      expect(String(target?.({}))).toBe('/finance/pay');
    }
  });
});
