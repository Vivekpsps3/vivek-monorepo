import { composeSnapshot, decodeHomeTrips, decodePixelApiBody, financeChannel, tripDayLabel, withoutFinance, yearScreenState, yearStats } from './pixels-model';
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

  it('keeps null counts, source states, and a null birthday without converting them', () => {
    const body = decodePixelApiBody({
      from: '2026-08-01',
      to: '2026-08-01',
      days: [{ date: '2026-08-01', town: null, media: 2 }],
      sources: { town: 'ok', media: 'absent', travel: 'unavailable' },
      first_activity_on: null,
      profile: { birthday: null, show_age: false },
      version: 2,
    });
    expect(body?.days[0]?.town).toBeNull();
    expect(body?.days[0]?.media).toBe(2);
    expect(body?.days[0]?.trip).toBeUndefined();
    expect(body?.first_activity_on).toBeNull();
    expect(body?.profile).toEqual({ birthday: null, show_age: false });
    expect(body?.sources).toEqual({ town: 'ok', media: 'absent', travel: 'unavailable' });
    expect(body && 'version' in body).toBeFalse();
    const snapshot = composeSnapshot({
      body: body!,
      today: '2026-10-29',
      trips: [],
      financeStatus: 'locked',
      financeKept: new Map(),
      fetchedAt: 1,
      profile: { birthday: null, showAge: false },
    });
    expect(snapshot.days[0]?.channels.town).toBe(0);
    expect(snapshot.days[0]?.channels.fin).toBeNull();
    expect(snapshot.financeStatus).toBe('locked');
    expect(snapshot.profile).toEqual({ birthday: null, showAge: false });
  });

  it('rejects a string count, an unknown source, and an impossible day', () => {
    const valid = {
      from: '2026-08-01',
      to: '2026-08-02',
      days: [{ date: '2026-08-01', town: 1 }],
      sources: { town: 'ok', media: 'ok', travel: 'ok' },
      first_activity_on: '2026-08-01',
    };
    expect(decodePixelApiBody({ ...valid, days: [{ date: '2026-08-01', town: '1' }] })).toBeNull();
    expect(decodePixelApiBody({ ...valid, sources: { town: 'later', media: 'ok', travel: 'ok' } })).toBeNull();
    expect(decodePixelApiBody({ ...valid, from: '2026-02-31' })).toBeNull();
    expect(decodePixelApiBody({ ...valid, days: 'none' })).toBeNull();
  });

  it('reads trip dates and drops a malformed home row without inventing an id', () => {
    expect(decodeHomeTrips({
      in_progress: [{ id: 4, title: 'Lisbon', start_date: '2026-08-01', end_date: '2026-08-02', budget: { total_cents: 2500 } }],
      upcoming: [],
      past: [],
    })).toEqual([{ id: 4, title: 'Lisbon', start: '2026-08-01', end: '2026-08-02' }]);
    expect(decodeHomeTrips({
      in_progress: [{ id: '4', title: 'Lisbon', start_date: '2026-08-01', end_date: '2026-08-02' }],
    })).toBeNull();
    expect(decodeHomeTrips({ in_progress: [{ id: 4, title: 'Lisbon', start_date: '2026-08-01T00:00:00Z', end_date: '2026-08-02' }] })).toBeNull();
    expect(decodeHomeTrips(null)).toBeNull();
  });

  it('keeps an empty past year and a future year drawable', () => {
    const empty = snapshotOf('2026-01-01', '2026-01-02');
    expect(yearScreenState(empty, 'ready', '2026-10-29')).toBe('ready');
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
