import { HISTORY_LEGEND, habitNameError, labelRange, normalizedHabitName } from './town-text';

describe('town text', () => {
  it('normalizes names and rejects controls, bidi marks and the wrong length', () => {
    expect(normalizedHabitName('  Read   pages \n')).toBe('Read pages');
    expect(habitNameError('  Read   pages ')).toBeNull();
    expect(habitNameError('a'.repeat(41))).toBe('Use 1 to 40 characters.');
    expect(habitNameError('   ')).toBe('Use 1 to 40 characters.');
    expect(habitNameError('Read\u202Epages')).toBe('Use letters, numbers and punctuation only.');
    expect(habitNameError('bad\u0007name')).toBe('Use letters, numbers and punctuation only.');
    expect([...normalizedHabitName('é')].length).toBe(1);
  });

  it('names pending today and keeps the legend words on the same marks', () => {
    const cells = labelRange({
      created: '2026-10-27',
      today: '2026-10-29',
      from: '2026-10-27',
      to: '2026-10-29',
      daily: true,
      checked: new Set(['2026-10-27']),
    });
    expect(cells.get('2026-10-27')).toEqual({ text: 'done', kind: 'done' });
    expect(cells.get('2026-10-28')).toEqual({ text: 'rest', kind: 'rest' });
    expect(cells.get('2026-10-29')).toEqual({ text: 'pending', kind: 'pending' });
    const weekly = labelRange({
      created: '2026-10-27',
      today: '2026-10-29',
      from: '2026-10-27',
      to: '2026-10-29',
      daily: false,
      checked: new Set(['2026-10-28']),
    });
    expect(weekly.get('2026-10-27')).toEqual({ text: '', kind: 'empty' });
    expect(weekly.get('2026-10-28')).toEqual({ text: 'done', kind: 'done' });
    expect(weekly.get('2026-10-29')).toEqual({ text: 'pending', kind: 'pending' });
    expect(HISTORY_LEGEND.map(item => item.text)).toEqual(['done', 'rest', 'missed', 'pending', '']);
  });

});
