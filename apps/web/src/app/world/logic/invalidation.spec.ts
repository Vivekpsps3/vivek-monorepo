import { weeksToRegenerate } from './invalidation';

describe('weeksToRegenerate', () => {
  it('regenerates nothing for a text edit or an archive', () => {
    expect(weeksToRegenerate({ kind: 'text' })).toEqual([]);
    expect(weeksToRegenerate({ kind: 'archive' })).toEqual([]);
  });

  it('snaps a date move to unique Mondays and drops empty strings', () => {
    expect(weeksToRegenerate({
      kind: 'weeks',
      weeks: ['2026-11-04', '', '2026-11-05', '2026-11-01', '2026-10-26', 'not-a-date'],
    })).toEqual(['2026-11-02', '2026-10-26']);
  });
});
