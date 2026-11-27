import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BehaviorSubject, Subject } from 'rxjs';
import { scenePreferenceKey } from '../platform/scene-appearance';
import { SCENE_SAVE_ERROR } from '../platform/scene-appearance.service';
import { SessionService } from '../platform/session.service';
import { RHYTHM_SCHEDULER, RHYTHM_TONES, HarborRhythmComponent, type RhythmScheduler, type RhythmTones } from './harbor-rhythm.component';
import { RHYTHM_CHART, RHYTHM_DURATION_MS, RHYTHM_PLAY_PREFIX, rhythmPlayKey } from './harbor-rhythm';

@Component({ standalone: true, template: '' })
class BlankComponent {}

function wipe(): void {
  for (const storage of [sessionStorage, localStorage]) {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(RHYTHM_PLAY_PREFIX) || key?.startsWith('town.scene.v1.')) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
  }
}

function button(host: HTMLElement, name: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find(item => item.textContent?.trim() === name);
  if (!found) throw new Error(name);
  return found;
}

function lane(host: HTMLElement, index: number): HTMLButtonElement {
  const found = host.querySelector<HTMLButtonElement>(`[data-lane="${index}"]`);
  if (!found) throw new Error(`lane ${index}`);
  return found;
}

function manualScheduler(): RhythmScheduler & { tick(): void; running(): boolean; fireStale(): void } {
  let active: (() => void) | null = null;
  let stale: (() => void) | null = null;
  return {
    start(tick: () => void): void {
      active = tick;
      stale = tick;
    },
    stop(): void {
      active = null;
    },
    tick(): void {
      active?.();
    },
    running(): boolean {
      return active != null;
    },
    fireStale(): void {
      stale?.();
    },
  };
}

function reducedQuery(): MediaQueryList {
  return {
    matches: true,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener(): void { /* static query */ },
    removeEventListener(): void { /* static query */ },
    dispatchEvent(): boolean { return false; },
    onchange: null,
    addListener(): void { /* static query */ },
    removeListener(): void { /* static query */ },
  } as MediaQueryList;
}

describe('Harbor Rhythm page', () => {
  afterEach(() => {
    wipe();
    TestBed.resetTestingModule();
  });

  async function open(owner = 4): Promise<{
    harness: RouterTestingHarness;
    host: HTMLElement;
    session: { currentUser: { id: number } | null };
    user$: BehaviorSubject<{ id: number } | null>;
    cleared$: Subject<void>;
    scheduler: ReturnType<typeof manualScheduler>;
    tones: RhythmTones & { play: jasmine.Spy; stop: jasmine.Spy };
  }> {
    const user$ = new BehaviorSubject<{ id: number } | null>({ id: owner });
    const cleared$ = new Subject<void>();
    const session = { currentUser: { id: owner } as { id: number } | null, user$, cleared$ };
    const scheduler = manualScheduler();
    const tones = { play: jasmine.createSpy('play'), stop: jasmine.createSpy('stop') };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'town/rhythm', component: HarborRhythmComponent },
          { path: 'town', component: BlankComponent },
        ]),
        { provide: SessionService, useValue: session },
        { provide: RHYTHM_SCHEDULER, useValue: scheduler },
        { provide: RHYTHM_TONES, useValue: tones },
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/town/rhythm');
    return {
      harness,
      host: harness.routeNativeElement as HTMLElement,
      session,
      user$,
      cleared$,
      scheduler,
      tones,
    };
  }

  function ticks(scheduler: ReturnType<typeof manualScheduler>, ms: number, harness: RouterTestingHarness): void {
    for (let elapsed = 0; elapsed < ms; elapsed += 100) scheduler.tick();
    harness.detectChanges();
  }

  it('finishes the untimed sequence, restarts, and quits to that accuracy', async () => {
    const { harness, host } = await open();
    expect(host.querySelector('h1')?.textContent).toContain('Harbor Rhythm');
    expect(host.textContent).toContain('not a recording');
    expect(host.textContent).toContain('does not award Stamps');
    expect(host.textContent).not.toMatch(/Buy|Grant/);
    expect(host.querySelector('[data-clock]')?.getAttribute('data-clock')).toBe('off');
    expect(host.querySelector('[data-sound]')?.getAttribute('data-sound')).toBe('off');

    button(host, 'Play untimed sequence').click();
    harness.detectChanges();
    expect(host.textContent).toContain('0 of 16. Next Bell.');
    expect(host.querySelector('[data-clock]')?.getAttribute('data-clock')).toBe('off');
    expect(host.querySelector('.note')).toBeNull();

    const component = harness.routeDebugElement?.componentInstance as HarborRhythmComponent;
    component.onWorkspaceShortcut(new KeyboardEvent('keydown', { key: 'p' }));
    harness.detectChanges();
    expect(host.textContent).toContain('Paused. 0 of 16.');
    lane(host, 0).click();
    harness.detectChanges();
    expect(host.textContent).toContain('Paused. 0 of 16.');

    component.onWorkspaceShortcut(new KeyboardEvent('keydown', { key: 'p' }));
    harness.detectChanges();
    lane(host, 1).click();
    harness.detectChanges();
    expect(host.textContent).toContain('0 of 16. Next Bell. Accuracy 0%.');
    lane(host, 0).click();
    harness.detectChanges();
    expect(host.textContent).toContain('1 of 16. Next Glass. Accuracy 50%.');
    lane(host, 0).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    harness.detectChanges();
    expect(lane(host, 1)).toBe(document.activeElement as HTMLButtonElement);

    button(host, 'Restart').click();
    harness.detectChanges();
    expect(host.textContent).toContain('0 of 16. Next Bell. Accuracy not scored yet.');
    for (const beat of RHYTHM_CHART) {
      lane(host, beat.lane).click();
      harness.detectChanges();
    }
    expect(host.textContent).toContain('Win. Untimed sequence complete. Accuracy 100%.');
    expect(lane(host, 0).disabled).toBeTrue();

    component.onWorkspaceShortcut(new KeyboardEvent('keydown', { key: 'r' }));
    harness.detectChanges();
    expect(lane(host, 0).disabled).toBeFalse();
    button(host, 'Quit').click();
    harness.detectChanges();
    expect(host.querySelector('[data-lane]')).toBeNull();
    expect(host.textContent).toContain('Last untimed sequence finished at 100% accuracy.');
  });

  it('keeps the open step when storage fails and pauses a hidden timed chart', async () => {
    const { harness, host, scheduler } = await open();
    button(host, 'Play 30-second chart').click();
    harness.detectChanges();
    expect(scheduler.running()).toBeTrue();
    ticks(scheduler, 1_800, harness);
    expect(lane(host, 0).getAttribute('data-due')).toBe('true');
    spyOn(sessionStorage, 'setItem').and.throwError('full');
    lane(host, 0).click();
    harness.detectChanges();
    expect(host.querySelector('[data-elapsed]')?.getAttribute('data-elapsed')).toBe('1800');
    expect(lane(host, 0).getAttribute('data-due')).toBe('false');
    (sessionStorage.setItem as jasmine.Spy).and.callThrough();

    const state = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    harness.detectChanges();
    expect(host.textContent).toContain('Paused.');
    expect(scheduler.running()).toBeFalse();
    expect(host.querySelector('[data-clock]')?.getAttribute('data-clock')).toBe('off');
    const elapsed = host.querySelector('[data-elapsed]')?.getAttribute('data-elapsed');
    scheduler.fireStale();
    harness.detectChanges();
    expect(host.querySelector('[data-elapsed]')?.getAttribute('data-elapsed')).toBe(elapsed);
    Reflect.deleteProperty(document, 'visibilityState');
    if (state) Object.defineProperty(Document.prototype, 'visibilityState', state);

    button(host, 'Resume').click();
    harness.detectChanges();
    expect(scheduler.running()).toBeTrue();
    await harness.navigateByUrl('/town');
    expect(scheduler.running()).toBeFalse();
    await harness.navigateByUrl('/town/rhythm');
    const restored = harness.routeNativeElement as HTMLElement;
    expect(restored.querySelector('[data-elapsed]')?.getAttribute('data-elapsed')).toBe('1800');
    expect(restored.textContent).toContain('29 seconds left.');
  });

  it('drops the chart when the owner changes and ignores a stale tick', async () => {
    const { harness, host, session, user$, scheduler } = await open();
    button(host, 'Play untimed sequence').click();
    harness.detectChanges();
    const real = sessionStorage.setItem.bind(sessionStorage);
    let switched = false;
    spyOn(sessionStorage, 'setItem').and.callFake((key: string, value: string) => {
      real(key, value);
      if (!switched && key === rhythmPlayKey(4)) {
        switched = true;
        session.currentUser = { id: 9 };
        user$.next({ id: 9 });
      }
    });
    lane(host, 0).click();
    harness.detectChanges();
    expect(host.querySelector('[data-lane]')).toBeNull();
    expect(sessionStorage.getItem(rhythmPlayKey(4))).toBeNull();
    expect(sessionStorage.getItem(rhythmPlayKey(9))).toBeNull();
    scheduler.fireStale();
    harness.detectChanges();
    expect(host.querySelector('[data-lane]')).toBeNull();
    expect(scheduler.running()).toBeFalse();
  });

  it('clears the round on sign-out and plays a tone only when sound is on', async () => {
    const { harness, host, session, user$, cleared$, tones } = await open();
    button(host, 'Play untimed sequence').click();
    harness.detectChanges();
    lane(host, 0).click();
    harness.detectChanges();
    expect(tones.play).not.toHaveBeenCalled();
    cleared$.next();
    session.currentUser = null;
    user$.next(null);
    harness.detectChanges();
    expect(host.querySelector('[data-lane]')).toBeNull();
    expect(Object.keys(sessionStorage).filter(key => key.startsWith(RHYTHM_PLAY_PREFIX))).toEqual([]);

    TestBed.resetTestingModule();
    wipe();
    localStorage.setItem(scenePreferenceKey(4), JSON.stringify({ season: 'default', sound: true }));
    const sounded = await open();
    expect(sounded.host.querySelector('[data-sound]')?.getAttribute('data-sound')).toBe('on');
    button(sounded.host, 'Play untimed sequence').click();
    sounded.harness.detectChanges();
    lane(sounded.host, 0).click();
    sounded.harness.detectChanges();
    expect(sounded.tones.play).toHaveBeenCalledOnceWith(0);
    sounded.tones.stop.calls.reset();
    button(sounded.host, 'Pause').click();
    sounded.harness.detectChanges();
    expect(sounded.tones.stop).toHaveBeenCalled();
    expect(sounded.scheduler.running()).toBeFalse();
  });

  it('keeps an opted-in tone when the device cannot store it, and stays silent for reduced motion', async () => {
    const { harness, host, tones } = await open();
    spyOn(localStorage, 'setItem').and.throwError('full');
    const input = host.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (!input) throw new Error('sound');
    input.checked = true;
    input.dispatchEvent(new Event('change'));
    harness.detectChanges();
    expect(host.textContent).toContain(SCENE_SAVE_ERROR);
    expect(host.querySelector('[data-sound]')?.getAttribute('data-sound')).toBe('on');
    (localStorage.setItem as jasmine.Spy).and.callThrough();
    button(host, 'Play untimed sequence').click();
    harness.detectChanges();
    lane(host, 0).click();
    harness.detectChanges();
    expect(tones.play).toHaveBeenCalledOnceWith(0);
    TestBed.resetTestingModule();
    wipe();

    spyOn(window, 'matchMedia').and.returnValue(reducedQuery());
    localStorage.setItem(scenePreferenceKey(4), JSON.stringify({ season: 'default', sound: true }));
    const reduced = await open();
    expect(reduced.host.querySelector('[data-motion]')?.getAttribute('data-motion')).toBe('reduce');
    expect(reduced.host.textContent).toContain('Notes do not travel');
    button(reduced.host, 'Play untimed sequence').click();
    reduced.harness.detectChanges();
    lane(reduced.host, 0).click();
    reduced.harness.detectChanges();
    expect(reduced.host.textContent).toContain('1 of 16. Next Glass. Accuracy 100%.');
    expect(reduced.host.querySelector('.note')).toBeNull();
    expect(reduced.tones.play).not.toHaveBeenCalled();
    expect(reduced.scheduler.running()).toBeFalse();
  });

  it('finishes the 30-second chart from the clock without a second timer', async () => {
    const { harness, host, scheduler, tones } = await open();
    const component = harness.routeDebugElement?.componentInstance as HarborRhythmComponent;
    component.onWorkspaceShortcut(new KeyboardEvent('keydown', { key: 'p' }));
    harness.detectChanges();
    expect(host.querySelector('[data-mode]')?.getAttribute('data-mode')).toBe('timed');
    expect(scheduler.running()).toBeTrue();
    let elapsed = 0;
    for (const beat of RHYTHM_CHART) {
      ticks(scheduler, beat.at - elapsed, harness);
      elapsed = beat.at;
      expect(lane(host, beat.lane).getAttribute('data-due')).toBe('true');
      expect(host.querySelectorAll('.note').length).toBeGreaterThan(0);
      component.onWorkspaceShortcut(new KeyboardEvent('keydown', { key: String(beat.lane + 1) }));
      harness.detectChanges();
    }
    ticks(scheduler, RHYTHM_DURATION_MS - elapsed, harness);
    expect(host.textContent).toContain('Win. 30-second chart complete. Accuracy 100%.');
    expect(scheduler.running()).toBeFalse();
    expect(host.querySelector('[data-clock]')?.getAttribute('data-clock')).toBe('off');
    expect(tones.play).not.toHaveBeenCalled();
    scheduler.fireStale();
    harness.detectChanges();
    expect(host.textContent).toContain('Win. 30-second chart complete. Accuracy 100%.');
  });
});
