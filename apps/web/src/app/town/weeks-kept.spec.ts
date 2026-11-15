import { FinanceBudgetRunError, financeBudgetRun, treasuryFace, treasuryFromBudget, weeksKeptRun } from './weeks-kept';
import type { FinanceBudgetWeek } from './weeks-kept';

describe('weeksKeptRun', () => {
  it('uses the longest Town story run and converts day streaks by sevens', () => {
    expect(weeksKeptRun([])).toBe(0);
    expect(weeksKeptRun([
      { streak: { unit: 'days', current: 13 } },
      { streak: { unit: 'weeks', current: 4 } },
      { streak: { unit: 'days', current: 0 } },
    ])).toBe(4);
  });

  it('stays a habit count when Finance weeks say the opposite', () => {
    expect(weeksKeptRun([{ streak: { unit: 'days', current: 70 } }])).toBe(10);
    expect(financeBudgetRun([
      { weekStart: '2026-10-19', kept: false },
      { weekStart: '2026-10-12', kept: false },
    ], '2026-10-29').run).toBe(0);
  });
});

function mondayBefore(iso: string, weeksAgo: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7) - 7 * weeksAgo);
  return date.toISOString().slice(0, 10);
}

function keptWeeks(newestMonday: string, count: number, kept: boolean | null = true): FinanceBudgetWeek[] {
  const rows: FinanceBudgetWeek[] = [];
  let cursor = newestMonday;
  for (let index = 0; index < count; index += 1) {
    rows.push({ weekStart: cursor, kept });
    const [year, month, day] = cursor.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day - 7));
    cursor = date.toISOString().slice(0, 10);
  }
  return rows;
}

describe('financeBudgetRun', () => {
  const today = '2026-10-29';
  const newest = mondayBefore(today, 1);

  it('counts newest completed weeks backward and ignores the current week', () => {
    const current = mondayBefore(today, 0);
    expect(current).toBe('2026-10-26');
    expect(newest).toBe('2026-10-19');
    const unordered = [
      { weekStart: '2026-10-05', kept: true },
      { weekStart: current, kept: true },
      { weekStart: newest, kept: true },
      { weekStart: '2026-10-12', kept: true },
    ];
    expect(financeBudgetRun(unordered, today)).toEqual({ run: 3, saturated: false });
    expect(financeBudgetRun([
      { weekStart: current, kept: false },
      { weekStart: newest, kept: true },
      { weekStart: '2026-10-12', kept: true },
    ], today)).toEqual({ run: 2, saturated: false });
  });

  it('stops at false, null, or a missing week', () => {
    expect(financeBudgetRun([{ weekStart: newest, kept: false }], today)).toEqual({ run: 0, saturated: false });
    expect(financeBudgetRun([{ weekStart: newest, kept: null }], today)).toEqual({ run: 0, saturated: false });
    expect(financeBudgetRun([
      { weekStart: newest, kept: true },
      { weekStart: '2026-10-05', kept: true },
    ], today)).toEqual({ run: 1, saturated: false });
    expect(financeBudgetRun([], today)).toEqual({ run: 0, saturated: false });
  });

  it('rejects duplicate and malformed weeks instead of guessing', () => {
    expect(() => financeBudgetRun([
      { weekStart: newest, kept: true },
      { weekStart: newest, kept: false },
    ], today)).toThrowMatching(error => error instanceof FinanceBudgetRunError && error.reason === 'duplicate');
    expect(() => financeBudgetRun([{ weekStart: '2026-10-20', kept: true }], today))
      .toThrowMatching(error => error instanceof FinanceBudgetRunError && error.reason === 'malformed');
    expect(() => financeBudgetRun([{ weekStart: '2026-02-31', kept: true }], today))
      .toThrowMatching(error => error instanceof FinanceBudgetRunError && error.reason === 'malformed');
    expect(() => financeBudgetRun([{ weekStart: newest, kept: 'yes' as unknown as boolean }], today))
      .toThrowMatching(error => error instanceof FinanceBudgetRunError && error.reason === 'malformed');
    expect(() => financeBudgetRun([{ weekStart: newest, kept: true }], 'yesterday'))
      .toThrowMatching(error => error instanceof FinanceBudgetRunError && error.reason === 'malformed');
  });

  it('saturates a run that fills the 52 week window and keeps a seen ending exact', () => {
    const full = keptWeeks(newest, 52);
    expect(financeBudgetRun(full, today)).toEqual({ run: 52, saturated: true });
    expect(financeBudgetRun(keptWeeks(newest, 53), today)).toEqual({ run: 53, saturated: true });
    const ended = keptWeeks(newest, 52);
    ended.push({ weekStart: mondayBefore(today, 53), kept: false });
    expect(financeBudgetRun(ended, today)).toEqual({ run: 52, saturated: false });
    expect(treasuryFace({
      status: 'ready',
      run: 52,
      saturated: true,
      tier: 5,
      stage: 3,
    }).label).toBe('Lv 5 · 52+ weeks');
    expect(treasuryFace({
      status: 'ready',
      run: 52,
      saturated: false,
      tier: 5,
      stage: 3,
    }).label).toBe('Lv 5 · 52 weeks');
  });
});

describe('treasuryFromBudget', () => {
  const today = '2026-10-29';

  it('maps plan, data, lock, and outage without using a habit streak', () => {
    expect(treasuryFromBudget({ status: 'locked' }, today)).toEqual({ status: 'locked' });
    expect(treasuryFromBudget({ status: 'no_plan' }, today)).toEqual({ status: 'no_plan' });
    expect(treasuryFromBudget({ status: 'no_data' }, today)).toEqual({ status: 'no_data' });
    expect(treasuryFromBudget({ status: 'unavailable' }, today)).toEqual({ status: 'unavailable' });
    expect(treasuryFromBudget({ status: 'expired' }, today)).toEqual({ status: 'unavailable' });
    expect(treasuryFromBudget({ status: 'cancelled' }, today)).toBeNull();
    expect(treasuryFromBudget({
      status: 'ready',
      weeks: [{ weekStart: '2026-10-19', kept: true }, { weekStart: '2026-10-12', kept: false }],
    }, today)).toEqual({ status: 'ready', run: 1, saturated: false, tier: 2, stage: 2 });
    expect(treasuryFromBudget({
      status: 'ready',
      weeks: [{ weekStart: '2026-10-19', kept: true }, { weekStart: '2026-10-19', kept: true }],
    }, today)).toEqual({ status: 'unavailable' });
  });

  it('points each state at its own Finance link and hides money', () => {
    expect(treasuryFace({ status: 'locked' })).toEqual({
      label: 'Finance vault locked',
      href: '/finance/vault/unlock?next=%2Ftown',
      external: true,
      stage: null,
    });
    expect(treasuryFace({ status: 'no_plan' }).href).toBe('/finance/planning');
    expect(treasuryFace({ status: 'no_data' }).href).toBe('/finance/spending');
    expect(treasuryFace({ status: 'unavailable' })).toEqual({
      label: 'Unavailable',
      href: '/finance',
      external: false,
      stage: 1,
    });
    expect(JSON.stringify(treasuryFace({
      status: 'ready', run: 8, saturated: false, tier: 5, stage: 3,
    }))).not.toMatch(/\$|spend|annualPlan/);
  });
});
