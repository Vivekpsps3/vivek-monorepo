import { addDays, formatTownDay, habitNameError, labelRange, normalizedHabitName, pendingHint } from './town-text';
import type { Habit } from './town.types';

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

  it('formats a calendar day without shifting it', () => {
    expect(formatTownDay('2026-11-02')).toBe('Mon 2 Nov');
  });

  it('labels the worked daily example inside the window', () => {
    const checked = new Set(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-10', '2026-10-11', '2026-10-12']);
    const labels = labelRange({ created: '2026-10-05', today: '2026-10-15', from: '2026-10-05', to: '2026-10-15', daily: true, checked });
    expect(labels.get('2026-10-09')).toEqual({ text: 'rest', kind: 'rest' });
    expect(labels.get('2026-10-13')).toEqual({ text: 'rest', kind: 'rest' });
    expect(labels.get('2026-10-14')).toEqual({ text: 'missed', kind: 'miss' });
    expect(labels.get('2026-10-15')).toEqual({ text: '', kind: 'pending' });
    expect(labels.get('2026-10-12')?.text).toBe('done');
  });

  it('leaves weekly gaps blank', () => {
    const labels = labelRange({
      created: '2026-09-30', today: '2026-10-29', from: '2026-10-26', to: '2026-10-29', daily: false,
      checked: new Set(['2026-10-26', '2026-10-27']),
    });
    expect(labels.get('2026-10-28')).toEqual({ text: '', kind: 'empty' });
    expect(labels.get('2026-10-26')?.text).toBe('done');
  });

  it('phrases a pending cadence from the calendar date', () => {
    const habit = { cadence: { per_week: 3, kind: 'weekly', pending: { per_week: 4, effective_from: '2026-11-02' } } } as Habit;
    expect(pendingHint(habit)).toBe('Changes to 4× a week from Mon 2 Nov');
    expect(addDays('2026-10-29', 4)).toBe('2026-11-02');
  });
});
