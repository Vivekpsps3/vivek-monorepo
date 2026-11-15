import { habitNameError,normalizedHabitName } from './town-text';

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

});
