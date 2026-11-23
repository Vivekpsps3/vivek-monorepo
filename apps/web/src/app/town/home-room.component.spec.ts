import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BehaviorSubject, Subject } from 'rxjs';
import { SessionService } from '../platform/session.service';
import { HomeRoomComponent } from './home-room.component';
import { TownApiService } from './town.api';
import type { Habit, TownResponse } from './town.types';

@Component({ template: '', standalone: true })
class BlankComponent {}

function habit(partial: Partial<Habit> = {}): Habit {
  return {
    id: 4, name: 'Owner two habit', slot: 0, building_style: 'garden',
    cadence: { per_week: 7, kind: 'daily', pending: null },
    created_on: '2026-10-04', archived_on: null, xp: 1, level: 1, stage: 1,
    level_xp_start: 0, next_level_xp: 50,
    streak: { unit: 'days', current: 0, best: 0, best_days: 0, best_weeks: 0, rest_day_available: true, rest_used_on: null },
    week: { done: 0, target: 7 }, checked_today: false, checked_yesterday: false, can_check_yesterday: false, last7: [],
    ...partial,
  };
}

function town(partial: Partial<TownResponse> = {}): TownResponse {
  const building = {
    xp: 0, level: 1, stage: 1 as const, level_xp_start: 0, next_level_xp: 50,
    today_xp: 0, today_cap: 10, source: 'ok' as const,
  };
  return {
    town: {
      name: 'Terraria-on-Sea', founded_on: null, today: '2026-10-29', tz: 'America/Los_Angeles',
      xp: 0, level: 1, level_xp_start: 0, next_level_xp: 50,
    },
    buildings: { library: building, inn: { ...building, today_cap: 15 } },
    lots: [
      { slot: 0, unlock_level: 1, state: 'empty', habit_id: null },
      { slot: 1, unlock_level: 1, state: 'empty', habit_id: null },
      { slot: 2, unlock_level: 3, state: 'locked', habit_id: null },
      { slot: 3, unlock_level: 5, state: 'locked', habit_id: null },
      { slot: 4, unlock_level: 7, state: 'locked', habit_id: null },
      { slot: 5, unlock_level: 9, state: 'locked', habit_id: null },
    ],
    habits: [],
    archived: [],
    today: { done: 0, total: 0 },
    constants_version: 1,
    ...partial,
  };
}

function narrowScreen(matches: boolean): void {
  spyOn(window, 'matchMedia').and.callFake((query: string) => ({
    matches: matches && query.includes('max-width'),
    media: query,
    addEventListener(): void { /* test double */ },
    removeEventListener(): void { /* test double */ },
    addListener(): void { /* test double */ },
    removeListener(): void { /* test double */ },
    dispatchEvent(): boolean { return false; },
    onchange: null,
  } as MediaQueryList));
}

function setup(userId: number | null = 1) {
  const user$ = new BehaviorSubject<{ id: number } | null>(userId == null ? null : { id: userId });
  const loads: Subject<TownResponse>[] = [];
  const getTown = jasmine.createSpy().and.callFake(() => {
    const subject = new Subject<TownResponse>();
    loads.push(subject);
    return subject;
  });
  const checkin = jasmine.createSpy().and.returnValue(new Subject());
  const layouts: Subject<{ room_id: string; revision: number; items: never[] }>[] = [];
  const saves: Subject<{ room_id: string; revision: number; items: never[] }>[] = [];
  const getLayout = jasmine.createSpy().and.callFake(() => {
    const subject = new Subject<{ room_id: string; revision: number; items: never[] }>();
    layouts.push(subject);
    return subject;
  });
  const saveLayout = jasmine.createSpy().and.callFake(() => {
    const subject = new Subject<{ room_id: string; revision: number; items: never[] }>();
    saves.push(subject);
    return subject;
  });
  return { user$, loads, layouts, saves, api: { getTown, checkin, getLayout, saveLayout } };
}

function providers(user$: BehaviorSubject<{ id: number } | null>, api: { getTown: jasmine.Spy; checkin: jasmine.Spy }) {
  return [
    provideRouter([
      { path: 'town/home/:room', component: HomeRoomComponent },
      { path: 'town', component: BlankComponent },
      { path: 'media/library', component: BlankComponent },
    ]),
    { provide: SessionService, useValue: { user$ } },
    { provide: TownApiService, useValue: api },
  ];
}

describe('Home room ownership', () => {
  it('ignores a held town on owner change and on destruction', async () => {
    const { user$, loads, api } = setup();
    TestBed.configureTestingModule({ providers: providers(user$, api) });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/town/home/courtyard');
    const text = () => (harness.routeNativeElement as HTMLElement).textContent ?? '';
    harness.detectChanges();
    expect(text()).toContain('Loading garden lots');
    expect(loads[0].observed).toBeTrue();

    user$.next({ id: 2 });
    harness.detectChanges();
    expect(loads[0].observed).toBeFalse();
    loads[0].next(town({
      habits: [habit({ id: 9, name: 'Secret balance 41829' })],
      lots: [{ slot: 0, unlock_level: 1, state: 'occupied', habit_id: 9 }],
    }));
    harness.detectChanges();
    expect(text()).not.toContain('Secret balance 41829');
    expect(text()).toContain('Loading garden lots');

    loads[1].next(town({
      habits: [habit({ id: 4, name: 'Owner two habit' })],
      lots: [{ slot: 0, unlock_level: 1, state: 'occupied', habit_id: 4 }],
    }));
    harness.detectChanges();
    expect(text()).toContain('Owner two habit');
    expect(text()).not.toContain('Secret balance 41829');

    user$.next({ id: 3 });
    harness.detectChanges();
    expect(loads[2].observed).toBeTrue();
    harness.fixture.destroy();
    expect(loads[2].observed).toBeFalse();
  });

  it('keeps a desk note through a town failure and room change, then clears it on lock', async () => {
    const { user$, loads, api } = setup();
    TestBed.configureTestingModule({ providers: providers(user$, api) });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/town/home/study?object=study-desk');
    const host = () => harness.routeNativeElement as HTMLElement;
    harness.detectChanges();
    const field = () => host().querySelector<HTMLTextAreaElement>('#home-note');
    expect(field()?.disabled).toBeFalse();
    field()!.value = `${'Harbor draft stays. '.repeat(40)}tail`;
    field()!.dispatchEvent(new Event('input'));
    harness.detectChanges();
    expect(field()!.value.length).toBe(500);
    expect(TestBed.inject(Router).url).not.toContain('Harbor');
    expect(TestBed.inject(Router).url).not.toContain('note=');

    loads[0].error(new Error('unavailable'));
    harness.detectChanges();
    expect(field()!.value.length).toBe(500);
    host().querySelector('img.room')?.dispatchEvent(new Event('error'));
    harness.detectChanges();
    expect(host().textContent).toContain('Some room artwork is unavailable');
    expect(field()!.value.length).toBe(500);

    await harness.navigateByUrl('/town/home/courtyard');
    harness.detectChanges();
    expect(host().textContent).toContain('Town lots are unavailable right now.');
    expect(host().textContent).not.toContain('Harbor draft');
    const retry = [...host().querySelectorAll('button')].find(button => button.textContent?.trim() === 'Retry lots') as HTMLButtonElement;
    retry.click();
    harness.detectChanges();
    loads[1].error(new Error('unavailable'));
    harness.detectChanges();
    expect(host().textContent).toContain('Town lots are unavailable right now.');

    await harness.navigateByUrl('/town/home/study?object=study-desk');
    harness.detectChanges();
    expect(field()!.value.length).toBe(500);
    expect(field()!.value.startsWith('Harbor draft stays.')).toBeTrue();

    user$.next(null);
    harness.detectChanges();
    expect(field()!.value).toBe('');
    expect(field()!.disabled).toBeTrue();
    user$.next({ id: 1 });
    harness.detectChanges();
    expect(field()!.value).toBe('');
    expect(field()!.disabled).toBeFalse();
    loads[2].next(town({ habits: [habit({ name: 'Secret balance 41829' })] }));
    harness.detectChanges();
    expect(field()!.value).toBe('');
    expect(host().textContent).not.toContain('Secret balance 41829');
  });

  it('waters the planter without another town load or a habit check-in', async () => {
    const { user$, loads, api } = setup();
    TestBed.configureTestingModule({ providers: providers(user$, api) });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/town/home/courtyard?object=courtyard-planter');
    const host = harness.routeNativeElement as HTMLElement;
    loads[0].next(town());
    harness.detectChanges();
    expect(host.textContent).toContain('Lot 1 is an empty lot');
    expect(host.textContent).toContain('Lot 3 unlocks at level 3');
    expect(host.querySelector('[data-lot="0"]')?.getAttribute('href')).toContain('/town?inspect=slot-0');
    const calls = api.getTown.calls.count();
    const water = [...host.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Water the planter') as HTMLButtonElement;
    water.click();
    harness.detectChanges();
    expect(host.textContent).toContain('Watered for this visit. No habit was checked.');
    expect(api.getTown.calls.count()).toBe(calls);
    expect(api.checkin).not.toHaveBeenCalled();
    water.click();
    harness.detectChanges();
    expect(api.getTown.calls.count()).toBe(calls);
  });

  it('lets Escape close only the phone sheet', async () => {
    narrowScreen(true);
    const { user$, api } = setup();
    TestBed.configureTestingModule({ providers: providers(user$, api) });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/town/home/living?object=living-frame&scale=1.5&x=-12&y=-4');
    const host = harness.routeNativeElement as HTMLElement;
    harness.detectChanges();
    expect(host.querySelector('.stage')?.getAttribute('style')).toContain('scale(1.5)');
    expect(host.querySelector('.room')?.classList.contains('cutaway')).toBeTrue();
    expect(host.querySelector('[data-cutaway="floor-walls"]')?.classList.contains('cutaway')).toBeTrue();
    expect(host.querySelector('.inspector.sheet')).not.toBeNull();
    expect(host.querySelector('[aria-modal]')).toBeNull();
    expect(host.textContent).toContain('Sample coastal print');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).not.toContain('object=');
    expect(TestBed.inject(Router).url).toContain('scale=1.5');
    expect(document.activeElement).toBe(host.querySelector('[data-object="living-frame"]'));
    expect(host.querySelector('.inspector.sheet')).toBeNull();
  });

  it('keeps the desktop inspector open when Escape is pressed', async () => {
    narrowScreen(false);
    const { user$, api } = setup();
    TestBed.configureTestingModule({ providers: providers(user$, api) });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/town/home/bedroom?object=bedroom-record');
    const host = harness.routeNativeElement as HTMLElement;
    harness.detectChanges();
    expect(host.querySelector('.inspector.sheet')).toBeNull();
    expect(host.textContent).toContain('Open saved music');
    const music = [...host.querySelectorAll('a')].find(link => link.textContent?.includes('Open saved music'));
    expect(music?.getAttribute('href')).toContain('/media/library');
    expect(music?.getAttribute('href')).toContain('kind=artist');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toContain('object=bedroom-record');
  });

  it('names the four rooms when the path is not one of them', async () => {
    const { user$, api } = setup();
    TestBed.configureTestingModule({ providers: providers(user$, api) });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/town/home/attic');
    const host = harness.routeNativeElement as HTMLElement;
    harness.detectChanges();
    expect(host.textContent).toContain('That room is not in this home.');
    expect(host.getAttribute('data-home-room')).toBe('missing');
    for (const id of ['living', 'study', 'bedroom', 'courtyard']) {
      expect(host.querySelector(`[data-home-link="${id}"]`)).withContext(id).not.toBeNull();
    }
    expect(host.querySelector('.viewport')).toBeNull();
    expect(api.getLayout).not.toHaveBeenCalled();
  });

  it('keeps a palette through a failed save and drops a late overwrite', async () => {
    const { user$, layouts, saves, api } = setup();
    TestBed.configureTestingModule({ providers: providers(user$, api) });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/town/home/study?object=study-desk');
    const host = () => harness.routeNativeElement as HTMLElement;
    const named = (label: string) => [...host().querySelectorAll('button')].find(button => button.textContent?.trim() === label) as HTMLButtonElement;
    harness.detectChanges();
    const note = host().querySelector<HTMLTextAreaElement>('#home-note');
    note!.value = 'Harbor draft stays';
    note!.dispatchEvent(new Event('input'));
    layouts.at(-1)!.next({ room_id: 'study', revision: 0, items: [] });
    harness.detectChanges();
    expect(host().querySelector('[data-layout-status]')?.textContent).toContain('Nothing is saved yet. Revision 0.');
    named('Palette 2').click();
    harness.detectChanges();
    named('Save layout').click();
    const body = api.saveLayout.calls.mostRecent().args[1] as { expected_revision: number; items: { catalog_id: string }[] };
    expect(body.expected_revision).toBe(0);
    expect(body.items.map(item => item.catalog_id)).toEqual(['desk', 'desk-lamp', 'bookshelf']);
    expect(JSON.stringify(body)).not.toContain('Harbor');
    expect(JSON.stringify(body)).not.toContain('note');
    saves.at(-1)!.error({ status: 503, error: { message: 'The layout service is down.' } });
    harness.detectChanges();
    expect(host().textContent).toContain('The layout was not saved. Your palette choice is still here.');
    expect(host().textContent).not.toContain('layout service');
    expect(named('Palette 2').getAttribute('aria-pressed')).toBe('true');
    expect(note!.value).toBe('Harbor draft stays');

    named('Save layout').click();
    saves.at(-1)!.next({ room_id: 'study', revision: 1, items: [] });
    harness.detectChanges();
    expect(host().querySelector('[data-layout-status]')?.textContent).toContain('Saved. Revision 1.');
    expect(host().querySelector('[data-layout-revision]')?.getAttribute('data-layout-revision')).toBe('1');
    named('Save the older revision').click();
    expect((api.saveLayout.calls.mostRecent().args[1] as { expected_revision: number }).expected_revision).toBe(0);
    saves.at(-1)!.error({ status: 409, error: { message: 'This room was saved at revision 1.' } });
    harness.detectChanges();
    expect(host().textContent).toContain('This room was saved at revision 1. The older revision was not written.');
    expect(named('Palette 2').getAttribute('aria-pressed')).toBe('true');
    expect(note!.value).toBe('Harbor draft stays');

    named('Save layout').click();
    user$.next({ id: 2 });
    harness.detectChanges();
    saves.at(-1)!.next({ room_id: 'study', revision: 4, items: [] });
    harness.detectChanges();
    expect(host().textContent).not.toContain('Revision 4');
    expect(named('Palette 2').getAttribute('aria-pressed')).toBe('false');
    expect(note!.value).toBe('');
  });
});
