import { RECENT_PAST_TRIP_LIMIT, normalizeTripId, tripTagChoices, type TripTagHome } from './trip-tag';

describe('trip tags', () => {
  const home: TripTagHome = {
    in_progress: [{ id: 2, title: 'Now' }, { id: 2, title: 'Now again' }],
    upcoming: [{ id: 3, title: 'Soon' }, { id: 2, title: 'Already current' }],
    past: Array.from({ length: RECENT_PAST_TRIP_LIMIT + 1 }, (_, index) => ({
      id: 10 + index,
      title: `Past ${index}`,
    })),
  };

  it('orders current, upcoming, and the recent past, and keeps one copy of each id', () => {
    expect(tripTagChoices(home, null).map(choice => choice.label)).toEqual([
      'No trip',
      'Now',
      'Soon',
      ...Array.from({ length: RECENT_PAST_TRIP_LIMIT }, (_, index) => `Past ${index}`),
    ]);
  });

  it('keeps an orphan saved id as Earlier trip and rejects ids that are not positive integers', () => {
    const older = 10 + RECENT_PAST_TRIP_LIMIT;
    const choices = tripTagChoices(home, older);
    expect(choices.at(-1)).toEqual({ id: older, label: 'Earlier trip', key: `earlier-${older}` });
    expect(tripTagChoices(null, 9).map(choice => choice.label)).toEqual(['No trip', 'Earlier trip']);
    expect(normalizeTripId(0)).toBeNull();
    expect(normalizeTripId(-4)).toBeNull();
    expect(normalizeTripId(1.5)).toBeNull();
    expect(normalizeTripId('nope')).toBeNull();
    expect(normalizeTripId('12')).toBe(12);
  });
});
