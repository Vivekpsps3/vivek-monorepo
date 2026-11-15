import { canonical } from './canonical';

describe('canonical', () => {
  it('sorts keys, drops undefined, and keeps array order', () => {
    expect(canonical({ b: 1, a: [true, null, 'x"y'], c: undefined, d: { z: 0, y: -3 } })).toBe(
      '{"a":[true,null,"x\\"y"],"b":1,"d":{"y":-3,"z":0}}',
    );
    expect(canonical(null)).toBe('null');
    expect(canonical(false)).toBe('false');
  });

});
