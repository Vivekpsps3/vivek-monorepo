import { composeSnapshot, financeChannel, tripDayLabel, withoutFinance, yearScreenState, yearStats } from './pixels-model';
import type { PixelsSnapshot } from './pixels.types';

const statuses = ['locked', 'no_plan', 'no_data', 'unavailable', 'expired', 'cancelled'] as const;

describe('pixels finance join', () => {
  it('maps ready to the kept boolean and every other status to no-data', () => {
    expect(financeChannel('ready', true)).toBe(1);
    expect(financeChannel('ready', false)).toBe(0);
    expect(financeChannel('ready', null)).toBeNull();
    for (const status of statuses) expect(financeChannel(status, false)).toBeNull();
  });

  it('does not treat a day before the first transaction as a missed budget', () => {
    const snapshot = composeSnapshot({
      body: {
        from: '2026-08-14',
        to: '2026-08-15',
        days: [{ date: '2026-08-15', town: 1 }],
        sources: { town: 'ok', media: 'ok', travel: 'ok' },
        first_activity_on: '2026-08-15',
      },
      today: '2026-10-29',
      trips: [{ id: 1, title: 'Portland', start: '2026-08-14', end: '2026-08-17' }],
      financeStatus: 'ready',
      financeKept: new Map([['2026-08-14', null], ['2026-08-15', true]]),
      fetchedAt: 1,
      profile: null,
    });
    expect(snapshot.days[0]?.channels.fin).toBeNull();
    expect(snapshot.days[1]?.channels.fin).toBe(1);
    expect(snapshot.days[0]?.trip?.title).toBe('Portland');
    expect(tripDayLabel(snapshot.days[0]!.trip!, '2026-08-15')).toBe('Portland, day 2 of 4');
    expect(yearStats(snapshot.days, 'ready').budgetKept).toBe(1);
    expect(yearStats(withoutFinance(snapshot, '2026-10-29').days, 'locked').budgetKept).toBeNull();
    expect(withoutFinance(snapshot, '2026-10-29').days.every(day => day.channels.fin === null)).toBeTrue();
  });

  it('keeps an empty past year empty and a future year drawable', () => {
    const empty = snapshotOf('2026-01-01', '2026-01-02');
    expect(yearScreenState(empty, 'ready', '2026-10-29')).toBe('empty');
    const future = snapshotOf('2031-01-01', '2031-01-02');
    expect(yearScreenState(future, 'ready', '2026-10-29')).toBe('ready');
  });
});

function snapshotOf(from: string, to: string): PixelsSnapshot {
  return composeSnapshot({
    body: {
      from,
      to,
      days: [],
      sources: { town: 'ok', media: 'ok', travel: 'ok' },
      first_activity_on: null,
    },
    today: '2026-10-29',
    trips: [],
    financeStatus: 'locked',
    financeKept: new Map(),
    fetchedAt: 1,
    profile: null,
  });
}
