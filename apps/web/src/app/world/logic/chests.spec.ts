import { WORLD_COPY, type ChestOverlay } from '../world.types';
import { chestOverlay, type BudgetView } from './chests';

const LOADED = ['2026-10-19', '2026-10-26', '2026-11-02'];
const CURRENT = '2026-11-02';

describe('chestOverlay', () => {
  function visuals(view: BudgetView, previous?: ChestOverlay) {
    return chestOverlay(view, LOADED, CURRENT, previous);
  }

  it('seals every loaded week except the current one when locked', () => {
    const overlay = visuals({ status: 'locked' });
    expect(overlay).toEqual({
      weeks: [
        { week: '2026-10-19', visual: 'sealed', line: null },
        { week: '2026-10-26', visual: 'sealed', line: null },
        { week: '2026-11-02', visual: 'none', line: null },
      ],
      toolbar: { href: WORLD_COPY.unlockHref, label: WORLD_COPY.unlock },
      retry: false,
    });
  });

  it('maps kept, over, unknown, and the current week without amounts', () => {
    const overlay = visuals({
      status: 'ready',
      weeks: [
        { weekStart: '2026-10-26', kept: true },
        { weekStart: '2026-10-12', kept: false },
        { weekStart: '2026-11-02', kept: true },
      ],
    });
    expect(overlay.weeks).toEqual([
      { week: '2026-10-19', visual: 'none', line: null },
      { week: '2026-10-26', visual: 'gold', line: WORLD_COPY.withinPlan },
      { week: '2026-11-02', visual: 'none', line: null },
    ]);
    expect(overlay.toolbar).toBeNull();
    expect(overlay.retry).toBeFalse();

    const over = visuals({
      status: 'ready',
      weeks: [{ weekStart: '2026-10-26', kept: false }, { weekStart: '2026-10-19', kept: null }],
    });
    expect(over.weeks[0]).toEqual({ week: '2026-10-19', visual: 'none', line: null });
    expect(over.weeks[1]).toEqual({ week: '2026-10-26', visual: 'none', line: WORLD_COPY.overPlan });
    expect(JSON.stringify(overlay)).not.toMatch(/"spend"|"weeklyPlan"|"annualPlan"|\$/);
    expect(overlay.weeks.every((chest) => chest.line === null || !/\d/.test(chest.line))).toBeTrue();
  });

  it('covers plan, data, unavailable, loading, and cleared', () => {
    const noPlan = visuals({ status: 'no_plan' });
    expect(noPlan.weeks.every((chest) => chest.visual === 'none' && chest.line === null)).toBeTrue();
    expect(noPlan.toolbar).toEqual({ href: WORLD_COPY.setPlanHref, label: WORLD_COPY.setPlan });
    expect(noPlan.retry).toBeFalse();

    const noData = visuals({ status: 'no_data' });
    expect(noData.toolbar).toEqual({ href: WORLD_COPY.reviewSpendingHref, label: WORLD_COPY.reviewSpending });
    expect(noData.retry).toBeFalse();
    expect(noData.weeks.every((chest) => chest.visual === 'none')).toBeTrue();

    const unavailable = visuals({ status: 'unavailable' });
    expect(unavailable.toolbar).toBeNull();
    expect(unavailable.retry).toBeTrue();
    expect(unavailable.weeks.every((chest) => chest.visual === 'none' && chest.line === null)).toBeTrue();

    const loading = visuals({ status: 'loading' });
    expect(loading.toolbar).toBeNull();
    expect(loading.retry).toBeFalse();
    expect(loading.weeks.every((chest) => chest.visual === 'none')).toBeTrue();

    const previous = visuals({ status: 'locked' });
    expect(visuals({ status: 'loading' }, previous)).toBe(previous);

    const cleared = visuals({ status: 'cleared' });
    expect(cleared).toEqual({
      weeks: LOADED.map((week) => ({ week, visual: 'none', line: null })),
      toolbar: null,
      retry: false,
    });
  });

  it('never puts a chest on the current week', () => {
    const views: BudgetView[] = [
      { status: 'locked' },
      { status: 'no_plan' },
      { status: 'no_data' },
      { status: 'unavailable' },
      { status: 'cleared' },
      { status: 'ready', weeks: [{ weekStart: CURRENT, kept: true }] },
    ];
    for (const view of views) {
      const current = chestOverlay(view, LOADED, CURRENT).weeks.find((chest) => chest.week === CURRENT);
      expect(current).toEqual({ week: CURRENT, visual: 'none', line: null });
    }
  });
});
