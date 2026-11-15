import { addDays,dayIndex } from './normalize';

describe('normalize', () => {
  it('adds days in UTC, including the leap day', () => {
    expect(addDays('2026-10-26', 6)).toBe('2026-11-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(dayIndex('2026-10-26', '2026-10-29')).toBe(3);
  });

});
