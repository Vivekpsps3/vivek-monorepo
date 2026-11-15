import { isIsoDate,shiftIsoDate } from './pixels-dates';

describe('pixels dates', () => {
  it('accepts leap day and century non-leap dates', () => {
    expect(isIsoDate('2024-02-29')).toBeTrue();
    expect(isIsoDate('2100-02-29')).toBeFalse();
    expect(isIsoDate('2000-02-29')).toBeTrue();
    expect(shiftIsoDate('2024-02-28', 1)).toBe('2024-02-29');
    expect(shiftIsoDate('2100-02-28', 1)).toBe('2100-03-01');
  });

});
