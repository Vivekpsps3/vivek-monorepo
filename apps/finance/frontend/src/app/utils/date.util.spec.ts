import {
daysBetweenDateOnly,
formatDate,
parseDateOnly
} from '@vivek/browser';

describe('shared dates', () => {

  it('counts calendar days across US daylight-saving transitions', () => {
    expect(daysBetweenDateOnly('2026-03-07', '2026-03-09')).toBe(2);
    expect(daysBetweenDateOnly('2026-10-31', '2026-11-02')).toBe(2);
    expect(parseDateOnly('2026-02-31')).toBeNull();
  });

  it('keeps a Pacific evening on the local calendar day', () => {
    const formatted = formatDate(
      '2026-10-22T01:00:00Z',
      'timestamp',
      new Date('2026-11-01T12:00:00Z'),
      'America/Los_Angeles',
    );
    expect(formatted).toContain('Oct 21');
    expect(formatDate('2026-10-21', 'table', new Date('2026-10-22T12:00:00Z'))).toBe('Oct 21');
    expect(formatDate(null)).toBe('No date');
  });

});
