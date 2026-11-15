import type { WorldWeek } from '../world.types';
import { engineWeek } from './engine-week';

describe('engineWeek', () => {
  const week: WorldWeek = {
    week: '2026-10-26',
    trips: [{
      id: 41,
      title: 'TripTitleZZ',
      start: '2026-10-24',
      end: '2026-10-29',
      place: { label: 'Portland', lat_e2: 4552 },
    }],
    finished: [{ entry_id: 9, kind: 'book', title: 'FinishedTitleZZ', on: '2026-10-27' }],
    finished_more: 4,
    habits: [{
      habit_id: 12,
      name: 'HabitNameZZ',
      style: 'forge',
      archived: false,
      days: ['2026-10-26', '2026-10-27'],
    }],
    concepts: [{ id: 7, name: 'ConceptNameZZ', on: '2026-10-28' }],
  };

  it('keeps ids, dates, styles, place, and finished_more, and drops titles and names', () => {
    const api = engineWeek(week);
    expect(api).toEqual({
      week: '2026-10-26',
      trips: [{ id: 41, start: '2026-10-24', end: '2026-10-29', place: { label: 'Portland', lat_e2: 4552 } }],
      finished: [{ entry_id: 9, kind: 'book', on: '2026-10-27' }],
      finished_more: 4,
      habits: [{ habit_id: 12, style: 'forge', days: ['2026-10-26', '2026-10-27'], archived: false }],
      concepts: [{ id: 7, on: '2026-10-28' }],
    });
    const text = JSON.stringify(api);
    expect(text).not.toContain('TripTitleZZ');
    expect(text).not.toContain('FinishedTitleZZ');
    expect(text).not.toContain('HabitNameZZ');
    expect(text).not.toContain('ConceptNameZZ');
    expect(text).toContain('Portland');
  });

});
