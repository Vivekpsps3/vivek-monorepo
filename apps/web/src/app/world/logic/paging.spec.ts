import { addIsoDays } from './paging';

describe('paging', () => {
  it('shifts civil dates in UTC, including the leap day', () => {
    expect(addIsoDays('2026-10-26', 6)).toBe('2026-11-01');
    expect(addIsoDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addIsoDays('2026-11-02', -7)).toBe('2026-10-26');
  });

});
