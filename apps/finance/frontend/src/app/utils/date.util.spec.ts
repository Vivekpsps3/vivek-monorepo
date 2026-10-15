import { todayIsoDate } from '@vivek/browser';

describe('browser date utilities', () => {
  it('todayIsoDate returns YYYY-MM-DD in local time', () => {
    expect(todayIsoDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(todayIsoDate()).toBe(expected);
  });
});
