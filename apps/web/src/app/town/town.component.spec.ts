import { TestBed,fakeAsync,tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject,Subject } from 'rxjs';
import { VAULT_PRESENCE } from '../../../../finance/frontend/src/public-api';
import { SessionService } from '../platform/session.service';
import { TownApiService } from './town.api';
import { TOWN_BUDGET_KEPT,TownComponent } from './town.component';
import { LOT_UNLOCK_LV } from './town.constants';
import type { TownResponse } from './town.types';

function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function keptBudgetWeeks(count: number): { weekStart: string; kept: true }[] {
  const weeks: { weekStart: string; kept: true }[] = [];
  let cursor = '2026-10-19';
  for (let index = 0; index < count; index += 1) {
    weeks.push({ weekStart: cursor, kept: true });
    const [year, month, day] = cursor.split('-').map(Number);
    cursor = new Date(Date.UTC(year, month - 1, day - 7)).toISOString().slice(0, 10);
  }
  return weeks;
}
async function flushBudget(fixture: { detectChanges(): void }): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  fixture.detectChanges();
}
function snapshot(): TownResponse {
  const building = { xp: 0, level: 1, stage: 1 as const, level_xp_start: 0, next_level_xp: 50, today_xp: 0, today_cap: 10, source: 'ok' as const };
  return {
    town: { name: 'Terraria-on-Sea', founded_on: '2026-10-05', today: '2026-10-29', tz: 'America/Los_Angeles', xp: 340, level: 3, level_xp_start: 250, next_level_xp: 500 },
    buildings: { library: building, inn: { ...building, today_cap: 15 } },
    lots: LOT_UNLOCK_LV.map((unlock_level, slot) => ({ slot, unlock_level, state: unlock_level > 3 ? 'locked' : 'empty', habit_id: null })),
    habits: [], archived: [], today: { done: 0, total: 0 }, constants_version: 1,
  };
}
describe('Town page', () => {
  let response: Subject<TownResponse>;
  let api: { getTown: jasmine.Spy; checkin: jasmine.Spy };
  let budget: jasmine.Spy;
  let user: BehaviorSubject<{ id: number } | null>;
  let cleared: Subject<void>;
  const session: { user: { id: number } | null; readonly currentUser: { id: number } | null; user$: BehaviorSubject<{ id: number } | null>; cleared$: Subject<void> } = {
    user: { id: 7 },
    get currentUser() { return this.user; },
    user$: null as unknown as BehaviorSubject<{ id: number } | null>,
    cleared$: null as unknown as Subject<void>,
  };
  beforeEach(() => {
    localStorage.clear();
    response = new Subject();
    user = new BehaviorSubject<{ id: number } | null>({ id: 7 });
    cleared = new Subject<void>();
    session.user = { id: 7 };
    session.user$ = user;
    session.cleared$ = cleared;
    budget = jasmine.createSpy('loadFinanceBudgetKept').and.resolveTo({ status: 'locked' });
    api = { getTown: jasmine.createSpy().and.callFake(() => response), checkin: jasmine.createSpy() };
    TestBed.configureTestingModule({
      imports: [TownComponent],
      providers: [
        provideRouter([]),
        { provide: TownApiService, useValue: api },
        { provide: SessionService, useValue: session },
        { provide: TOWN_BUDGET_KEPT, useValue: budget },
      ],
    });
  });
  function render(data?: TownResponse) {
    const fixture = TestBed.createComponent(TownComponent);
    fixture.detectChanges();
    if (data) { response.next(data); fixture.detectChanges(); }
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('recovers from unavailable via Retry', () => {
    const { fixture, el } = render();
    response.error({ status: 503 }); fixture.detectChanges();
    expect(el.textContent).toContain('Town is unavailable right now.');
    response = new Subject();
    el.querySelector<HTMLButtonElement>('button')!.click();
    expect(api.getTown).toHaveBeenCalledTimes(2);
    response.next(snapshot()); fixture.detectChanges();
    expect(el.querySelector('ul')).not.toBeNull();
  });

  it('does not render a session-expired banner on 401', () => {
    const { fixture, el } = render();
    response.error({ status: 401 }); fixture.detectChanges();
    expect(el.textContent).not.toContain('Your session ended');
    expect(el.textContent).not.toContain('Town is unavailable right now.');
    expect(el.querySelector('a[href^="/auth/login"]')).toBeNull();
    expect(el.querySelector('[aria-label="Loading Town"]')).not.toBeNull();
  });

  it('renders the next-unlock and all-built helper copy', () => {
    const data = snapshot(); data.lots.forEach(lot => { if (lot.state === 'empty') lot.state = 'occupied'; });
    const { fixture, el } = render(data);
    expect(el.querySelector('footer')?.textContent).toBe('All unlocked lots are built. Reach Lv 5 for another.');
    data.lots.forEach(lot => lot.state = 'occupied'); response.next(data); fixture.detectChanges();
    expect(el.querySelector('footer')?.textContent).toBe('All lots are built.');
  });

  it('refreshes once when the visible local date changes across midnight', fakeAsync(() => {
    // Local 23:55 plus five minutes is 00:00 the next day in every timezone.
    jasmine.clock().mockDate(new Date(2026, 9, 29, 23, 55, 0));
    expect(localDay(new Date())).toBe('2026-10-29');
    spyOnProperty(document, 'visibilityState', 'get').and.returnValue('visible');
    expect(document.visibilityState).toBe('visible');
    const data = snapshot(); data.town.today = '2026-10-29';
    const { fixture } = render(data);
    tick(4 * 60_000);
    expect(localDay(new Date())).toBe('2026-10-29');
    expect(api.getTown).toHaveBeenCalledTimes(1);
    tick(60_000);
    expect(localDay(new Date())).toBe('2026-10-30');
    expect(api.getTown).toHaveBeenCalledTimes(2);
    tick(300_000);
    expect(api.getTown).toHaveBeenCalledTimes(2);
    data.town.today = '2026-10-30'; response.next(data); tick(300_000);
    expect(localDay(new Date())).toBe('2026-10-30');
    expect(api.getTown).toHaveBeenCalledTimes(2);
    fixture.destroy(); tick(300_000); document.dispatchEvent(new Event('visibilitychange'));
    expect(api.getTown).toHaveBeenCalledTimes(2);
  }));

  it('explains a locked Finance vault on the treasury tile and in Today', () => {
    const { el } = render(snapshot());
    const tile = el.querySelectorAll('ul > li')[2] as HTMLElement;
    expect(tile.querySelector('img')?.getAttribute('src')).toBe('/town/treasury-locked.svg');
    expect(tile.textContent).toContain('Finance vault locked');
    expect(tile.textContent).not.toMatch(/\d/);
    expect(tile.querySelector('a')?.getAttribute('href')).toBe('/finance/vault/unlock?next=%2Ftown');
    expect(el.querySelector('.treasury a')?.textContent?.trim()).toBe('Finance vault locked');
    expect(budget).not.toHaveBeenCalled();
    expect(el.querySelector('ui-skeleton')).toBeNull();
    expect(tile.textContent).not.toMatch(/\$/);
  });

  it('clears a visible treasury tier on lock and does not let the old load return', async () => {
    localStorage.setItem(VAULT_PRESENCE, '7');
    let release: (result: { status: string; weeks?: { weekStart: string; kept: boolean | null }[] }) => void = () => undefined;
    budget.and.callFake(() => new Promise(resolve => { release = resolve; }));
    const { fixture, el } = render(snapshot());
    const tile = () => el.querySelectorAll('ul > li')[2] as HTMLElement;
    const xp = 'Lv 3 · 340 / 500 XP';
    expect(el.textContent).toContain(xp);
    release({ status: 'ready', weeks: [{ weekStart: '2026-10-19', kept: true }] });
    await flushBudget(fixture);
    expect(tile().textContent).toContain('Lv 2 · 1 week');

    response.next(snapshot());
    fixture.detectChanges();
    expect(tile().textContent).toContain('Loading');
    const late = release;
    localStorage.removeItem(VAULT_PRESENCE);
    cleared.next();
    fixture.detectChanges();
    expect(tile().textContent).toContain('Finance vault locked');
    expect(tile().textContent).not.toContain('Lv 2');
    late({ status: 'ready', weeks: keptBudgetWeeks(8) });
    await flushBudget(fixture);
    expect(tile().textContent).toContain('Finance vault locked');
    expect(tile().textContent).not.toContain('Lv 5');
    expect(el.textContent).toContain(xp);
    expect(tile().textContent).not.toMatch(/\$/);

    const callsAtLock = budget.calls.count();
    session.user = { id: 8 };
    user.next({ id: 8 });
    fixture.detectChanges();
    expect(tile().textContent).toContain('Finance vault locked');
    expect(budget.calls.count()).toBe(callsAtLock);

    session.user = { id: 9 };
    localStorage.setItem(VAULT_PRESENCE, '9');
    user.next({ id: 9 });
    fixture.detectChanges();
    expect(tile().textContent).toContain('Loading');
    expect(tile().textContent).not.toContain('Lv 2');
    release({ status: 'no_plan' });
    await flushBudget(fixture);
    expect(tile().textContent).toContain('No spending plan');
    expect(tile().querySelector('a')?.getAttribute('href')).toBe('/finance/planning');
    expect(el.textContent).toContain(xp);
    localStorage.removeItem(VAULT_PRESENCE);
    session.user = null;
    user.next(null);
    fixture.detectChanges();
    expect(tile().textContent).toContain('Finance vault locked');
    expect(tile().textContent).not.toContain('No spending plan');
  });

});
