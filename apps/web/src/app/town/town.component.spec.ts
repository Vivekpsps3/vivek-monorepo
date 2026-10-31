import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { TownApiService } from './town.api';
import { TownComponent } from './town.component';
import { LOT_UNLOCK_LV } from './town.constants';
import type { TownResponse } from './town.types';

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
  let api: { getTown: jasmine.Spy };
  beforeEach(() => {
    response = new Subject();
    api = { getTown: jasmine.createSpy().and.callFake(() => response) };
    TestBed.configureTestingModule({ imports: [TownComponent], providers: [provideRouter([]), { provide: TownApiService, useValue: api }] });
  });
  function render(data?: TownResponse) {
    const fixture = TestBed.createComponent(TownComponent);
    fixture.detectChanges();
    if (data) { response.next(data); fixture.detectChanges(); }
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }
  it('loads a header, nine tiles and three Today skeleton rows, then renders server progress', () => {
    const { fixture, el } = render();
    expect(el.querySelectorAll('.tile-skeleton').length).toBe(9);
    expect(el.querySelectorAll('ui-card .ui-skeleton__line').length).toBe(3);
    expect(el.querySelector('.header-skeleton')).not.toBeNull();
    response.next(snapshot()); fixture.detectChanges();
    expect(el.textContent).toContain('Lv 3 · 340 / 500 XP');
    const bar = el.querySelector('[role="progressbar"]')!;
    for (const [name, value] of Object.entries({ valuemin: '250', valuemax: '500', valuenow: '340', valuetext: 'Level 3, 340 of 500 XP' })) expect(bar.getAttribute(`aria-${name}`)).toBe(value);
    expect(el.querySelectorAll('ul > li').length).toBe(9);
    expect([...el.querySelectorAll('.name')].slice(0, 3).map(n => n.textContent)).toEqual(['Library', 'Inn', 'Treasury']);
    expect(el.querySelectorAll('ui-card h2').length).toBe(1);
  });
  it('shows max level without a next-XP denominator', () => {
    const data = snapshot(); Object.assign(data.town, { level: 10, xp: 5500, level_xp_start: 5000, next_level_xp: null });
    expect(render(data).el.textContent).toContain('Lv 10 · Max');
  });
  it('omits the progress bar at max level and renders Lv 10 · Max', () => {
    const data = snapshot(); Object.assign(data.town, { level: 10, xp: 5500, level_xp_start: 5000, next_level_xp: null });
    const el = render(data).el;
    expect(el.querySelector('header p')?.textContent).toBe('Lv 10 · Max');
    expect(el.querySelector('progress')).toBeNull();
    expect(el.querySelector('[role="progressbar"]')).toBeNull();
  });
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
  it('offers the exact first-run copy and all three prefills, hiding Today', () => {
    const data = snapshot(); data.town.founded_on = null;
    const { fixture, el } = render(data);
    const open = spyOn(fixture.componentInstance, 'openHabitDialog');
    expect(el.textContent).toContain('Found Terraria-on-Sea');
    expect(el.textContent).toContain('Pick a first habit. Your town grows as you keep it, and as you watch things in Media and finish trips in Travel.');
    expect(el.textContent).toContain('Media and Travel count from today on.');
    expect(el.querySelector('ui-card')).toBeNull();
    expect(el.querySelector('img')?.width).toBe(128);
    const buttons = [...el.querySelectorAll('button')];
    buttons[0].click(); expect(open).toHaveBeenCalledWith(0, null);
    for (const [index, name] of ['Read 20 pages', 'Walk 30 minutes', 'Sleep by 12'].entries()) {
      expect(buttons[index + 1].textContent?.trim()).toBe(name);
      buttons[index + 1].click(); expect(open).toHaveBeenCalledWith(0, null, name);
    }
  });
  it('retains the founded scene with no active habits and forwards empty-lot clicks', () => {
    const { fixture, el } = render(snapshot());
    const open = spyOn(fixture.componentInstance, 'openHabitDialog');
    expect(el.textContent).toContain('No active habits');
    el.querySelector<HTMLButtonElement>('ul button')!.click(); expect(open).toHaveBeenCalledWith(0, null);
    el.querySelector<HTMLButtonElement>('ui-card button')!.click(); expect(open).toHaveBeenCalledWith(null, null);
  });
  it('renders the next-unlock and all-built helper copy', () => {
    const data = snapshot(); data.lots.forEach(lot => { if (lot.state === 'empty') lot.state = 'occupied'; });
    const { fixture, el } = render(data);
    expect(el.querySelector('footer')?.textContent).toBe('All unlocked lots are built. Reach Lv 5 for another.');
    data.lots.forEach(lot => lot.state = 'occupied'); response.next(data); fixture.detectChanges();
    expect(el.querySelector('footer')?.textContent).toBe('All lots are built.');
  });
  it('refreshes only on a visible date change, polls every five minutes, and cleans up', fakeAsync(() => {
    const date = new Date();
    const today = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const visibility = spyOnProperty(document, 'visibilityState', 'get').and.returnValue('hidden');
    const data = snapshot(); data.town.today = '2000-01-01';
    const { fixture } = render(data);
    tick(300_000); expect(api.getTown).toHaveBeenCalledTimes(1);
    visibility.and.returnValue('visible'); document.dispatchEvent(new Event('visibilitychange'));
    expect(api.getTown).toHaveBeenCalledTimes(2);
    data.town.today = today; response.next(data); tick(300_000);
    expect(api.getTown).toHaveBeenCalledTimes(2);
    data.town.today = '2000-01-01'; response.next(data); tick(300_000);
    expect(api.getTown).toHaveBeenCalledTimes(3);
    fixture.destroy(); tick(300_000); document.dispatchEvent(new Event('visibilitychange'));
    expect(api.getTown).toHaveBeenCalledTimes(3);
  }));
  it('reflows to two columns below the minimum tile width using the scene container', () => {
    const { el } = render(snapshot());
    const scene = el.querySelector<HTMLElement>('.scene')!;
    scene.style.width = '300px';
    expect(getComputedStyle(el.querySelector('ul')!).gridTemplateColumns.split(' ').length).toBe(2);
    scene.style.width = '400px';
    expect(getComputedStyle(el.querySelector('ul')!).gridTemplateColumns.split(' ').length).toBe(3);
  });
});
