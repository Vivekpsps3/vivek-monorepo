import { fnv1a64, hex64, seed32 } from './fnv1a64';

describe('fnv1a64', () => {
  it('hashes the reference ASCII vectors', () => {
    expect(hex64(fnv1a64(''))).toBe('cbf29ce484222325');
    expect(hex64(fnv1a64('a'))).toBe('af63dc4c8601ec8c');
    expect(hex64(fnv1a64('Terraria-on-Sea'))).toBe('3a03089293cab82d');
  });

  it('hashes UTF-8 bytes, not UTF-16 code units', () => {
    expect(hex64(fnv1a64('\u00e9'))).toBe('0ac21707b7181e01');
    expect(hex64(fnv1a64('e\u0301'))).toBe('c0c9d418ee802e1f');
    expect(hex64(fnv1a64('🌍'))).toBe('ff430438753bca3b');
  });

  it('folds a hash into uint32 and prints 16 zero-padded hex chars', () => {
    expect(seed32(fnv1a64('a'))).toBe(694300864);
    expect(hex64(0n)).toBe('0000000000000000');
  });
});
