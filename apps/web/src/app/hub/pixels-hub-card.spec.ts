import { adjacentHubStripDate,hubStripLabel,hubStripTabDate,hubStripWindow } from './pixels-hub-card';

describe('hub year strip', () => {

  it('moves by weekday or week inside the strip and names past and future days', () => {
    const dates = hubStripWindow('2026-10-29').dates;
    expect(adjacentHubStripDate('2026-10-29', 'ArrowLeft', dates)).toBe('2026-10-22');
    expect(adjacentHubStripDate('2026-10-29', 'ArrowRight', dates)).toBeNull();
    expect(adjacentHubStripDate('2026-10-29', 'ArrowDown', dates)).toBe('2026-10-30');
    expect(adjacentHubStripDate('2026-10-29', 'ArrowUp', dates)).toBe('2026-10-28');
    expect(adjacentHubStripDate('2026-10-31', 'ArrowDown', dates)).toBeNull();
    expect(adjacentHubStripDate('2026-08-02', 'ArrowLeft', dates)).toBeNull();
    expect(adjacentHubStripDate('2026-08-15', 'Home', dates)).toBe('2026-08-08');
    expect(adjacentHubStripDate('2026-08-15', 'End', dates)).toBe('2026-10-31');
    expect(adjacentHubStripDate('2026-08-15', 'PageDown', dates)).toBeNull();
    expect(hubStripTabDate(null, dates, '2026-10-29')).toBe('2026-10-29');
    expect(hubStripTabDate('2026-10-22', dates, '2026-10-29')).toBe('2026-10-22');
    expect(hubStripTabDate('1999-01-01', dates, '2026-10-29')).toBe('2026-10-29');

    const past = hubStripLabel({ date: '2026-10-22', level: 2, future: false, today: false, planned: false });
    const future = hubStripLabel({ date: '2026-10-30', level: 0, future: true, today: false, planned: false });
    const today = hubStripLabel({ date: '2026-10-29', level: 1, future: false, today: true, planned: false });
    expect(past).toContain('2026');
    expect(past).toContain('level 2');
    expect(past).not.toContain('future');
    expect(future).toContain('future');
    expect(future).not.toContain('level');
    expect(today).toContain('today');
    expect(today).toContain('level 1');
  });
});
