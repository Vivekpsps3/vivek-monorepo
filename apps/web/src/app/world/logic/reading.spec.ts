import { WORLD_COPY,type WeekChest,type WorldWeek } from '../world.types';
import { readingWeek } from './reading';

function week(partial: Partial<WorldWeek> & Pick<WorldWeek, 'week'>): WorldWeek {
  return {
    trips: [],
    finished: [],
    habits: [],
    concepts: [],
    ...partial,
  };
}

describe('reading', () => {
  const older = week({
    week: '2026-10-26',
    trips: [{
      id: 4,
      title: 'Coast road',
      start: '2026-10-24',
      end: '2026-10-28',
      place: { label: 'Newport', lat_e2: 4460 },
    }],
    finished: [{ entry_id: 8, kind: 'book', title: 'Shown Book', on: '2026-10-27' }],
    finished_more: 3,
    habits: [{
      habit_id: 2,
      name: 'Morning forge',
      style: 'forge',
      archived: false,
      days: ['2026-10-26', '2026-10-28', '2026-11-02'],
    }],
    concepts: [{ id: 5, name: 'Tide tables', on: '2026-10-29' }],
  });

  it('lists known rows, the overflow count, and no titles the API omitted', () => {
    const chest: WeekChest = { week: '2026-10-26', visual: 'gold', line: WORLD_COPY.withinPlan };
    const reading = readingWeek(older, chest);
    expect(reading.label).toBe('2026-10-26');
    expect(reading.week).toBe('2026-10-26');
    expect(reading.items.map((item) => item.kind)).toEqual([
      'trip', 'finished', 'finished', 'habit', 'concept', 'lit', 'lit', 'lit', 'lit', 'budget',
    ]);

    const trip = reading.items[0];
    expect(trip.title).toBe('Coast road');
    expect(trip.detail).toBe('Newport');
    expect(trip.date).toBe('2026-10-24–2026-10-28');

    const shown = reading.items[1];
    expect(shown).toEqual({
      kind: 'finished', id: 'finished:8', title: 'Shown Book', detail: 'book', date: '2026-10-27',
    });
    const overflow = reading.items[2];
    expect(overflow.title).toBe('3 more finished');
    expect(overflow.detail).toBe('');
    expect(JSON.stringify(reading)).not.toContain('Hidden Film');

    expect(reading.items[3]).toEqual({
      kind: 'habit', id: 'habit:2', title: 'Morning forge', detail: 'forge, 2 days', date: '',
    });
    expect(reading.items[4]).toEqual({
      kind: 'concept', id: 'concept:5', title: 'Tide tables', detail: '', date: '2026-10-29',
    });
    expect(reading.items.filter((item) => item.kind === 'lit').map((item) => item.date)).toEqual([
      '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29',
    ]);
    expect(reading.items.filter((item) => item.kind === 'lit').every((item) => item.title === 'Lit')).toBeTrue();
  });

});
