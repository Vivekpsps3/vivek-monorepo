import { WORLD_COPY,type ChestOverlay } from '../world.types';
import { chestOverlay,type BudgetView } from './chests';

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
