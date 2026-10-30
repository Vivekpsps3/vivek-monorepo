import { canonical } from './canonical';

describe('canonical', () => {
  it('sorts keys, drops undefined, and keeps array order', () => {
    expect(canonical({ b: 1, a: [true, null, 'x"y'], c: undefined, d: { z: 0, y: -3 } })).toBe(
      '{"a":[true,null,"x\\"y"],"b":1,"d":{"y":-3,"z":0}}',
    );
    expect(canonical(null)).toBe('null');
    expect(canonical(false)).toBe('false');
  });

  it('renders empty objects and arrays', () => {
    expect(canonical({})).toBe('{}');
    expect(canonical([])).toBe('[]');
  });

  it('rejects non-integers', () => {
    expect(() => canonical({ a: 1.5 })).toThrowError(Error, 'canonical: non-integer number');
    expect(() => canonical(NaN)).toThrowError(Error, 'canonical: non-integer number');
    expect(() => canonical(Infinity)).toThrowError(Error, 'canonical: non-integer number');
    expect(() => canonical(-Infinity)).toThrowError(Error, 'canonical: non-integer number');
  });

  it('ignores key insertion order', () => {
    expect(canonical({ z: 1, a: 2, m: 3 })).toBe(canonical({ m: 3, z: 1, a: 2 }));
    expect(canonical({ z: 1, a: 2, m: 3 })).toBe('{"a":2,"m":3,"z":1}');
  });
});
