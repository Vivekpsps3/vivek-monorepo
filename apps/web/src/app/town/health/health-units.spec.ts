import { displayDistance, displayWeight, kgToLb, kmToMetres, lbToKg, metresToKm, metresToMiles, milesToMetres, pace } from './health-units';

describe('Health units', () => {
  it('converts pounds to canonical kg rounded to hundredths', () => {
    for (const [lb, kg] of [[0, 0], [100, 45.36], [135, 61.23], [225, 102.06]]) expect(lbToKg(lb)).toBe(kg);
    expect(kgToLb(0.45359237)).toBe(1);
  });
  it('converts distance in both directions without display rounding', () => {
    expect(metresToKm(42195)).toBe(42.195); expect(kmToMetres(42.195)).toBe(42195);
    expect(metresToMiles(1609.344)).toBe(1); expect(milesToMetres(1)).toBe(1609.344);
  });
  it('rounds display only', () => {
    const kg = 102.058, metres = 42195;
    expect(displayWeight(kg, 'kg')).toBe('102.1'); expect(displayWeight(kg, 'lb')).toBe('225.0');
    expect(displayWeight(100 * (1 + 5 / 30), 'kg')).toBe('116.7');
    expect(displayDistance(metres, 'km')).toBe('42.20'); expect(displayDistance(metres, 'mi')).toBe('26.22');
    expect(kg).toBe(102.058); expect(metres).toBe(42195);
  });
  for (const [seconds, metres, unit, expected] of [
    [3150, 10000, 'km', '5:15'], [3150, 10000, 'mi', '8:27'],
    [299.6, 1000, 'km', '5:00'], [61, 1000, 'km', '1:01'],
  ] as const) it(`formats ${seconds}/${metres} per ${unit}`, () => expect(pace(seconds, metres, unit)).toBe(expected));
});
