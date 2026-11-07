import {
  displayDistance, displayWeight, kgToLb, kmToMetres, lbToKg,
  metresToKm, metresToMiles, milesToMetres, pace,
} from './health-units';

describe('Health units (§18.8)', () => {
  it('converts lb to kg rounded to 0.01 kg', () => {
    expect(lbToKg(100)).toBe(45.36);
    expect(lbToKg(135)).toBe(61.23);
    expect(lbToKg(1)).toBe(0.45);
  });

  it('converts kg back to lb unrounded', () => {
    expect(kgToLb(45.359237)).toBeCloseTo(100, 6);
    expect(kgToLb(1)).toBeCloseTo(2.20462, 4);
  });

  it('converts distances both ways', () => {
    expect(metresToKm(21097.5)).toBe(21.0975);
    expect(kmToMetres(42.195)).toBe(42195);
    expect(metresToMiles(1609.344)).toBe(1);
    expect(milesToMetres(1)).toBe(1609.344);
  });

  it('formats display weight to 0.1 and distance to 0.01', () => {
    expect(displayWeight(80, 'kg')).toBe('80.0');
    expect(displayWeight(80, 'lb')).toBe('176.4');
    expect(displayDistance(5000, 'km')).toBe('5.00');
    expect(displayDistance(5000, 'mi')).toBe('3.11');
  });

  it('formats pace per km and per mile as m:ss', () => {
    expect(pace(1500, 5000, 'km')).toBe('5:00');
    expect(pace(1500, 5000, 'mi')).toBe('8:03');
    expect(pace(3600, 42195, 'km')).toBe('1:25');
  });
});
