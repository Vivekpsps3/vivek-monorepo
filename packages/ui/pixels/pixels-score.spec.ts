import {
lifeAge,
lifeRowDayCount,
lifeRowStart,
sundayOnOrBefore,
weeksBySunday,
type DayChannels
} from './pixels-score';

function day(town = 0, media = 0, trip = 0, fin: number | null = null): DayChannels {
  return { town, media, trip, fin };
}

/** UTC calendar oracle. Host zone cannot change Date.UTC or getUTCDay. */
function utcDate(iso: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new Error(iso);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function utcSunday(iso: string): string {
  const utc = utcDate(iso);
  const start = new Date(utc.getTime() - utc.getUTCDay() * 86_400_000);
  return start.toISOString().slice(0, 10);
}

function utcDaysBetween(start: string, end: string): number {
  return Math.round((utcDate(end).getTime() - utcDate(start).getTime()) / 86_400_000);
}

describe('pixels Sunday weeks', () => {

  it('round-trips a year below 1000 through sundayOnOrBefore and parse', () => {
    const start = sundayOnOrBefore('0999-06-15');
    expect(start).toBe(utcSunday('0999-06-15'));
    expect(start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(sundayOnOrBefore(start)).toBe(start);
    expect(lifeRowStart('0999-06-15', 0)).toBe('0999-06-15');
    expect(lifeRowStart('0996-02-29', 1)).toBe('0997-02-28');
    const grouped = weeksBySunday([{ date: '0999-06-15', channels: day(1) }]);
    expect(grouped[0]?.start).toBe(start);
    for (const iso of grouped[0]?.dates ?? []) {
      expect(sundayOnOrBefore(iso)).toBe(start);
    }
  });

});

describe('pixels life geometry', () => {
  it('starts a Feb 29 birthday on Feb 28 in non-leap years', () => {
    expect(lifeRowStart('2000-02-29', 0)).toBe('2000-02-29');
    expect(lifeRowStart('2000-02-29', 1)).toBe('2001-02-28');
    expect(lifeRowStart('2000-02-29', 3)).toBe('2003-02-28');
    expect(lifeRowStart('2000-02-29', 4)).toBe('2004-02-29');
    expect(lifeRowStart('2000-02-28', 1)).toBe('2001-02-28');
    expect(lifeRowStart('1996-03-14', 30)).toBe('2026-03-14');
    // 2100 is divisible by 100 but not 400, so it is not a leap year.
    expect(lifeRowStart('2000-02-29', 100)).toBe('2100-02-28');
  });

  it('turns a Feb 29 birthday a year older on Feb 28 when the year is not a leap year', () => {
    expect(lifeAge('2000-02-29', '2000-02-29')).toBe(0);
    expect(lifeAge('2000-02-29', '2001-02-27')).toBe(0);
    expect(lifeAge('2000-02-29', '2001-02-28')).toBe(1);
    expect(lifeAge('2000-02-29', '2004-02-28')).toBe(3);
    expect(lifeAge('2000-02-29', '2004-02-29')).toBe(4);
    expect(lifeAge('2000-02-29', '2000-02-28')).toBeNull();
    expect(lifeAge('2026-12-01', '2026-11-30')).toBeNull();
    expect(lifeAge('2026-12-01', '2026-12-01')).toBe(0);
  });

  it('matches UTC row lengths for leap and century years', () => {
    for (const birthday of ['1900-03-01', '1996-03-14', '2000-02-28', '2000-02-29', '2023-01-31']) {
      for (const row of [0, 1, 3, 4, 28]) {
        const start = lifeRowStart(birthday, row);
        const next = lifeRowStart(birthday, row + 1);
        expect(lifeRowDayCount(birthday, row)).withContext(`${birthday} row ${row}`).toBe(utcDaysBetween(start, next));
        expect([365, 366]).withContext(`${birthday} row ${row}`).toContain(lifeRowDayCount(birthday, row));
      }
    }
  });

});
