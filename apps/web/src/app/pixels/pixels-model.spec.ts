import { composeSnapshot,decodePixelApiBody } from './pixels-model';

describe('pixels finance join', () => {

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

});
