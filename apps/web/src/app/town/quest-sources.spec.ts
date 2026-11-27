import { classifySource, combineSource, type SourceRead, type SourceState } from './quest-sources';

const emptyLibrary = { currently: [], recent_reviews: [], upcoming: [], next_episodes: [] };

function read(status: number, body: unknown): SourceRead {
  return { status, body };
}

describe('quest source classification', () => {
  it('treats a missing probe as loading and a timeout as unavailable', () => {
    expect(classifySource('library', null)).toBe('loading');
    expect(classifySource('travel', read(0, null))).toBe('unavailable');
    expect(classifySource('memory', read(504, null))).toBe('unavailable');
  });

  it('keeps an empty library, trip list, and memory list distinct from a lock', () => {
    expect(classifySource('library', read(200, emptyLibrary))).toBe('empty');
    expect(classifySource('library', read(200, { ...emptyLibrary, currently: [{}] }))).toBe('ready');
    expect(classifySource('library', read(200, {}))).toBe('unavailable');
    expect(classifySource('library', read(403, emptyLibrary))).toBe('locked');
    expect(classifySource('travel', read(200, { total: 0, memories: [] }))).toBe('empty');
    expect(classifySource('travel', read(200, { total: 2, memories: [{ title: 'Hidden' }] }))).toBe('ready');
    expect(classifySource('travel', read(200, {}))).toBe('unavailable');
    expect(classifySource('travel', read(423, null))).toBe('locked');
    expect(classifySource('memory', read(200, []))).toBe('empty');
    expect(classifySource('memory', read(200, [{ name: 'Hidden' }]))).toBe('ready');
    expect(classifySource('memory', read(401, []))).toBe('locked');
  });

  it('does not call a locked or failed source empty', () => {
    const cases: SourceState[][] = [
      ['ready', 'empty'],
      ['loading', 'empty'],
      ['empty', 'empty'],
      ['locked', 'empty'],
      ['unavailable', 'empty'],
      ['locked', 'unavailable'],
    ];
    expect(cases.map(combineSource)).toEqual([
      'ready', 'loading', 'empty', 'locked', 'unavailable', 'unavailable',
    ]);
    expect(combineSource([])).toBe('unavailable');
  });
});
