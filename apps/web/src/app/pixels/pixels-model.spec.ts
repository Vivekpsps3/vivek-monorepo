import { composeSnapshot, dayScoreVector, decodePixelApiBody, decodePixelDayFacts } from './pixels-model';

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

  it('keeps the score vector to channel counts in a fixed order', () => {
    const snapshot = composeSnapshot({
      body: {
        from: '2026-08-01',
        to: '2026-08-01',
        days: [{ date: '2026-08-01', town: 1 }],
        sources: { town: 'ok', media: 'ok', travel: 'ok' },
        first_activity_on: '2026-08-01',
      },
      today: '2026-10-29',
      trips: [],
      financeStatus: 'locked',
      financeKept: new Map(),
      fetchedAt: 1,
      profile: null,
    });
    expect(dayScoreVector(snapshot.days[0]!)).toBe(
      '{"date":"2026-08-01","town":1,"media":0,"trip":0,"fin":null,"score":1,"level":1,"dominant":"town"}',
    );
  });

  it('accepts a dated fact and rejects invented dates, routes, and one-sided spans', () => {
    const coverage = { status: 'ok', included: 1, total: 1, truncated: false };
    const body = {
      date: '2026-08-15',
      facts: [{
        id: 'trip:4',
        namespace: 'trip',
        occurrence_id: 4,
        kind: 'trip_span',
        date: '2026-08-15',
        span_start: '2026-08-14',
        span_end: '2026-08-17',
        coverage: 'complete',
        provenance: 'Pixels counts this trip on each civil day from its start through its end.',
        title: 'Portland',
        route: '/travel/trips/4',
      }],
      annotations: [{
        id: 'world_concept:7',
        concept_id: 7,
        name: 'Synthetic concept',
        understood_on: '2026-08-15',
        provenance: 'It does not change the Pixels score.',
      }],
      coverage: { town: coverage, media: coverage, travel: coverage, concepts: coverage },
      differences: [{ id: 'concept-not-score', text: 'It does not change the Pixels score.' }],
      counts: { trip: 1 },
    };
    const decoded = decodePixelDayFacts(body);
    expect(decoded?.facts[0]?.id).toBe('trip:4');
    expect(decoded?.facts[0]?.spanStart).toBe('2026-08-14');
    expect(decoded?.annotations[0]?.conceptId).toBe(7);
    expect(decodePixelDayFacts({ ...body, date: '2026-02-31' })).toBeNull();
    expect(decodePixelDayFacts({
      ...body,
      facts: [{ ...body.facts[0], route: '/finance/' }],
    })).toBeNull();
    expect(decodePixelDayFacts({
      ...body,
      facts: [{ ...body.facts[0], span_end: null }],
    })).toBeNull();
    expect(decodePixelDayFacts({
      ...body,
      facts: [{ ...body.facts[0], kind: 'checkin' }],
    })).toBeNull();
  });

});
