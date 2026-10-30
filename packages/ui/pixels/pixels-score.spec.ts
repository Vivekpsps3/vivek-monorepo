import {
  CHANNEL_CAP,
  CHANNEL_WEIGHT,
  DAY_LEVEL_THRESHOLDS,
  DOMINANCE_ORDER,
  LIFE_MIN_ROWS,
  LIFE_WEEK_COUNT,
  WEEK_LEVEL_THRESHOLDS,
  activityCounts,
  dayActivities,
  dayLevel,
  dayScore,
  dominantApp,
  lifeAge,
  lifeRowCount,
  lifeRowDayCount,
  lifeRowStart,
  lifeWeekDayCount,
  lifeWeeks,
  scoreParts,
  sundayOnOrBefore,
  sundayWeekDates,
  weekLevel,
  weekScore,
  weekScoreFromDays,
  weeksBySunday,
  type AppAmounts,
  type DayChannels,
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

describe('pixels day score', () => {
  const cases: Array<[DayChannels, number, number, string]> = [
    [day(0, 0, 0, null), 0, 0, 'empty day, finance locked'],
    [day(0, 0, 0, 0), 0, 0, 'finance not kept'],
    [day(1, 0, 0, null), 1, 1, 'one town check-in'],
    [day(0, 1, 0, null), 1, 1, 'one episode'],
    [day(0, 0, 0, 1), 1, 1, 'finance kept'],
    [day(0, 0, 1, null), 2, 1, 'a trip weighs 2'],
    [day(2, 0, 0, null), 2, 1, 'score 2 stays at level 1'],
    [day(3, 0, 0, null), 3, 2, 'town at the cap'],
    [day(8, 0, 0, null), 3, 2, 'town above the cap'],
    [day(0, 8, 0, null), 3, 2, 'media above the cap'],
    [day(0, 0, 4, null), 2, 1, 'extra trips still weigh 2'],
    [day(0, 0, 0, 4), 1, 1, 'finance above the cap'],
    [day(3, 0, 1, null), 5, 3, 'capped town plus a trip'],
    [day(3, 2, 1, 0), 7, 4, 'score 7 with finance not kept'],
    [day(3, 3, 0, 1), 7, 4, 'caps plus kept finance'],
    [day(3, 3, 1, null), 8, 4, 'null finance omits the last point'],
    [day(3, 3, 1, 1), 9, 4, 'maximum day'],
    [day(40, 40, 5, 1), 9, 4, 'caps hold the maximum at 9'],
  ];

  for (const [channels, score, level, label] of cases) {
    it(`${label} scores ${score} at level ${level}`, () => {
      expect(dayScore(channels)).withContext(label).toBe(score);
      expect(dayLevel(score)).withContext(label).toBe(level);
      expect(dayLevel(dayScore(channels))).withContext(label).toBe(level);
    });
  }

  it('uses the §3 weights, caps, and level thresholds', () => {
    expect(CHANNEL_WEIGHT).toEqual({ town: 1, media: 1, trip: 2, fin: 1 });
    expect(CHANNEL_CAP).toEqual({ town: 3, media: 3, trip: 1, fin: 1 });
    expect(DAY_LEVEL_THRESHOLDS).toEqual([1, 3, 5, 7]);
    expect(dayLevel(4)).toBe(2);
    expect(dayLevel(6)).toBe(3);
    expect(dayLevel(8)).toBe(4);
  });

  it('counts raw activities and does not cap them', () => {
    expect(dayActivities(day(10, 2, 1, null))).toBe(13);
    expect(dayScore(day(10, 2, 1, null))).toBe(7);
    expect(activityCounts(day(10, 2, 1, null))).toEqual({ travel: 1, town: 10, media: 2, finance: 0 });
    expect(activityCounts(day(10, 2, 1, 1)).finance).toBe(1);
    expect(scoreParts(day(10, 4, 3, null))).toEqual({ travel: 2, town: 3, media: 3, finance: 0 });
    expect(scoreParts(day(0, 0, 1, 1))).toEqual({ travel: 2, town: 0, media: 0, finance: 1 });
  });

  it('ignores negative and non-finite channel counts', () => {
    expect(dayScore(day(-4, Number.NaN, Number.POSITIVE_INFINITY, null))).toBe(0);
    expect(dayActivities(day(-1, 1.9, 0, null))).toBe(1);
  });
});

describe('pixels week score', () => {
  const boundaries: Array<[number, number]> = [
    [0, 0],
    [1, 1],
    [7, 1],
    [8, 2],
    [17, 2],
    [18, 3],
    [29, 3],
    [30, 4],
    [63, 4],
    [81, 4],
  ];

  for (const [score, level] of boundaries) {
    it(`week score ${score} is level ${level}`, () => {
      expect(weekLevel(score)).toBe(level);
      expect(weekLevel(weekScore([score]))).toBe(level);
    });
  }

  it('uses the §3 week thresholds', () => {
    expect(WEEK_LEVEL_THRESHOLDS).toEqual([1, 8, 18, 30]);
  });

  it('sums per-day scores, including each kept Finance day', () => {
    const kept = day(0, 0, 0, 1);
    expect(weekScoreFromDays([kept, kept, kept, kept, kept, kept, kept])).toBe(7);
    expect(weekScoreFromDays([day(3, 3, 1, 1), day(3, 3, 1, 1)])).toBe(18);
    expect(weekLevel(weekScoreFromDays([day(3, 3, 1, 1), day(3, 3, 1, 1)]))).toBe(3);
    expect(weekScoreFromDays(Array.from({ length: 7 }, () => day(3, 3, 1, 1)))).toBe(63);
    expect(weekScoreFromDays(Array.from({ length: 9 }, () => day(3, 3, 1, 1)))).toBe(81);
    expect(weekScore([])).toBe(0);
    expect(weekLevel(0)).toBe(0);
  });

  it('builds the week boundaries from day scores', () => {
    expect(weekScore([0, 0, 0, 0, 0, 0, 0])).toBe(0);
    expect(weekScore([1])).toBe(1);
    expect(weekScore([9, 8, 1])).toBe(18);
    expect(weekScore([9, 9, 9, 3])).toBe(30);
    expect(weekLevel(weekScore([9, 9, 9, 3]))).toBe(4);
    expect(weekLevel(weekScore([9, 9, 9, 2]))).toBe(3);
  });
});

describe('pixels Sunday weeks', () => {
  it('puts 31 Dec and 1 Jan in the week that starts the previous Sunday', () => {
    expect(sundayOnOrBefore('2025-12-28')).toBe('2025-12-28');
    expect(sundayOnOrBefore('2025-12-31')).toBe('2025-12-28');
    expect(sundayOnOrBefore('2026-01-01')).toBe('2025-12-28');
    expect(sundayOnOrBefore('2026-01-03')).toBe('2025-12-28');
    expect(sundayOnOrBefore('2026-01-04')).toBe('2026-01-04');
    expect(sundayWeekDates('2026-01-01')).toEqual([
      '2025-12-28',
      '2025-12-29',
      '2025-12-30',
      '2025-12-31',
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
    ]);
  });

  it('sums both sides of the year boundary and keeps the next Sunday separate', () => {
    const weeks = weeksBySunday([
      { date: '2026-01-04', channels: day(1) },
      { date: '2026-01-01', channels: day(0, 0, 1, null) },
      { date: '2025-12-31', channels: day(0, 0, 0, 1) },
    ]);
    expect(weeks.map((week) => week.start)).toEqual(['2025-12-28', '2026-01-04']);
    expect(weeks[0]).toEqual(jasmine.objectContaining({
      start: '2025-12-28',
      end: '2026-01-03',
      score: 3,
      level: 1,
    }));
    expect(weeks[0]?.dayScores).toEqual([0, 0, 0, 1, 2, 0, 0]);
    expect(weeks[1]?.score).toBe(1);
    expect(weeks[1]?.dates[0]).toBe('2026-01-04');
  });

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

  it('keeps the last entry when a date is repeated', () => {
    const weeks = weeksBySunday([
      { date: '2026-01-01', channels: day(1) },
      { date: '2026-01-01', channels: day(0, 0, 1) },
    ]);
    expect(weeks).toHaveSize(1);
    expect(weeks[0]?.score).toBe(2);
  });

  it('matches UTC Sundays from 1900 through 2028, including dates before the epoch', () => {
    expect(sundayOnOrBefore('1970-01-01')).toBe('1969-12-28');
    expect(sundayOnOrBefore('1900-01-01')).toBe('1899-12-31');
    const samples = ['1900-01-01', '1969-12-28', '1970-01-01', '2000-02-29', '2024-02-29'];
    for (let year = 2019; year <= 2028; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        samples.push(`${year}-${month < 10 ? `0${month}` : month}-01`);
        samples.push(`${year}-${month < 10 ? `0${month}` : month}-15`);
      }
    }
    for (const iso of samples) {
      expect(sundayOnOrBefore(iso)).withContext(iso).toBe(utcSunday(iso));
    }
  });
});

describe('pixels dominant app', () => {
  const none: AppAmounts = { travel: 0, town: 0, media: 0, finance: 0 };

  it('breaks equal positive amounts Travel > Town > Media > Finance', () => {
    expect(DOMINANCE_ORDER).toEqual(['travel', 'town', 'media', 'finance']);
    for (let index = 0; index < DOMINANCE_ORDER.length; index += 1) {
      const amounts: AppAmounts = { ...none };
      for (let tied = index; tied < DOMINANCE_ORDER.length; tied += 1) {
        const app = DOMINANCE_ORDER[tied];
        if (app) amounts[app] = 4;
      }
      expect(dominantApp(amounts)).withContext(DOMINANCE_ORDER[index]).toBe(DOMINANCE_ORDER[index]);
    }
  });

  it('lets a strictly higher amount beat an earlier app', () => {
    expect(dominantApp({ travel: 1, town: 2, media: 0, finance: 0 })).toBe('town');
    expect(dominantApp({ travel: 1, town: 1, media: 5, finance: 9 })).toBe('finance');
    expect(dominantApp({ travel: 3, town: 3, media: 4, finance: 4 })).toBe('media');
  });

  it('returns null when every amount is zero or negative', () => {
    expect(dominantApp(none)).toBeNull();
    expect(dominantApp({ travel: -2, town: 0, media: -1, finance: 0 })).toBeNull();
    expect(dominantApp({ travel: -1, town: 0, media: 0, finance: 2 })).toBe('finance');
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
  });

  it('gives week 52 the leftover day or two and keeps the earlier weeks at 7', () => {
    expect(LIFE_WEEK_COUNT).toBe(52);
    expect(lifeWeekDayCount(365, 1)).toBe(7);
    expect(lifeWeekDayCount(365, 51)).toBe(7);
    expect(lifeWeekDayCount(365, 52)).toBe(8);
    expect(lifeWeekDayCount(366, 52)).toBe(9);
    expect(lifeRowDayCount('2000-02-29', 0)).toBe(365);
    expect(lifeWeekDayCount(lifeRowDayCount('2000-02-29', 0), 52)).toBe(8);
    expect(lifeRowDayCount('2000-02-29', 3)).toBe(366);
    expect(lifeWeekDayCount(lifeRowDayCount('2000-02-29', 3), 52)).toBe(9);
    expect(lifeRowDayCount('1999-03-01', 0)).toBe(366);
    expect(lifeRowDayCount('2000-03-01', 0)).toBe(365);

    const leapBirth = lifeWeeks('2000-02-29', 0);
    const acrossLeap = lifeWeeks('2000-02-29', 3);
    expect(leapBirth).toHaveSize(52);
    expect(leapBirth[0]).toEqual(jasmine.objectContaining({ week: 1, start: '2000-02-29', days: 7 }));
    expect(leapBirth[51]?.days).toBe(8);
    expect(acrossLeap[51]?.days).toBe(9);
    expect(leapBirth.reduce((sum, span) => sum + span.days, 0)).toBe(365);
    expect(acrossLeap.reduce((sum, span) => sum + span.days, 0)).toBe(366);
    expect(leapBirth[51]?.end).toBe('2001-02-27');
    expect(lifeRowStart('2000-02-29', 1)).toBe('2001-02-28');
    expect(acrossLeap[0]?.start).toBe('2003-02-28');
    expect(acrossLeap[51]?.end).toBe('2004-02-28');
  });

  it('does not snap a life week to Sunday', () => {
    const weeks = lifeWeeks('1996-03-14', 0);
    expect(weeks[0]?.start).toBe('1996-03-14');
    expect(weeks[0]?.end).toBe('1996-03-20');
    expect(weeks[1]?.start).toBe('1996-03-21');
    expect(sundayOnOrBefore('1996-03-14')).toBe('1996-03-10');
  });

  it('sets the poster length to max(90, age + 1)', () => {
    expect(LIFE_MIN_ROWS).toBe(90);
    expect(lifeRowCount(0)).toBe(90);
    expect(lifeRowCount(40)).toBe(90);
    expect(lifeRowCount(89)).toBe(90);
    expect(lifeRowCount(90)).toBe(91);
    expect(lifeRowCount(95)).toBe(96);
    const age = lifeAge('1930-06-01', '2026-10-30');
    expect(age).toBe(96);
    expect(lifeRowCount(age ?? 0)).toBe(97);
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

  it('rejects dates and indexes that are not on the calendar', () => {
    expect(() => lifeRowStart('2025-02-29', 0)).toThrowError(RangeError);
    expect(() => lifeRowStart('2026-13-01', 0)).toThrowError(RangeError);
    expect(() => lifeRowStart('2026-1-01', 0)).toThrowError(RangeError);
    expect(() => sundayOnOrBefore('2026-04-31')).toThrowError(RangeError);
    expect(() => lifeRowStart('2000-02-29', -1)).toThrowError(RangeError);
    expect(() => lifeWeekDayCount(364, 52)).toThrowError(RangeError);
    expect(() => lifeWeekDayCount(365, 0)).toThrowError(RangeError);
    expect(() => lifeWeekDayCount(365, 53)).toThrowError(RangeError);
    expect(() => lifeRowCount(Number.NaN)).toThrowError(RangeError);
    expect(() => weekScore([Number.NaN])).toThrowError(RangeError);
    expect(() => dayLevel(Number.POSITIVE_INFINITY)).toThrowError(RangeError);
  });
});
