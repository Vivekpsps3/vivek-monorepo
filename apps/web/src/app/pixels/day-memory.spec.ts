import { buildDayMemory, financeReading, financeStatLabel, weekFinanceText } from './day-memory';
import type { PixelDayFacts, PixelDayView, SourceCoverage } from './pixels.types';

describe('day memory', () => {
  const coverage = (status: SourceCoverage['status'], included = 0, total = 0): SourceCoverage => ({
    status,
    included,
    total,
    truncated: false,
  });

  function day(partial: Partial<PixelDayView> = {}): PixelDayView {
    return {
      date: '2024-02-29',
      score: 1,
      level: 1,
      dominant: 'town',
      trip: null,
      future: false,
      planned: false,
      today: false,
      ...partial,
      channels: { town: 1, media: 0, trip: 0, fin: null, ...partial.channels },
    };
  }

  function facts(partial: Partial<PixelDayFacts> = {}): PixelDayFacts {
    const row = coverage('ok', 1, 1);
    return {
      date: '2024-02-29',
      facts: [{
        id: 'habit_checkin:1',
        namespace: 'habit_checkin',
        occurrenceId: 1,
        kind: 'checkin',
        date: '2024-02-29',
        spanStart: null,
        spanEnd: null,
        coverage: 'complete',
        provenance: 'Pixels counts this habit check-in on its civil day.',
        title: 'Read synthetic',
        route: '/town/',
      }],
      annotations: [{
        id: 'world_concept:7',
        conceptId: 7,
        name: 'Synthetic concept',
        understoodOn: '2024-02-29',
        provenance: 'It does not change the Pixels score.',
      }],
      coverage: { town: row, media: coverage('ok', 0, 0), travel: coverage('absent'), concepts: coverage('ok', 1, 1) },
      differences: [],
      counts: { town: 1 },
      ...partial,
    };
  }

  it('keeps locked, expired, unavailable, absent, and empty finance apart', () => {
    expect(financeReading('locked', null).text).toBe('Finance is locked. Unlock to include budget kept.');
    expect(financeReading('expired', null).state).toBe('expired');
    expect(financeReading('unavailable', 1)).toEqual({ state: 'unavailable', text: 'Finance is unavailable.' });
    expect(financeReading('cancelled', null).state).toBe('unavailable');
    expect(financeReading('no_plan', null)).toEqual({ state: 'absent', text: 'Finance has no budget plan.' });
    expect(financeReading('no_data', null).state).toBe('empty');
    expect(financeReading('ready', 1).text).toBe('Finance · budget kept');
    expect(financeStatLabel('no_plan')).toBe('no plan');
    expect(financeStatLabel('no_data')).toBe('none');
    expect(financeStatLabel('unavailable')).toBe('unavailable');
    expect(financeStatLabel('expired')).toBe('expired');
    expect(financeStatLabel('locked')).toBe('locked');
    expect(weekFinanceText('ready', true, 1)).toBe('Finance · 1 day kept');
    expect(weekFinanceText('unavailable', true, 1)).toBe('Finance is unavailable.');
    expect(weekFinanceText('no_plan', false, 0)).not.toContain('no data');
  });

  it('names saved records and leaves photos, notes, and weekly review unconnected', () => {
    const memory = buildDayMemory({
      day: day({ trip: { id: 3, title: 'Leap harbor', start: '2024-02-28', end: '2024-03-01' }, channels: { town: 1, media: 0, trip: 1, fin: null } }),
      financeStatus: 'no_plan',
      facts: {
        ...facts(),
        coverage: {
          ...facts().coverage,
          travel: coverage('ok', 1, 1),
        },
        facts: [
          ...facts().facts,
          {
            id: 'trip:3',
            namespace: 'trip',
            occurrenceId: 3,
            kind: 'trip_span',
            date: '2024-02-29',
            spanStart: '2024-02-28',
            spanEnd: '2024-03-01',
            coverage: 'complete',
            provenance: 'Pixels counts each civil day a trip spans.',
            title: 'Leap harbor',
            route: '/travel/trips/3',
          },
        ],
      },
      factsStatus: 'ready',
    });
    const town = memory.slots.find(slot => slot.id === 'town');
    const travel = memory.slots.find(slot => slot.id === 'travel');
    const photos = memory.slots.find(slot => slot.id === 'photos');
    const notes = memory.slots.find(slot => slot.id === 'notes');
    expect(town?.records[0]?.action).toBe('Open Town check-in · Read synthetic');
    expect(town?.records[0]?.href).toBe('/town/');
    expect(travel?.records[0]?.detail).toContain('Leap harbor, day 2 of 3');
    expect(travel?.records[0]?.href).toBe('/travel/trips/3');
    expect(photos).toEqual(jasmine.objectContaining({ state: 'absent', records: [] }));
    expect(photos?.text).toBe('Photos are not connected.');
    expect(notes?.text).toBe('Notes are not connected.');
    expect(memory.recap).toContain('Read synthetic');
    expect(memory.recap).toContain('Leap harbor');
    expect(memory.recap).toContain('Synthetic concept');
    expect(memory.recap).toContain('Weekly review is not available.');
    expect(memory.recap).not.toContain('synthetic private note');
    expect(memory.recap).not.toContain('http');
  });

  it('does not turn a failed travel read or an empty day into a story', () => {
    const trip = { id: 3, title: 'Leap harbor', start: '2024-02-28', end: '2024-03-01' };
    const failed = buildDayMemory({
      day: day({ trip, channels: { town: 0, media: 0, trip: 1, fin: null } }),
      financeStatus: 'unavailable',
      facts: null,
      factsStatus: 'unavailable',
    });
    expect(failed.slots.find(slot => slot.id === 'travel')?.text).toContain('unavailable');
    expect(failed.slots.find(slot => slot.id === 'travel')?.records).toEqual([]);
    expect(failed.slots.find(slot => slot.id === 'travel')?.preview).toBeNull();
    expect(failed.recap).toContain('The recap for 2024-02-29 is unavailable.');
    expect(failed.recap).toContain('The score is unchanged.');
    expect(failed.recap).not.toContain('Leap harbor');

    const empty = buildDayMemory({
      day: day({ channels: { town: 0, media: 0, trip: 0, fin: null } }),
      financeStatus: 'no_data',
      facts: {
        ...facts(),
        facts: [],
        annotations: [],
        coverage: {
          town: coverage('ok', 0, 0),
          media: coverage('absent'),
          travel: coverage('ok', 0, 0),
          concepts: coverage('ok', 0, 0),
        },
      },
      factsStatus: 'ready',
    });
    expect(empty.slots.find(slot => slot.id === 'town')?.state).toBe('empty');
    expect(empty.slots.find(slot => slot.id === 'media')?.state).toBe('absent');
    expect(empty.slots.find(slot => slot.id === 'finance')?.text).toBe('Finance has no budget activity in this range.');
    expect(empty.recap).toContain('No saved records on 2024-02-29.');
    expect(empty.recap).toContain('Weekly review is not available.');
  });
});
