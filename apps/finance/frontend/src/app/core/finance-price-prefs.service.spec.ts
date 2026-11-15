import { FinancePricePrefsService } from './finance-price-prefs.service';

describe('FinancePricePrefsService', () => {
  const service = new FinancePricePrefsService();

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('falls back to defaults when storage throws', () => {
    spyOn(Storage.prototype, 'getItem').and.throwError('blocked');
    spyOn(Storage.prototype, 'setItem').and.throwError('blocked');
    expect(service.autoCheck(7)).toBeTrue();
    expect(service.noticeSeen(7)).toBeFalse();
    expect(() => service.setAutoCheck(7, false)).not.toThrow();
    expect(() => service.markNoticeSeen(7)).not.toThrow();
    expect(service.autoCheck(7)).toBeTrue();
  });

});
