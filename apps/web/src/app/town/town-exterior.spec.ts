import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { SessionService } from '../platform/session.service';
import { sceneAudio } from './scene-audio';
import { scenePreferenceKey } from '../platform/scene-appearance';
import { SceneAppearanceService } from '../platform/scene-appearance.service';
import { frontObject, REST_CAMERA, type RoomRect } from './library-room.scene';
import { LOT_UNLOCK_LV } from './town.constants';
import { TownExteriorComponent } from './town-exterior.component';
import {
  DISTRICTS,
  EXTERIOR_ART,
  EXTERIOR_ROOM,
  exteriorBuildings,
  frameDistrict,
  inspectedPlace,
  type ExteriorBuilding,
  type ExteriorHealth,
} from './town-exterior';
import { formatTownDay } from './town-text';
import type { Habit, TownResponse } from './town.types';

function habit(name: string): Habit {
  return {
    id: 4,
    name,
    slot: 0,
    building_style: 'forge',
    cadence: { per_week: 7, kind: 'daily', pending: null },
    created_on: '2026-10-05',
    archived_on: null,
    stage: 2,
    xp: 10,
    level: 2,
    level_xp_start: 0,
    next_level_xp: 50,
    streak: {
      unit: 'days', current: 3, best: 3, best_days: 3, best_weeks: 0,
      rest_day_available: false, rest_used_on: null,
    },
    week: { done: 1, target: 7 },
    checked_today: false,
    checked_yesterday: false,
    can_check_yesterday: false,
    last7: ['none', 'none', 'none', 'none', 'none', 'none', 'none'],
  };
}

function town(kind: 'unfounded' | 'founded' | 'rich'): TownResponse {
  const building = {
    xp: 0, level: 1, stage: 1 as const, level_xp_start: 0, next_level_xp: 50, today_xp: 0, today_cap: 10, source: 'ok' as const,
  };
  const level = kind === 'rich' ? 9 : kind === 'founded' ? 3 : 1;
  const lots = LOT_UNLOCK_LV.map((unlock_level, slot) => {
    if (kind === 'rich' && slot === 0) return { slot, unlock_level, state: 'occupied' as const, habit_id: 4 };
    const locked = unlock_level > level;
    return { slot, unlock_level, state: locked ? 'locked' as const : 'empty' as const, habit_id: null };
  });
  return {
    town: {
      name: 'Terraria-on-Sea',
      founded_on: kind === 'unfounded' ? null : '2026-10-05',
      today: '2026-10-29',
      tz: 'America/Los_Angeles',
      xp: kind === 'rich' ? 5000 : 0,
      level,
      level_xp_start: 0,
      next_level_xp: kind === 'rich' ? null : 100,
    },
    buildings: { library: building, inn: { ...building, today_cap: 15 } },
    lots,
    habits: kind === 'rich' ? [habit('Read 20 pages')] : [],
    archived: [],
    today: { done: 0, total: kind === 'rich' ? 1 : 0 },
    constants_version: 1,
  };
}

function faces(kind: 'unfounded' | 'founded' | 'rich', health: ExteriorHealth = { state: 'locked' }): readonly ExteriorBuilding[] {
  return exteriorBuildings({
    data: town(kind),
    treasury: { status: 'locked' },
    vaultPresent: false,
    health,
  });
}

function byId(items: readonly ExteriorBuilding[], id: string): ExteriorBuilding {
  const found = items.find(item => item.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
}

function overlaps(a: RoomRect, b: RoomRect): boolean {
  return a.left < b.left + b.width && b.left < a.left + a.width
    && a.top < b.top + b.height && b.top < a.top + a.height;
}

function placed(building: ExteriorBuilding) {
  return {
    building,
    x: building.rect.left,
    y: building.rect.top,
    asset: {
      id: building.id,
      layer: building.layer,
      bounds: { width: building.rect.width, height: building.rect.height },
      anchor: { x: 0, y: 0 },
    },
  };
}

describe('Town exterior model', () => {
  it('keeps useful entrances in an unfounded town and a rich one', () => {
    expect(EXTERIOR_ART.attribution).toContain('Terraria-on-Sea');
    for (const kind of ['unfounded', 'rich'] as const) {
      const items = faces(kind);
      expect(items.map(item => item.district)).toEqual(jasmine.arrayContaining([...DISTRICTS.map(district => district.id)]));
      expect(byId(items, 'library').href).toBe('/town/library');
      expect(byId(items, 'inn').href).toBe('/travel');
      expect(byId(items, 'clinic').href).toBe('/town/clinic');
      expect(byId(items, 'gym').href).toBe('/town/gym');
      expect(byId(items, 'theater').href).toBe('/media/library?kind=movie');
      expect(byId(items, 'music').href).toBe('/media/library?kind=artist');
      expect(byId(items, 'arcade').href).toBe('/media/library?kind=game');
      expect(byId(items, 'treasury').href).toContain('/finance/');
      expect(byId(items, 'clinic').control).toBe('link');
      expect(byId(items, 'home').control).toBe('select');
      expect(byId(items, 'hall').control).toBe('link');
      expect(byId(items, 'hall').href).toBe('/town/hall');
    }
    expect(byId(faces('unfounded'), 'slot-0').control).toBe('habit');
    expect(byId(faces('unfounded'), 'slot-0').name).toBe('Empty lot');
    expect(byId(faces('unfounded'), 'slot-3').control).toBe('locked');
    expect(byId(faces('rich'), 'slot-0').name).toBe('Read 20 pages');
    expect(byId(faces('rich'), 'library').control).toBe('link');
  });

  it('renders Health stages without locked digits and keeps both routes', () => {
    const locked = byId(faces('founded'), 'clinic');
    expect(locked.label).toBe('Health locked');
    expect(`${locked.name} ${locked.label}`).not.toMatch(/\d/);
    expect(locked.sprite).toBe('/town/clinic-locked.svg');
    expect(byId(faces('founded'), 'gym').sprite).toBe('/town/gym-locked.svg');

    const ready = faces('founded', { state: 'ready', clinic: 2, gym: 1 });
    expect(byId(ready, 'clinic').label).toBe('Open');
    expect(byId(ready, 'clinic').sprite).toBe('/town/clinic-2.svg');
    expect(byId(ready, 'gym').sprite).toBe('/town/gym-1.svg');
    expect(byId(ready, 'clinic').href).toBe('/town/clinic');
    expect(`${byId(ready, 'clinic').name} ${byId(ready, 'clinic').label}`).not.toMatch(/\d/);

    const unavailable = faces('founded', { state: 'unavailable' });
    expect(byId(unavailable, 'clinic').label).toBe('Unavailable');
    expect(byId(unavailable, 'clinic').sprite).toBe('/town/clinic-1.svg');
    expect(byId(unavailable, 'gym').sprite).toBe('/town/gym-1.svg');
    expect(byId(unavailable, 'clinic').href).toBe('/town/clinic');
    expect(byId(unavailable, 'gym').href).toBe('/town/gym');
    expect(byId(unavailable, 'clinic').label).not.toMatch(/Lv|\d/);
  });

  it('places every building inside the room without overlap', () => {
    const items = faces('rich');
    expect(items.length).toBe(16);
    for (const item of items) {
      expect(item.rect.left).toBeGreaterThanOrEqual(0);
      expect(item.rect.top).toBeGreaterThanOrEqual(0);
      expect(item.rect.left + item.rect.width).toBeLessThanOrEqual(EXTERIOR_ROOM.width);
      expect(item.rect.top + item.rect.height).toBeLessThanOrEqual(EXTERIOR_ROOM.height);
      expect(item.frame.left).toBeCloseTo(100 * item.rect.left / EXTERIOR_ROOM.width, 5);
      expect(item.frame.top).toBeCloseTo(100 * item.rect.top / EXTERIOR_ROOM.height, 5);
    }
    for (let index = 0; index < items.length; index += 1) {
      for (let other = index + 1; other < items.length; other += 1) {
        expect(overlaps(items[index].rect, items[other].rect)).withContext(`${items[index].id} ${items[other].id}`).toBeFalse();
      }
    }
  });

  it('picks the front building at its center and frames a district with the shared camera', () => {
    const items = faces('founded').map(placed);
    const library = items.find(item => item.building.id === 'library');
    if (!library) throw new Error('missing library');
    const center = {
      x: library.building.rect.left + library.building.rect.width / 2,
      y: library.building.rect.top + library.building.rect.height / 2,
    };
    expect(frontObject(items, center)?.building.id).toBe('library');
    expect(frameDistrict(DISTRICTS[0].focus, { width: 0, height: 0 })).toEqual(REST_CAMERA);
    const framed = frameDistrict(DISTRICTS.find(item => item.id === 'harbor')!.focus, { width: 400, height: 280 });
    expect(framed.scale).toBe(2.5);
    expect(framed.x).toBeLessThan(0);
    expect(framed.y).toBe(0);
  });

  it('describes locked, empty, occupied, archived, and missing places', () => {
    const founded = town('founded');
    const rich = town('rich');
    rich.archived = [{
      id: 9, name: 'Old walk', xp: 4, level: 1, best_days: 2, best_weeks: 4,
      created_on: '2026-10-01', archived_on: '2026-10-20',
    }];
    expect(inspectedPlace(founded, null)).toBeNull();
    expect(inspectedPlace(founded, 'slot-5')).toEqual(jasmine.objectContaining({
      state: 'locked', action: null, slot: 5, detail: 'Unlocks at level 9. Nothing can be built here yet.',
    }));
    expect(inspectedPlace(founded, 'slot-0')).toEqual(jasmine.objectContaining({
      state: 'empty', action: 'Build here', name: 'Empty lot', slot: 0, habitId: null,
    }));
    expect(inspectedPlace(rich, 'slot-0')).toEqual(jasmine.objectContaining({
      state: 'occupied', action: 'Edit habit', name: 'Read 20 pages', habitId: 4,
    }));
    expect(inspectedPlace(rich, 'slot-0')?.detail).toContain('3-day streak');
    const archived = inspectedPlace(rich, 'archived-9');
    expect(archived).toEqual(jasmine.objectContaining({ state: 'archived', action: 'Open history', habitId: 9 }));
    expect(archived?.detail).toContain(formatTownDay('2026-10-20'));
    expect(archived?.detail).toContain('4 weeks');
    expect(inspectedPlace(rich, 'archived-99')?.state).toBe('missing');
    expect(inspectedPlace(rich, 'home')?.detail).toBe('That place is not on this town.');
    expect(inspectedPlace(rich, 'slot-40')?.state).toBe('missing');
  });
});

describe('Town exterior scene', () => {
  let user: BehaviorSubject<{ id: number } | null>;

  beforeEach(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('town.scene.v1.')) localStorage.removeItem(key);
    }
    user = new BehaviorSubject<{ id: number } | null>({ id: 7 });
    TestBed.configureTestingModule({
      imports: [TownExteriorComponent],
      providers: [
        provideRouter([]),
        { provide: SessionService, useValue: { user$: user } },
      ],
    });
  });

  function motion(reduce: boolean): void {
    spyOn(window, 'matchMedia').and.callFake((query: string) => ({
      matches: reduce && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener(): void { /* test double */ },
      removeEventListener(): void { /* test double */ },
      addListener(): void { /* test double */ },
      removeListener(): void { /* test double */ },
      dispatchEvent(): boolean { return false; },
      onchange: null,
    } as MediaQueryList));
  }

  function render(data: TownResponse, extra: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(TownExteriorComponent);
    fixture.nativeElement.style.width = '420px';
    fixture.componentRef.setInput('data', data);
    fixture.componentRef.setInput('treasury', { status: 'locked' });
    for (const [key, value] of Object.entries(extra)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    const viewport = fixture.nativeElement.querySelector('.viewport') as HTMLElement;
    viewport.style.width = '400px';
    viewport.style.height = '280px';
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, viewport };
  }

  function control(el: HTMLElement, name: string): HTMLButtonElement {
    const found = [...el.querySelectorAll('button')].find(item => item.textContent?.trim() === name);
    if (!(found instanceof HTMLButtonElement)) throw new Error(`missing ${name}`);
    return found;
  }

  function stage(el: HTMLElement): string {
    return (el.querySelector('.stage') as HTMLElement).style.transform;
  }

  function at(viewport: HTMLElement, building: ExteriorBuilding): { x: number; y: number } {
    const rect = viewport.getBoundingClientRect();
    const centerX = building.rect.left + building.rect.width / 2;
    const centerY = building.rect.top + building.rect.height / 2;
    return {
      x: rect.left + centerX / EXTERIOR_ROOM.width * rect.width,
      y: rect.top + centerY / EXTERIOR_ROOM.height * rect.height,
    };
  }

  function pointer(type: string, x: number, y: number): PointerEvent {
    return new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 1 });
  }

  it('shows six districts and the Health faces in the building list', () => {
    const { fixture, el } = render(town('unfounded'));
    for (const label of ['Civic', 'Residential', 'Harbor', 'Culture', 'Wellness', 'Garden']) {
      const district = control(el, label);
      expect(district.getAttribute('aria-pressed')).toBe('false');
      expect(district.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    }
    const clinic = el.querySelector('[data-building="clinic"]') as HTMLAnchorElement;
    expect(clinic.textContent).toContain('Health locked');
    expect(clinic.textContent).not.toMatch(/\d/);
    expect(clinic.querySelector('img')?.getAttribute('src')).toBe('/town/clinic-locked.svg');
    expect(clinic.getAttribute('href')).toBe('/town/clinic');
    fixture.componentRef.setInput('health', { state: 'ready', clinic: 2, gym: 1 });
    fixture.detectChanges();
    expect(clinic.textContent).toContain('Open');
    expect(clinic.querySelector('img')?.getAttribute('src')).toBe('/town/clinic-2.svg');
    expect((el.querySelector('[data-building="gym"]') as HTMLAnchorElement).getAttribute('href')).toBe('/town/gym');
    fixture.componentRef.setInput('health', { state: 'unavailable' });
    fixture.detectChanges();
    expect(clinic.textContent).toContain('Unavailable');
    expect(clinic.querySelector('img')?.getAttribute('src')).toBe('/town/clinic-1.svg');
    expect(clinic.getAttribute('href')).toBe('/town/clinic');
    expect(clinic.textContent).not.toMatch(/\d/);
  });

  it('opens the front building on a tap, and a drag or cancel does not', () => {
    const router = TestBed.inject(Router);
    const navigate = spyOn(router, 'navigate').and.resolveTo(true);
    const { fixture, el, viewport } = render(town('founded'));
    expect(viewport.getBoundingClientRect().width).toBeGreaterThan(0);
    const opened: unknown[] = [];
    fixture.componentInstance.openHabit.subscribe(event => opened.push(event));
    const items = faces('founded');
    const library = at(viewport, byId(items, 'library'));
    viewport.dispatchEvent(pointer('pointerdown', library.x, library.y));
    viewport.dispatchEvent(pointer('pointerup', library.x, library.y));
    expect(navigate).toHaveBeenCalledWith(['/town/library'], { queryParams: undefined });
    expect(opened).toEqual([]);

    const locked = at(viewport, byId(items, 'slot-5'));
    viewport.dispatchEvent(pointer('pointerdown', locked.x, locked.y));
    viewport.dispatchEvent(pointer('pointerup', locked.x, locked.y));
    fixture.detectChanges();
    expect(opened).toEqual([]);
    expect(navigate).toHaveBeenCalledWith([], jasmine.objectContaining({
      queryParams: { inspect: 'slot-5' }, queryParamsHandling: 'merge', replaceUrl: true,
    }));
    expect(el.querySelector('[data-inspector]')?.getAttribute('data-inspector')).toBe('locked');
    expect(el.textContent).toContain('Nothing can be built here yet.');
    expect([...el.querySelectorAll('button')].some(button => button.textContent?.trim() === 'Build here')).toBeFalse();
    (el.querySelector('[data-building="slot-0"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(opened).toEqual([]);
    expect(el.querySelector('[data-inspector]')?.getAttribute('data-inspector')).toBe('empty');
    control(el, 'Build here').click();
    expect(opened).toEqual([{ slot: 0, habitId: null }]);

    navigate.calls.reset();
    const origin = stage(el);
    control(el, 'Zoom in').click();
    fixture.detectChanges();
    const zoomed = stage(el);
    expect(zoomed).not.toBe(origin);
    const start = viewport.getBoundingClientRect();
    viewport.dispatchEvent(pointer('pointerdown', start.left + 80, start.top + 80));
    viewport.dispatchEvent(pointer('pointermove', start.left + 120, start.top + 110));
    fixture.detectChanges();
    expect(stage(el)).not.toBe(zoomed);
    viewport.dispatchEvent(pointer('pointerup', start.left + 120, start.top + 110));
    expect(navigate).not.toHaveBeenCalled();
    expect(opened).toEqual([{ slot: 0, habitId: null }]);

    const dragged = stage(el);
    const again = viewport.getBoundingClientRect();
    viewport.dispatchEvent(pointer('pointerdown', again.left + 80, again.top + 80));
    viewport.dispatchEvent(pointer('pointermove', again.left + 130, again.top + 80));
    viewport.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 }));
    fixture.detectChanges();
    expect(stage(el)).toBe(dragged);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('keeps a committed view when town data changes and drops only an open drag on owner change', () => {
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    const { fixture, el, viewport } = render(town('founded'));
    control(el, 'Zoom in').click();
    fixture.detectChanges();
    const zoomed = stage(el);
    fixture.componentRef.setInput('data', town('rich'));
    fixture.componentRef.setInput('health', { state: 'ready', clinic: 3, gym: 3 });
    fixture.detectChanges();
    expect(stage(el)).toBe(zoomed);

    user.next({ id: 8 });
    fixture.detectChanges();
    expect(stage(el)).toBe(zoomed);

    const start = viewport.getBoundingClientRect();
    viewport.dispatchEvent(pointer('pointerdown', start.left + 40, start.top + 40));
    viewport.dispatchEvent(pointer('pointermove', start.left + 90, start.top + 40));
    fixture.detectChanges();
    const mid = stage(el);
    expect(mid).not.toBe(zoomed);
    user.next({ id: 9 });
    fixture.detectChanges();
    expect(stage(el)).toBe(zoomed);
    viewport.dispatchEvent(pointer('pointerup', start.left + 90, start.top + 40));
    expect(router.navigate).not.toHaveBeenCalled();
    expect(stage(el)).toBe(zoomed);
  });

  it('reads a locked lot from the town URL and clears it when the owner changes', () => {
    const query = new BehaviorSubject(convertToParamMap({ inspect: 'slot-3' }));
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { queryParamMap: query, snapshot: { queryParamMap: query.value } },
    });
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.callFake((_commands: unknown[], extras?: { queryParams?: { inspect?: string | null } }) => {
      const inspect = extras?.queryParams?.inspect;
      query.next(convertToParamMap(inspect ? { inspect } : {}));
      return Promise.resolve(true);
    });
    const { fixture, el } = render(town('founded'));
    const slot = el.querySelector('[data-building="slot-3"]') as HTMLButtonElement;
    expect(slot.getAttribute('aria-current')).toBe('true');
    expect(el.querySelector('[data-inspector]')?.getAttribute('data-inspector')).toBe('locked');
    expect(el.textContent).toContain('Unlocks at level 5');
    expect([...el.querySelectorAll('button')].some(button => button.textContent?.trim() === 'Build here')).toBeFalse();
    user.next({ id: 8 });
    fixture.detectChanges();
    expect(navigate).toHaveBeenCalledWith([], jasmine.objectContaining({
      queryParams: { inspect: null }, replaceUrl: true,
    }));
    expect(el.querySelector('[data-building="slot-3"]')?.getAttribute('aria-current')).toBeNull();
    expect(el.querySelector('[data-inspector]')?.getAttribute('data-inspector')).toBe('empty');
  });

  it('opens history for an archived habit and does not build a locked lot', () => {
    const { fixture, el } = render(town('founded'));
    const opened: unknown[] = [];
    const history: unknown[] = [];
    fixture.componentInstance.openHabit.subscribe(event => opened.push(event));
    fixture.componentInstance.openHistory.subscribe(() => history.push(true));
    const data = town('founded');
    data.archived = [{
      id: 11, name: 'Old walk', xp: 4, level: 1, best_days: 2, best_weeks: 0,
      created_on: '2026-10-01', archived_on: '2026-10-20',
    }];
    fixture.componentRef.setInput('data', data);
    fixture.detectChanges();
    const archived = el.querySelector('[data-archived="11"]') as HTMLButtonElement;
    archived.focus();
    archived.click();
    fixture.detectChanges();
    expect(el.querySelector('[data-inspector]')?.getAttribute('data-inspector')).toBe('archived');
    expect(document.activeElement).toBe(archived);
    control(el, 'Open history').click();
    expect(history).toEqual([true]);
    expect(opened).toEqual([]);
    (el.querySelector('[data-building="slot-5"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('[data-inspector]')?.getAttribute('data-inspector')).toBe('locked');
    expect([...el.querySelectorAll('button')].some(button => button.textContent?.trim() === 'Build here')).toBeFalse();
  });

  it('shows the outgoing sprite when motion is allowed', () => {
    motion(false);
    const shown = render(town('founded'), { swaps: { library: 1 } });
    expect(shown.el.querySelector('.old')?.getAttribute('src')).toContain('/town/library-1.svg');
  });

  it('hides the outgoing sprite when motion is reduced', () => {
    motion(true);
    const shown = render(town('founded'), { swaps: { library: 1 } });
    expect(shown.el.querySelector('.old')).toBeNull();
    expect(shown.el.querySelector('[data-scene-object="library"] img')?.getAttribute('src')).toContain('/town/library-');
  });

  it('resolves automatic seasons across a month boundary and drops a preview on owner change', () => {
    localStorage.setItem(scenePreferenceKey(8), JSON.stringify({ season: 'spring', sound: true }));
    const { fixture, el } = render(town('founded'));
    const service = TestBed.inject(SceneAppearanceService);
    service.at.set(new Date(2026, 4, 31, 17));
    fixture.detectChanges();
    const viewport = el.querySelector('.viewport') as HTMLElement;
    expect(viewport.getAttribute('data-season')).toBe('spring');
    expect(viewport.getAttribute('data-day')).toBe('day');
    expect(viewport.getAttribute('data-weather')).toBe('rain');
    expect(el.querySelector('[data-scene-presentation]')?.textContent).toContain('Blossoms along the garden path');
    expect(el.textContent).toContain('Presentation only');
    service.at.set(new Date(2026, 5, 1, 5));
    fixture.detectChanges();
    expect(viewport.getAttribute('data-season')).toBe('summer');
    expect(viewport.getAttribute('data-day')).toBe('night');
    expect(localStorage.getItem(scenePreferenceKey(7))).toBeNull();
    service.preview({ season: 'winter' });
    fixture.detectChanges();
    expect(viewport.getAttribute('data-season')).toBe('winter');
    expect(el.textContent).toContain('Unsaved preview');
    user.next({ id: 8 });
    fixture.detectChanges();
    expect(viewport.getAttribute('data-season')).toBe('spring');
    expect(el.textContent).not.toContain('Unsaved preview');
    expect(el.textContent).toContain('Town sound is on');
    expect(JSON.parse(localStorage.getItem(scenePreferenceKey(8))!).season).toBe('spring');
  });
});

describe('Town scene ambience work', () => {
  let user: BehaviorSubject<{ id: number } | null>;
  let originalObserver: typeof IntersectionObserver;

  class FakeObserver {
    static last: FakeObserver | null = null;
    disconnected = false;
    constructor(private readonly callback: IntersectionObserverCallback) {
      FakeObserver.last = this;
    }
    observe(): void { /* the test emits entries */ }
    unobserve(): void { /* unused */ }
    disconnect(): void { this.disconnected = true; }
    takeRecords(): IntersectionObserverEntry[] { return []; }
    emit(onScreen: boolean): void {
      this.callback([{
        isIntersecting: onScreen,
        intersectionRatio: onScreen ? 1 : 0,
      } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
    }
  }

  beforeEach(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('town.scene.v1.')) localStorage.removeItem(key);
    }
    originalObserver = window.IntersectionObserver;
    window.IntersectionObserver = FakeObserver as unknown as typeof IntersectionObserver;
    FakeObserver.last = null;
    user = new BehaviorSubject<{ id: number } | null>({ id: 7 });
    TestBed.configureTestingModule({
      imports: [TownExteriorComponent],
      providers: [
        provideRouter([]),
        { provide: SessionService, useValue: { user$: user } },
      ],
    });
  });

  afterEach(() => {
    window.IntersectionObserver = originalObserver;
  });

  function motion(reduce: boolean): void {
    spyOn(window, 'matchMedia').and.callFake((query: string) => ({
      matches: reduce && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener(): void { /* test double */ },
      removeEventListener(): void { /* test double */ },
      addListener(): void { /* test double */ },
      removeListener(): void { /* test double */ },
      dispatchEvent(): boolean { return false; },
      onchange: null,
    } as MediaQueryList));
  }

  async function shown(reduce: boolean) {
    motion(reduce);
    const fixture = TestBed.createComponent(TownExteriorComponent);
    fixture.componentRef.setInput('data', town('founded'));
    fixture.componentRef.setInput('treasury', { status: 'locked' });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function playButton(el: HTMLElement): HTMLButtonElement {
    const found = [...el.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Play Town sound');
    if (!(found instanceof HTMLButtonElement)) throw new Error('missing play');
    return found;
  }

  it('does no live animation or audio while motion is reduced', async () => {
    const play = spyOn(sceneAudio, 'play').and.resolveTo();
    localStorage.setItem(scenePreferenceKey(7), JSON.stringify({ season: 'winter', sound: true }));
    const fixture = await shown(true);
    const el = fixture.nativeElement as HTMLElement;
    FakeObserver.last?.emit(true);
    fixture.detectChanges();
    const viewport = el.querySelector('.viewport') as HTMLElement;
    expect(viewport.getAttribute('data-ambience')).toBe('still');
    expect(getComputedStyle(el.querySelector('.idle-mark')!).animationName).toBe('none');
    playButton(el).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(play).not.toHaveBeenCalled();
    expect(el.textContent).toContain('stays quiet');
    fixture.destroy();
    expect(FakeObserver.last?.disconnected).toBeTrue();
  });

  it('animates only while the scene is on screen and plays one tone', async () => {
    const play = spyOn(sceneAudio, 'play').and.resolveTo();
    localStorage.setItem(scenePreferenceKey(7), JSON.stringify({ season: 'winter', sound: true }));
    const fixture = await shown(false);
    const el = fixture.nativeElement as HTMLElement;
    FakeObserver.last?.emit(false);
    fixture.detectChanges();
    expect(el.querySelector('.viewport')?.getAttribute('data-ambience')).toBe('still');
    FakeObserver.last?.emit(true);
    fixture.detectChanges();
    expect(el.querySelector('.viewport')?.getAttribute('data-ambience')).toBe('live');
    expect(getComputedStyle(el.querySelector('.idle-mark')!).animationName).toContain('scene-idle');
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    fixture.detectChanges();
    expect(el.querySelector('.viewport')?.getAttribute('data-ambience')).toBe('still');
    playButton(el).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(play).not.toHaveBeenCalled();
    expect(el.textContent).toContain('stays quiet');
    Reflect.deleteProperty(document, 'visibilityState');
    document.dispatchEvent(new Event('visibilitychange'));
    FakeObserver.last?.emit(true);
    fixture.detectChanges();
    expect(el.querySelector('.viewport')?.getAttribute('data-ambience')).toBe('live');
    playButton(el).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(play).toHaveBeenCalledTimes(1);
    expect(el.textContent).toContain('Played one Town tone.');
    fixture.destroy();
    expect(FakeObserver.last?.disconnected).toBeTrue();
  });
});
