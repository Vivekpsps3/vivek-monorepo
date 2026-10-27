import { journalKindLabel, mediaReleaseLabel } from './hub-summary';

describe('Hub media labels', () => {
  it('uses the journal kind labels', () => {
    expect(journalKindLabel('tv')).toBe('Series');
    expect(journalKindLabel('book')).toBe('Book');
    expect(journalKindLabel('track')).toBe('Song');
    expect(journalKindLabel('game')).toBe('Game');
  });

  it('keeps month and year releases from looking like a specific day', () => {
    expect(mediaReleaseLabel({ when: 'upcoming', precision: 'year', release_on: '2027-01-01' })).toBe('2027');
    expect(mediaReleaseLabel({ when: 'upcoming', precision: 'month', release_on: '2026-11-01' })).toBe('November 2026');
    expect(mediaReleaseLabel({ when: 'this_month', precision: 'month', release_on: '2026-10-01' })).toBe('This month');
    expect(mediaReleaseLabel({ when: 'unknown', precision: 'unknown', release_on: null })).toBe('No date');
    expect(mediaReleaseLabel({ when: 'upcoming', precision: 'day', release_on: '2026-12-02' })).toBeNull();
  });
});
