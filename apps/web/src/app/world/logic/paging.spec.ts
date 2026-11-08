import { addIsoDays, initialRange, isoMonday, nextOlderRange, oneInFlight, prependedWeekCount, shouldPage } from './paging';

describe('paging', () => {
  it('shifts civil dates in UTC, including the leap day', () => {
    expect(addIsoDays('2026-10-26', 6)).toBe('2026-11-01');
    expect(addIsoDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addIsoDays('2026-11-02', -7)).toBe('2026-10-26');
  });

  it('snaps a date to its UTC Monday', () => {
    expect(isoMonday('2026-10-12')).toBe('2026-10-12');
    expect(isoMonday('2026-11-04')).toBe('2026-11-02');
    expect(isoMonday('2026-11-01')).toBe('2026-10-26');
    expect(isoMonday('2026-11-08')).toBe('2026-11-02');
  });

  it('opens a 26-week window ending on the current Monday', () => {
    const range = initialRange('2026-11-02', '2020-01-06');
    expect(range).toEqual({ from: '2026-05-11', to: '2026-11-02' });
    expect(inclusiveMondays(range.from, range.to)).toBe(26);
  });

  it('clamps the first window up to start_week', () => {
    const range = initialRange('2026-11-02', '2026-10-05');
    expect(range).toEqual({ from: '2026-10-05', to: '2026-11-02' });
    expect(inclusiveMondays(range.from, range.to)).toBeLessThanOrEqual(26);
  });

  it('pages the previous 26 weeks and stops at start_week', () => {
    expect(nextOlderRange('2026-11-02', '2020-01-06')).toEqual({ from: '2026-05-04', to: '2026-10-26' });
    expect(inclusiveMondays('2026-05-04', '2026-10-26')).toBe(26);

    expect(nextOlderRange('2026-10-12', '2026-10-05')).toEqual({ from: '2026-10-05', to: '2026-10-05' });
    expect(nextOlderRange('2026-10-05', '2026-10-05')).toBeNull();
    expect(nextOlderRange('2026-09-28', '2026-10-05')).toBeNull();
  });

  it('pages when the camera is within four chunks of the oldest edge', () => {
    expect(shouldPage(0, 0)).toBeTrue();
    expect(shouldPage(4 * 56, 0)).toBeTrue();
    expect(shouldPage(4 * 56 + 0.01, 0)).toBeFalse();
    expect(shouldPage(224, 100)).toBeTrue();
    expect(shouldPage(100 + 4 * 56 + 1, 100)).toBeFalse();
  });

  it('allows one page request at a time', () => {
    expect(oneInFlight(false)).toBeTrue();
    expect(oneInFlight(true)).toBeFalse();
  });

  it('counts weeks prepended ahead of the previous oldest week', () => {
    expect(prependedWeekCount([], ['2026-05-04'])).toBe(0);
    expect(prependedWeekCount(['2026-05-11', '2026-05-18'], ['2026-05-11', '2026-05-18'])).toBe(0);
    expect(prependedWeekCount(
      ['2026-05-11', '2026-05-18'],
      ['2026-04-27', '2026-05-04', '2026-05-11', '2026-05-18'],
    )).toBe(2);
    expect(prependedWeekCount(['2026-05-11'], ['2026-06-01'])).toBe(0);
  });
});

function inclusiveMondays(from: string, to: string): number {
  let count = 1;
  let cursor = from;
  while (cursor < to) {
    cursor = addIsoDays(cursor, 7);
    count += 1;
  }
  return count;
}
