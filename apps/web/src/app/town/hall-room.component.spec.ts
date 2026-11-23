import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BehaviorSubject, Subject } from 'rxjs';
import { SessionService } from '../platform/session.service';
import { HallRoomComponent } from './hall-room.component';
import { hallObjects, hallRoom } from './hall-room.assets';
import { DAILY_CAP, TOWN_LV, TREASURY_WEEKS } from './town.constants';
import { frontObject, REST_CAMERA, roomRect, roomToScreen } from './library-room.scene';
import { TownApiService } from './town.api';
import type { Habit, TownResponse } from './town.types';

function habit(partial: Partial<Habit> = {}): Habit {
  return {
    id: 15, name: 'Read 20 pages', slot: 0, building_style: 'forge',
    cadence: { per_week: 7, kind: 'daily', pending: null },
    created_on: '2026-10-04', archived_on: null, xp: 3, level: 4, stage: 1,
    level_xp_start: 0, next_level_xp: 50,
    streak: { unit: 'days', current: 1, best: 1, best_days: 1, best_weeks: 0, rest_day_available: true, rest_used_on: null },
    week: { done: 1, target: 7 }, checked_today: false, checked_yesterday: false, can_check_yesterday: false, last7: [],
    ...partial,
  };
}

function town(partial: Partial<TownResponse> = {}): TownResponse {
  const building = {
    xp: 0, level: 1, stage: 1 as const, level_xp_start: 0, next_level_xp: 50,
    today_xp: 7777, today_cap: 10, source: 'ok' as const,
  };
  return {
    town: {
      name: 'Terraria-on-Sea', founded_on: '2026-10-04', today: '2026-10-29', tz: 'America/Los_Angeles',
      xp: 1, level: 9, level_xp_start: 0, next_level_xp: 100,
    },
    buildings: { library: building, inn: { ...building, today_cap: 15 } },
    lots: [],
    habits: [habit()],
    archived: [{
      id: 8, name: 'Walk 30 minutes', xp: 40, level: 2, best_days: 0, best_weeks: 2,
      created_on: '2026-10-01', archived_on: '2026-10-20',
    }],
    today: { done: 0, total: 1 },
    constants_version: 1,
    ...partial,
  };
}

function apiDouble(getTown: jasmine.Spy) {
  return {
    getTown,
    getCheckins: jasmine.createSpy().and.returnValue(new Subject()),
    patchHabit: jasmine.createSpy().and.returnValue(new Subject()),
    checkin: jasmine.createSpy().and.returnValue(new Subject()),
    createHabit: jasmine.createSpy().and.returnValue(new Subject()),
  };
}

describe('Hall scene', () => {
  it('picks the progress dial in front of the rules board', () => {
    const rules = hallObjects.find(object => object.asset.id === 'rules')!;
    const progress = hallObjects.find(object => object.asset.id === 'progress')!;
    const rulesRect = roomRect(rules);
    const progressRect = roomRect(progress);
    const point = {
      x: (Math.max(rulesRect.left, progressRect.left) + Math.min(rulesRect.left + rulesRect.width, progressRect.left + progressRect.width)) / 2,
      y: (Math.max(rulesRect.top, progressRect.top) + Math.min(rulesRect.top + rulesRect.height, progressRect.top + progressRect.height)) / 2,
    };
    expect(progressRect.width).toBeGreaterThan(40);
    expect(frontObject(hallObjects, point)?.asset.id).toBe('progress');
    expect(frontObject(hallObjects, { x: rulesRect.left + 4, y: rulesRect.top + 4 })?.asset.id).toBe('rules');
  });
});

describe('Hall load', () => {
  function setup(userId: number | null = 1) {
    const user$ = new BehaviorSubject<{ id: number } | null>(userId == null ? null : { id: userId });
    const loads: Subject<TownResponse>[] = [];
    const getTown = jasmine.createSpy().and.callFake(() => {
      const subject = new Subject<TownResponse>();
      loads.push(subject);
      return subject;
    });
    const api = apiDouble(getTown);
    return { user$, loads, api };
  }

  it('ignores a held town on owner change and on destruction', () => {
    const { user$, loads, api } = setup();
    TestBed.configureTestingModule({
      imports: [HallRoomComponent],
      providers: [provideRouter([]), { provide: SessionService, useValue: { user$ } }, { provide: TownApiService, useValue: api }],
    });
    const fixture = TestBed.createComponent(HallRoomComponent);
    const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
    fixture.detectChanges();
    expect(text()).toContain('Loading Hall');
    expect(text()).toContain(`Level 2 starts at ${TOWN_LV[1]} XP`);
    expect(loads[0].observed).toBeTrue();

    user$.next({ id: 2 });
    fixture.detectChanges();
    expect(loads[0].observed).toBeFalse();
    loads[0].next(town({ habits: [habit({ name: 'Secret balance 41829' })] }));
    fixture.detectChanges();
    expect(text()).not.toContain('Secret balance 41829');
    expect(text()).not.toContain('7777');
    loads[1].next(town({ habits: [habit({ id: 4, name: 'Owner two habit', level: 9, xp: 1 })] }));
    fixture.detectChanges();
    expect(text()).toContain('Owner two habit · Level 9 · 1 XP');
    expect(text()).toContain('Level 9 · 1 / 100 XP');

    user$.next({ id: 3 });
    fixture.detectChanges();
    expect(loads[2].observed).toBeTrue();
    fixture.destroy();
    expect(loads[2].observed).toBeFalse();
  });

  it('shows thresholds, archived history links, and no private building values', async () => {
    const { user$, loads, api } = setup();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'town/hall', component: HallRoomComponent }]),
        { provide: SessionService, useValue: { user$ } },
        { provide: TownApiService, useValue: api },
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/town/hall?object=archive&scale=1.5&x=-12&y=-4');
    const host = harness.routeNativeElement as HTMLElement;
    loads[0].next(town());
    harness.detectChanges();

    expect(host.querySelector('.stage')?.getAttribute('style')).toContain('scale(1.5)');
    expect(host.querySelector('[data-scene-object="progress"]')?.classList.contains('faded')).toBeFalse();
    expect(host.textContent).toContain(`capped at ${DAILY_CAP.library} Library XP`);
    expect(host.textContent).toContain(`capped at ${DAILY_CAP.inn} Inn XP`);
    expect(host.textContent).toContain(`Kept budget weeks: ${TREASURY_WEEKS.join(', ')}`);
    expect(host.textContent).toContain('Level 10 starts at 5000 XP');
    expect(host.textContent).toContain('Terraria-on-Sea · Level 9 · 1 / 100 XP');
    expect(host.textContent).toContain('Read 20 pages · Level 4 · 3 XP');
    expect(host.textContent).toContain('Walk 30 minutes · Level 2 · 40 XP');
    expect(host.textContent).toContain('Archived');
    expect(host.textContent).not.toContain('7777');
    expect(host.textContent).not.toMatch(/\$\d|kg|mmHg/);
    const edit = host.querySelector<HTMLAnchorElement>('[data-edit="15"]');
    const history = host.querySelector<HTMLAnchorElement>('[data-history="8"]');
    expect(edit?.textContent).toContain('Edit Read 20 pages');
    expect(history?.textContent).toContain('History for Walk 30 minutes');
    expect(edit?.getAttribute('href')).toContain('edit=15');
    expect(history?.getAttribute('href')).toContain('history=8');

    history?.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    const dialog = host.querySelector('app-history-dialog');
    expect(dialog?.textContent).toContain('Walk 30 minutes');
    expect(dialog?.textContent).not.toContain('7777');
    expect(api.getTown).toHaveBeenCalled();
    expect(Object.keys(api)).not.toContain('loadFinanceBudgetKept');
  });

  it('keeps a typed habit name when save or reload fails, and clears it for a new owner', async () => {
    const { user$, loads, api } = setup();
    const patch = new Subject<Habit>();
    api.patchHabit.and.returnValue(patch);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'town/hall', component: HallRoomComponent }]),
        { provide: SessionService, useValue: { user$ } },
        { provide: TownApiService, useValue: api },
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/town/hall?edit=15');
    const host = harness.routeNativeElement as HTMLElement;
    loads[0].next(town());
    harness.detectChanges();
    const input = () => host.querySelector<HTMLInputElement>('#habit-name');
    expect(input()?.value).toBe('Read 20 pages');
    input()!.value = 'Read 21 pages';
    input()!.dispatchEvent(new Event('input'));
    harness.detectChanges();
    host.querySelector<HTMLButtonElement>('app-habit-dialog button[type="submit"], app-habit-dialog button')
      ?.click();
    const save = [...host.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Save') as HTMLButtonElement;
    save.click();
    harness.detectChanges();
    patch.error({ error: { message: 'Town is unavailable right now.' } });
    harness.detectChanges();
    expect(input()?.value).toBe('Read 21 pages');
    expect(host.textContent).toContain('Town is unavailable right now.');

    const reload = [...host.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Reload Hall') as HTMLButtonElement;
    reload.click();
    harness.detectChanges();
    loads[1].error(new Error('unavailable'));
    harness.detectChanges();
    expect(input()?.value).toBe('Read 21 pages');
    expect(host.textContent).toContain('Read 20 pages · Level 4 · 3 XP');
    expect(host.textContent).toContain('Town is unavailable right now.');

    user$.next({ id: 2 });
    harness.detectChanges();
    expect(host.querySelector('#habit-name')).toBeNull();
    expect(host.textContent).not.toContain('Read 21 pages');
    loads[0].next(town({ habits: [habit({ name: 'Secret balance 41829', xp: 41829 })] }));
    harness.detectChanges();
    expect(host.textContent).not.toContain('Secret balance 41829');
    expect(host.textContent).not.toContain('41829');
  });

  it('selects only a tap and drops an unfinished drag when the owner changes', () => {
    const { user$, loads, api } = setup();
    TestBed.configureTestingModule({
      imports: [HallRoomComponent],
      providers: [provideRouter([]), { provide: SessionService, useValue: { user$ } }, { provide: TownApiService, useValue: api }],
    });
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    const fixture = TestBed.createComponent(HallRoomComponent);
    const host = fixture.nativeElement as HTMLElement;
    host.style.width = '640px';
    fixture.detectChanges();
    for (const image of host.querySelectorAll('img')) image.dispatchEvent(new Event('load'));
    fixture.detectChanges();
    const viewport = host.querySelector('.viewport') as HTMLElement;
    const rect = viewport.getBoundingClientRect();
    const progress = hallObjects.find(object => object.asset.id === 'progress')!;
    const rules = hallObjects.find(object => object.asset.id === 'rules')!;
    const progressRect = roomRect(progress);
    const rulesRect = roomRect(rules);
    const shared = {
      x: (Math.max(progressRect.left, rulesRect.left) + Math.min(progressRect.left + progressRect.width, rulesRect.left + rulesRect.width)) / 2,
      y: (Math.max(progressRect.top, rulesRect.top) + Math.min(progressRect.top + progressRect.height, rulesRect.top + rulesRect.height)) / 2,
    };
    const screen = roomToScreen(shared, REST_CAMERA, { width: rect.width, height: rect.height }, hallRoom.bounds);
    const pointer = (type: string, x: number, y: number) => viewport.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 7, clientX: x, clientY: y, button: 0,
    }));
    pointer('pointerdown', rect.left + screen.x, rect.top + screen.y);
    pointer('pointerup', rect.left + screen.x, rect.top + screen.y);
    expect(navigate).toHaveBeenCalledWith([], jasmine.objectContaining({
      queryParams: jasmine.objectContaining({ object: 'progress' }), replaceUrl: true, scroll: 'manual',
    }));
    navigate.calls.reset();
    const zoomed = (host.querySelector('.stage') as HTMLElement).style.transform;
    const movedX = rect.left + screen.x - 36;
    const movedY = rect.top + screen.y - 20;
    pointer('pointerdown', rect.left + screen.x, rect.top + screen.y);
    pointer('pointermove', movedX, movedY);
    user$.next({ id: 2 });
    fixture.detectChanges();
    expect((host.querySelector('.stage') as HTMLElement).style.transform).toBe(zoomed);
    pointer('pointerup', movedX, movedY);
    expect(navigate).not.toHaveBeenCalled();
    loads[0].next(town({ habits: [habit({ name: 'Secret balance 41829' })] }));
    fixture.detectChanges();
    expect(host.textContent).not.toContain('Secret balance 41829');
  });
});
