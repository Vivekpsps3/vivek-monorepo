import { normalizeWeek } from '../world/engine/normalize';
import { V } from '../world/engine/testing/golden.fixtures';
import type { TripKeepsake } from './keepsake.types';
import { sceneryFor, shownRows } from './keepsake-view';

function trip(patch: Partial<TripKeepsake> = {}): TripKeepsake {
  return {
    id: 'trip:1:planned',
    trip_id: 1,
    title: 'Shelf Harbor',
    status: 'booked',
    mark: 'souvenir',
    span_start: '2026-10-24',
    span_end: '2026-10-29',
    credit_date: '2026-10-30',
    credit_eligible: true,
    destinations: [],
    place: null,
    scenery: 'No saved destination. This souvenir does not invent a place. Scenery is illustrative. It is not a map of the trip.',
    route: '/travel/trips/1',
    note: 'Town credits this trip once.',
    ...patch,
  };
}

describe('keepsake view', () => {
  it('uses the saved latitude and hash vectors for scenery', () => {
    const bands = [5500, -5500, 3500, 1500, 1499].map(lat => sceneryFor(trip({
      place: { label: 'Ignored', lat_e2: lat },
    })).biome);
    expect(bands).toEqual(['snow', 'snow', 'forest', 'desert', 'jungle']);

    const full = normalizeWeek(V.G2_full);
    const portland = sceneryFor(trip({
      trip_id: 41,
      span_start: '2026-10-24',
      span_end: '2026-10-29',
      place: { label: 'Portland, Oregon, United States', lat_e2: 4552 },
      scenery: 'The saved destination is Portland. Scenery on this souvenir is illustrative. It is not a map of the trip.',
    }));
    expect(portland.biome).toBe(full.days[0].biome);
    expect(portland.text).toContain('illustrative');
    expect(portland.text).toContain('not a map');
    expect(portland.text).toContain(portland.biome);

    const missing = normalizeWeek(V.G4_nolatlng);
    const kyoto = sceneryFor(trip({
      trip_id: 8,
      span_start: '2025-07-08',
      span_end: '2025-07-10',
      place: { label: 'Kyoto, Japan', lat_e2: null },
    }));
    const unnamed = sceneryFor(trip({ trip_id: 9, span_start: '2025-07-10', span_end: '2025-07-13', place: null }));
    expect(kyoto.biome).toBe(missing.days[1].biome);
    expect(unnamed.biome).toBe(missing.days[4].biome);
    expect(sceneryFor(trip({ trip_id: 9, place: null })).biome).toBe(unnamed.biome);
    expect(unnamed.text).toContain('does not invent a place');
    expect(unnamed.text).not.toContain('Portland');
  });

  it('shows three matches and filters before the preview', () => {
    const rows = ['Atlas', 'Beta', 'Cedar', 'Dune'].map(title => ({ title }));
    expect(shownRows(rows, '', false)).toEqual({
      shown: [{ title: 'Atlas' }, { title: 'Beta' }, { title: 'Cedar' }],
      hidden: 1,
      matched: 4,
    });
    expect(shownRows(rows, 'une', false).shown).toEqual([{ title: 'Dune' }]);
    expect(shownRows(rows, '', true).shown).toEqual(rows);
  });
});
