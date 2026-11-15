import { decodeMediaCalendar, decodeMediaSummary, decodeTownSummary, decodeTravelSummary } from './hub-decode';

const trip = {
  id: 7,
  title: 'Lisbon',
  destination: null as string | null,
  origin_label: null as string | null,
  start_date: '2026-11-02',
  end_date: '2026-11-06',
  phase: 'upcoming',
  days_until: 0,
  next_action: 'Open the trip',
  href: '/travel/trips/7',
};

describe('hub summary decoders', () => {
  it('keeps null, zero, and calendar dates on a valid travel summary', () => {
    const decoded = decodeTravelSummary({ up_next: [], today: '2026-11-11', budget: { total_cents: 2500 }, next_trip: trip });
    expect(decoded).toEqual({ up_next: [], next_trip: trip });
    expect(decoded?.next_trip?.start_date).toBe('2026-11-02');
    expect(decoded?.next_trip?.days_until).toBe(0);
    expect(decoded?.next_trip?.destination).toBeNull();
    expect(JSON.stringify(decoded)).not.toContain('2500');
    expect(decodeTravelSummary({ up_next: [], next_trip: null })).toEqual({ up_next: [], next_trip: null });
  });

  it('rejects a travel summary with a missing trip, a string id, or an impossible date', () => {
    expect(decodeTravelSummary({})).toBeNull();
    expect(decodeTravelSummary([])).toBeNull();
    expect(decodeTravelSummary({ up_next: [], next_trip: { ...trip, id: '7' } })).toBeNull();
    expect(decodeTravelSummary({ up_next: [], next_trip: { ...trip, days_until: '0' } })).toBeNull();
    expect(decodeTravelSummary({ up_next: [], next_trip: { ...trip, start_date: '2026-02-31' } })).toBeNull();
    expect(decodeTravelSummary({ up_next: [], next_trip: { ...trip, end_date: '2026-11-02T00:00:00Z' } })).toBeNull();
  });

  it('keeps an unknown release and a null rating without turning them into numbers', () => {
    const decoded = decodeMediaSummary({
      counts: { library: 1 },
      currently: [],
      recent_reviews: [{ id: 4, kind: 'book', title: 'Kindred', rating: null, review_excerpt: null }],
      upcoming: [{ id: 9, kind: 'movie', title: 'Later', when: 'unknown', precision: 'unknown', release_on: null }],
      next_episodes: [{ entry_id: 3, show_title: 'The Wire', season: 1, episode: 3, air_date: null }],
    });
    expect(decoded?.recent_reviews[0]).toEqual({ id: 4, kind: 'book', title: 'Kindred', rating: null, review_excerpt: null });
    expect(decoded?.upcoming[0]?.when).toBe('unknown');
    expect(decoded?.upcoming[0]?.precision).toBe('unknown');
    expect(decoded?.upcoming[0]?.release_on).toBeNull();
    expect(decoded?.next_episodes[0]?.episode_id).toBeNull();
    expect(decoded?.next_episodes[0]?.air_date).toBeNull();
    expect(JSON.stringify(decoded)).not.toContain('library');
  });

  it('rejects a media summary whose lists or nested ids are the wrong shape', () => {
    expect(decodeMediaSummary({ recent_reviews: [], upcoming: [], next_episodes: [] })).toBeNull();
    expect(decodeMediaSummary({ currently: {}, recent_reviews: [], upcoming: [], next_episodes: [] })).toBeNull();
    expect(decodeMediaSummary({
      currently: [{ id: 3, kind: 'tv', title: 'The Wire', rating: '5' }],
      recent_reviews: [],
      upcoming: [],
      next_episodes: [],
    })).toBeNull();
  });

  it('keeps a maxed town and a null founding date', () => {
    const decoded = decodeTownSummary({
      name: 'Terraria-on-Sea',
      founded_on: null,
      level: 3,
      xp: 0,
      level_xp_start: 0,
      next_level_xp: null,
      today_done: 0,
      today_total: 2,
      longest_streak: 0,
      longest_streak_unit: null,
      today: '2026-11-11',
    });
    expect(decoded).toEqual({
      name: 'Terraria-on-Sea',
      founded_on: null,
      level: 3,
      xp: 0,
      level_xp_start: 0,
      next_level_xp: null,
      today_done: 0,
      today_total: 2,
      longest_streak: 0,
      longest_streak_unit: null,
    });
  });

  it('rejects an unknown streak unit and a string xp value', () => {
    const town = {
      name: 'Terraria-on-Sea',
      founded_on: '2026-09-30',
      level: 3,
      xp: 260,
      level_xp_start: 250,
      next_level_xp: 500,
      today_done: 1,
      today_total: 2,
      longest_streak: 3,
      longest_streak_unit: 'days',
    };
    expect(decodeTownSummary({ ...town, longest_streak_unit: 'months' })).toBeNull();
    expect(decodeTownSummary({ ...town, xp: '260' })).toBeNull();
    expect(decodeTownSummary({ ...town, founded_on: '2026-02-31' })).toBeNull();
  });
  it('requires every field of a reminder replacement and reconstructs only an owning Travel route', () => {
    const reminder = { id: 7, title: 'Check in', due_at: '2026-12-24T09:00', done: false, kind: 'flight' as const, notes: null };
    const row = { id: 7, kind: 'reminder' as const, date: '2026-12-24', time: '09:00', tz: null, title: 'Check in', overdue: true,
      trip_id: 12, trip_title: 'Kyoto', href: 'https://invalid.example', reminder };
    const value = { next_trip: null, up_next: [row] };
    expect(decodeTravelSummary(value)?.up_next[0]).toEqual({ ...row, href: '/travel/trips/12' });
    expect(decodeTravelSummary({ ...value, up_next: [{ ...row, reminder: { ...reminder, notes: undefined } }] })).toBeNull();
    expect(decodeTravelSummary({ ...value, up_next: [{ ...row, reminder: { ...reminder, id: 8 } }] })).toBeNull();
    expect(decodeTravelSummary({ ...value, up_next: [{ ...row, time: '25:00' }] })).toBeNull();
    expect(decodeTravelSummary({ ...value, up_next: [{ ...row, date: '2026-02-31' }] })).toBeNull();
  });

  it('decodes exact Media days without keeping notes or imprecise bands and rejects malformed watched flags', () => {
    const event = { type: 'episode', title: 'Premiere', entry_id: 4, watched: false, release_status: 'scheduled' };
    expect(decodeMediaCalendar({ days: [{ date: '2026-12-25', events: [{ ...event, notes: 'not part of the projection' }] }], month_band: [{ title: 'No exact day' }] }))
      .toEqual({ days: [{ date: '2026-12-25', events: [event] }] });
    expect(decodeMediaCalendar({ days: [{ date: '2026-12-25', events: [{ ...event, watched: 'false' }] }] })).toBeNull();
    expect(decodeMediaCalendar({ days: [{ date: '2026-02-31', events: [event] }] })).toBeNull();
  });

});
