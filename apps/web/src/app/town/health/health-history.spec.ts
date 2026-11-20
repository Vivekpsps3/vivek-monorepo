import { displayWeight } from './health-units';
import {
  HEALTH_HISTORY_PAGE,
  HEALTH_SPARKLINE_POINTS,
  buildClinicSeries,
  pageClinicSeries,
  sparklineGeometry,
} from './health-history';
import type { HealthStat } from './health.types';

const UNITS = { weight: 'lb' as const, distance: 'mi' as const };

function day(index: number): string {
  const date = new Date(Date.UTC(2024, 0, 1 + index));
  return date.toISOString().slice(0, 10);
}

function id(mark: string, index: number): string {
  return `hlt_${mark}${String(index).padStart(21, '0')}`;
}

function entry(clientId: string, value: HealthStat): { clientId: string; value: HealthStat } {
  return { clientId, value };
}

describe('Clinic history projection', () => {
  it('keeps the twelve-point and hundred-record windows', () => {
    expect(HEALTH_SPARKLINE_POINTS).toBe(12);
    expect(HEALTH_HISTORY_PAGE).toBe(100);
  });

  it('draws a line from stored numbers and a dot when only one point exists', () => {
    expect(sparklineGeometry([
      { y: 1, y2: null },
      { y: 2, y2: null },
      { y: 3, y2: null },
    ]).line).toBe('3,33 60,18 117,3');
    expect(sparklineGeometry([
      { y: 4, y2: null },
      { y: 4, y2: null },
    ]).line).toBe('3,18 117,18');
    const single = sparklineGeometry([{ y: 9, y2: null }]);
    expect(single.line).toBe('');
    expect(single.dot).toEqual({ x: 60, y: 18 });
    expect(single.dot2).toBeNull();
    const pressure = sparklineGeometry([{ y: 9, y2: 3 }]);
    expect(pressure.dot).toEqual({ x: 60, y: 3 });
    expect(pressure.dot2).toEqual({ x: 60, y: 33 });
    expect(sparklineGeometry([]).line).toBe('');
  });

  it('pages each kind past 100 without dropping older rows or a second copy', () => {
    const originals: { clientId: string; value: HealthStat }[] = [];
    for (let index = 0; index < 101; index += 1) {
      const measured = day(index);
      originals.push(
        entry(id('W', index), { v: 1, kind: 'weight', measured_on: measured, logged_on: measured, kg: 40 + index }),
        entry(id('R', index), { v: 1, kind: 'rhr', measured_on: measured, logged_on: measured, bpm: 30 + index }),
        entry(id('B', index), { v: 1, kind: 'bp', measured_on: measured, logged_on: measured, sys: 80 + index, dia: 50 }),
        entry(id('S', index), { v: 1, kind: 'sleep', measured_on: measured, logged_on: measured, hours: (index % 8) + 1 }),
        entry(id('L', index), {
          v: 1, kind: 'lab', measured_on: measured, logged_on: measured,
          lab: { name: 'Ω-series', value: index + 1, unit: 'u', ref_low: 40, ref_high: 60 },
        }),
        entry(id('C', index), { v: 1, kind: 'checkup', measured_on: measured, logged_on: measured, note: `Note ${index}` }),
      );
    }
    originals.push(entry(id('W', 200), { v: 1, kind: 'weight', measured_on: day(200), logged_on: day(200) }));
    const before = JSON.stringify(originals);
    const series = buildClinicSeries(originals, UNITS);
    expect(JSON.stringify(originals)).toBe(before);
    expect(series.map(item => item.kind)).toEqual(['weight', 'rhr', 'bp', 'sleep', 'lab', 'checkup']);

    const first = pageClinicSeries(series, {}, null);
    for (const page of first) {
      expect(page.total).toBe(page.kind === 'weight' ? 102 : 101);
      expect(page.shown).toBe(100);
      expect(page.more).toBeTrue();
      expect(page.visibleRows.some(row => row.clientId === id(page.kind === 'weight' ? 'W' : page.kind[0].toUpperCase(), 0))).toBeFalse();
      expect(page.visibleRows[0]?.clientId).not.toBe(id('W', 0));
    }

    const weight = series.find(item => item.kind === 'weight');
    if (!weight) throw new Error('missing weight');
    expect(weight.latestLabel).toBe(`Weight · ${day(200)}`);
    expect(weight.sparkline.points.some(point => point.clientId === id('W', 200))).toBeFalse();
    expect(weight.sparkline.points.length).toBe(12);
    expect(weight.sparkline.points[0]?.clientId).toBe(id('W', 89));
    expect(weight.sparkline.points[11]?.clientId).toBe(id('W', 100));
    expect(weight.sparkline.points[11]?.text).toBe(`Weight · ${displayWeight(140, 'lb')} lb · ${day(100)}`);
    expect(weight.rows.some(row => row.clientId === id('W', 0))).toBeTrue();

    const expanded = pageClinicSeries(series, {
      weight: 200, rhr: 200, bp: 200, sleep: 200, lab: 200, checkup: 200,
    }, null);
    for (const page of expanded) {
      expect(page.more).toBeFalse();
      expect(page.shown).toBe(page.total);
      expect(page.visibleRows.some(row => row.clientId.endsWith('000'))).toBeTrue();
      expect(page.visibleRows.length).toBe(page.total);
    }
    const linked = pageClinicSeries(series, {}, id('R', 0));
    expect(linked.find(item => item.kind === 'rhr')?.shown).toBe(101);
    expect(linked.find(item => item.kind === 'weight')?.shown).toBe(100);
  });

  it('changes display text when units change and leaves the stored series alone', () => {
    const records = [0, 1, 2].map(index => entry(id('W', index), {
      v: 1, kind: 'weight', measured_on: day(index), logged_on: day(index), kg: 80 + index,
    }));
    const pounds = buildClinicSeries(records, UNITS)[0];
    const kilograms = buildClinicSeries(records, { weight: 'kg', distance: 'mi' })[0];
    if (!pounds || !kilograms) throw new Error('missing series');
    expect(pounds.sparkline.line).toBe(kilograms.sparkline.line);
    expect(pounds.sparkline.points.map(point => point.y)).toEqual([80, 81, 82]);
    expect(kilograms.sparkline.points.map(point => point.text).join(' ')).toContain('80.0 kg');
    expect(pounds.sparkline.points.map(point => point.text).join(' ')).toContain(`${displayWeight(80, 'lb')} lb`);
    expect(records[0]?.value.kg).toBe(80);
  });

  it('uses one ordering and keeps lab range words on the sparkline text', () => {
    const sameDay = day(1);
    const records = [
      entry(id('B', 1), { v: 1, kind: 'bp', measured_on: day(1), logged_on: day(1), sys: 118, dia: 76 }),
      entry(id('B', 2), { v: 1, kind: 'bp', measured_on: day(2), logged_on: day(1), sys: 120, dia: 78 }),
      entry(id('B', 3), { v: 1, kind: 'bp', measured_on: day(2), logged_on: day(2), sys: 121, dia: 79 }),
      entry(id('L', 1), {
        v: 1, kind: 'lab', measured_on: sameDay, logged_on: sameDay,
        lab: { name: 'Ω-marker', value: 9, unit: 'u', ref_low: 10, ref_high: 20 },
      }),
      entry(id('L', 2), {
        v: 1, kind: 'lab', measured_on: sameDay, logged_on: sameDay,
        lab: { name: 'Ω-marker', value: 15, unit: 'u', ref_low: 10, ref_high: 20 },
      }),
      entry(id('L', 3), {
        v: 1, kind: 'lab', measured_on: sameDay, logged_on: sameDay,
        lab: { name: 'Ω-marker', value: 21, unit: 'u', ref_low: 10, ref_high: 20 },
      }),
      entry(id('L', 4), {
        v: 1, kind: 'lab', measured_on: sameDay, logged_on: sameDay,
        lab: { name: 'Ω-other', value: 4, unit: 'u' },
      }),
      entry(id('C', 1), { v: 1, kind: 'checkup', measured_on: sameDay, logged_on: sameDay, note: 'Synthetic visit note' }),
    ];
    const series = buildClinicSeries(records, UNITS);
    const pressure = series.find(item => item.kind === 'bp');
    expect(pressure?.latestLabel).toBe(`Blood pressure · 121/79 · ${day(2)}`);
    expect(pressure?.sparkline.points.map(point => point.clientId)).toEqual([id('B', 1), id('B', 2), id('B', 3)]);
    expect(pressure?.sparkline.line2).not.toBe('');
    const labs = series.find(item => item.kind === 'lab');
    const marker = labs?.folders.find(folder => folder.title === 'Ω-marker');
    const other = labs?.folders.find(folder => folder.title === 'Ω-other');
    expect(marker?.latestLabel).toContain('above range');
    expect(marker?.sparkline.points.map(point => point.text).join('\n')).toContain('below range');
    expect(marker?.sparkline.points.map(point => point.text).join('\n')).toContain('in range');
    expect(marker?.sparkline.points.map(point => point.text).join('\n')).toContain('above range');
    expect(other?.sparkline.points[0]?.text).toContain('no range');
    expect(other?.sparkline.line).toBe('');
    const checkup = series.find(item => item.kind === 'checkup');
    expect(checkup?.sparkline.line).toBe('');
    expect(checkup?.sparkline.points[0]?.text).toBe(`Checkup · Synthetic visit note · ${sameDay}`);
    expect(JSON.stringify(series)).not.toContain('medical');
  });
});
