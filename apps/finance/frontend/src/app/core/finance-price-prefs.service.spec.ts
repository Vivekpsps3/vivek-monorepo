import { FinancePricePrefsService } from './finance-price-prefs.service';

describe('FinancePricePrefsService', () => {
  const service = new FinancePricePrefsService();

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('defaults to automatic checks on and the notice unseen', () => {
    expect(service.autoCheck(7)).toBeTrue();
    expect(service.noticeSeen(7)).toBeFalse();
  });

  it('stores the setting per user', () => {
    service.setAutoCheck(7, false);
    expect(service.autoCheck(7)).toBeFalse();
    expect(service.autoCheck(8)).toBeTrue();
    service.setAutoCheck(7, true);
    expect(service.autoCheck(7)).toBeTrue();
  });

  it('marks the notice seen per user', () => {
    service.markNoticeSeen(7);
    expect(service.noticeSeen(7)).toBeTrue();
    expect(service.noticeSeen(8)).toBeFalse();
  });

  it('falls back to defaults when storage throws', () => {
    spyOn(Storage.prototype, 'getItem').and.throwError('blocked');
    spyOn(Storage.prototype, 'setItem').and.throwError('blocked');
    expect(service.autoCheck(7)).toBeTrue();
    expect(service.noticeSeen(7)).toBeFalse();
    expect(() => service.setAutoCheck(7, false)).not.toThrow();
    expect(() => service.markNoticeSeen(7)).not.toThrow();
  });
});
