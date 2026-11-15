import { fnv1a64,hex64 } from './fnv1a64';

describe('fnv1a64', () => {
  it('hashes the reference ASCII vectors', () => {
    expect(hex64(fnv1a64(''))).toBe('cbf29ce484222325');
    expect(hex64(fnv1a64('a'))).toBe('af63dc4c8601ec8c');
    expect(hex64(fnv1a64('Terraria-on-Sea'))).toBe('3a03089293cab82d');
  });

});
