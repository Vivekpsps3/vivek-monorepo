import { Component } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject, Subject } from 'rxjs';
import { scenePreferenceKey } from '../../platform/scene-appearance';
import { SessionService } from '../../platform/session.service';
import { DEFAULT_HEALTH_UNITS } from './health-entry';
import { HealthWorkoutDialogComponent } from './health-workout-dialog.component';
import { emptyWorkoutDraft, type WorkoutDraft } from './workout';

@Component({
  imports: [HealthWorkoutDialogComponent],
  template: `
    <app-health-workout-dialog
      [open]="open"
      [today]="today"
      [units]="units"
      [draft]="draft"
      (draftChange)="draft = $event; changes = changes + 1" />
  `,
})
class RestHost {
  open = true;
  today = '2026-10-29';
  units = { ...DEFAULT_HEALTH_UNITS };
  draft: WorkoutDraft = { ...emptyWorkoutDraft('session', '2026-10-29'), name: 'Synthetic press', state: 'draft' };
  changes = 0;
}

class SessionDouble {
  readonly users = new BehaviorSubject<{ id: number } | null>({ id: 7 });
  readonly cleared$ = new Subject<void>();
  readonly user$ = this.users.asObservable();
  get currentUser(): { id: number } | null { return this.users.value; }
}

function restButton(el: ParentNode, id: string): HTMLButtonElement {
  const found = el.querySelector(`#${id} button`);
  if (!(found instanceof HTMLButtonElement)) throw new Error(`missing ${id}`);
  return found;
}

describe('workout rest timer dialog', () => {
  const original = window.AudioContext;
  let visibility = 'visible';
  let reduced = false;
  let constructed = 0;
  let closed = 0;
  let started = 0;

  beforeEach(() => {
    visibility = 'visible';
    reduced = false;
    constructed = 0;
    closed = 0;
    started = 0;
    localStorage.removeItem(scenePreferenceKey(7));
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
    spyOn(window, 'matchMedia').and.callFake((query: string) => ({
      matches: reduced && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener() { /* dialog listens */ },
      removeEventListener() { /* dialog listens */ },
    }) as unknown as MediaQueryList);
    window.AudioContext = class {
      currentTime = 0;
      destination = {};
      constructor() { constructed += 1; }
      resume() { return Promise.resolve(); }
      createOscillator() {
        const oscillator = {
          type: 'sine',
          frequency: { value: 0 },
          onended: null as null | (() => void),
          connect() { return oscillator; },
          start() { started += 1; },
          stop() { oscillator.onended?.(); },
        };
        return oscillator;
      }
      createGain() {
        const gain = {
          gain: {
            setValueAtTime() { /* envelope */ },
            exponentialRampToValueAtTime() { /* envelope */ },
          },
          connect() { return gain; },
        };
        return gain;
      }
      close() { closed += 1; return Promise.resolve(); }
    } as unknown as typeof AudioContext;
    TestBed.configureTestingModule({
      imports: [RestHost],
      providers: [
        provideRouter([]),
        { provide: SessionService, useValue: new SessionDouble() as unknown as SessionService },
      ],
    });
  });

  afterEach(() => {
    window.AudioContext = original;
    delete (document as { visibilityState?: string }).visibilityState;
    localStorage.removeItem(scenePreferenceKey(7));
  });

  function show(): { fixture: ComponentFixture<RestHost>; el: HTMLElement; host: RestHost } {
    const fixture = TestBed.createComponent(RestHost);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, host: fixture.componentInstance };
  }

  it('shows the same controls for an exercise-free session and hides them for other kinds', () => {
    const { el, host, fixture } = show();
    expect(el.querySelector('[data-rest-phase]')?.getAttribute('data-rest-phase')).toBe('idle');
    expect(el.querySelector('#health-rest-clock')?.textContent?.trim()).toBe('0:00');
    expect(el.querySelector('#health-rest-status')?.textContent?.trim()).toBe('Not started');
    expect(el.querySelector('.rest')?.textContent).not.toContain('Synthetic press');
    expect(el.querySelector('#health-rest-clock')?.getAttribute('aria-label')).toBe('Rest 0:00, Not started');
    for (const id of ['health-rest-start', 'health-rest-pause', 'health-rest-reset']) {
      expect(restButton(el, id).getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    }
    expect(restButton(el, 'health-rest-start').disabled).toBeFalse();
    expect(restButton(el, 'health-rest-pause').disabled).toBeTrue();
    expect(restButton(el, 'health-rest-reset').disabled).toBeTrue();
    host.draft = emptyWorkoutDraft('exercise', '2026-10-29');
    fixture.detectChanges();
    expect(el.querySelector('#health-rest-start')).toBeNull();
    host.draft = emptyWorkoutDraft('routine', '2026-10-29');
    fixture.detectChanges();
    expect(el.querySelector('#health-rest-start')).toBeNull();
    fixture.destroy();
  });

  it('pauses and resets a running clock and leaves the draft untouched', fakeAsync(() => {
    const { el, host, fixture } = show();
    restButton(el, 'health-rest-start').click();
    fixture.detectChanges();
    expect(el.querySelector('[data-rest-phase]')?.getAttribute('data-rest-phase')).toBe('running');
    expect(el.querySelector('[data-rest-audio]')?.getAttribute('data-rest-audio')).toBe('off');
    tick(1_000);
    fixture.detectChanges();
    expect(el.querySelector('#health-rest-clock')?.textContent?.trim()).toBe('0:01');
    expect(el.querySelector('#health-rest-status')?.textContent?.trim()).toBe('Running');
    expect(constructed).toBe(0);
    restButton(el, 'health-rest-pause').click();
    fixture.detectChanges();
    tick(2_000);
    fixture.detectChanges();
    expect(el.querySelector('[data-rest-phase]')?.getAttribute('data-rest-phase')).toBe('paused');
    expect(el.querySelector('#health-rest-clock')?.textContent?.trim()).toBe('0:01');
    expect(restButton(el, 'health-rest-start').disabled).toBeFalse();
    restButton(el, 'health-rest-start').click();
    fixture.detectChanges();
    tick(2_000);
    fixture.detectChanges();
    expect(el.querySelector('#health-rest-clock')?.textContent?.trim()).toBe('0:03');
    restButton(el, 'health-rest-reset').click();
    fixture.detectChanges();
    tick(2_000);
    fixture.detectChanges();
    expect(el.querySelector('#health-rest-clock')?.textContent?.trim()).toBe('0:00');
    expect(el.querySelector('[data-rest-phase]')?.getAttribute('data-rest-phase')).toBe('idle');
    expect(host.changes).toBe(0);
    expect(host.draft.name).toBe('Synthetic press');
    fixture.destroy();
  }));

  it('ticks only while sound is on, motion is allowed, and the session stays open', fakeAsync(() => {
    localStorage.setItem(scenePreferenceKey(7), JSON.stringify({ season: 'default', sound: true }));
    const { el, host, fixture } = show();
    restButton(el, 'health-rest-start').click();
    fixture.detectChanges();
    expect(el.querySelector('[data-rest-audio]')?.getAttribute('data-rest-audio')).toBe('live');
    tick(1_000);
    fixture.detectChanges();
    expect(started).toBe(1);
    expect(constructed).toBe(1);
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    fixture.detectChanges();
    tick(2_000);
    expect(started).toBe(1);
    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    fixture.detectChanges();
    tick(1_000);
    expect(started).toBe(2);
    host.open = false;
    fixture.detectChanges();
    expect(el.querySelector('#health-rest-clock')).toBeNull();
    expect(el.querySelector('#health-workout-name')).toBeNull();
    expect(el.textContent).not.toContain('Synthetic press');
    expect(closed).toBe(1);
    const startedAtLeave = started;
    tick(3_000);
    expect(started).toBe(startedAtLeave);
    expect(constructed).toBe(1);
    host.open = true;
    fixture.detectChanges();
    expect(el.querySelector('[data-rest-phase]')?.getAttribute('data-rest-phase')).toBe('idle');
    expect(el.querySelector('#health-rest-clock')?.textContent?.trim()).toBe('0:00');
    expect(host.draft.name).toBe('Synthetic press');
    expect(host.changes).toBe(0);
    fixture.destroy();
    tick(1_000);
    expect(started).toBe(startedAtLeave);
  }));

  it('keeps the clock and withholds the tick when motion is reduced', fakeAsync(() => {
    reduced = true;
    localStorage.setItem(scenePreferenceKey(7), JSON.stringify({ season: 'default', sound: true }));
    const { el, fixture } = show();
    restButton(el, 'health-rest-start').click();
    fixture.detectChanges();
    expect(el.querySelector('[data-rest-audio]')?.getAttribute('data-rest-audio')).toBe('off');
    expect(restButton(el, 'health-rest-pause').disabled).toBeFalse();
    tick(1_000);
    fixture.detectChanges();
    expect(el.querySelector('#health-rest-clock')?.textContent?.trim()).toBe('0:01');
    expect(constructed).toBe(0);
    expect(started).toBe(0);
    fixture.destroy();
  }));

  it('keeps the next set field focused and corrects a saved set in place', () => {
    const { el, host, fixture } = show();
    host.draft = emptyWorkoutDraft('session', '2026-10-29');
    fixture.detectChanges();
    expect(el.querySelector('#health-workout-state')).toBeNull();
    expect(el.textContent).toContain('Save draft');
    expect(el.textContent).toContain('Finish session');
    expect(el.textContent).not.toContain('Complete session');
    expect(el.querySelector('form')?.getAttribute('data-session-state')).toBe('draft');
    const type = (selector: string, value: string): void => {
      const input = el.querySelector(selector);
      if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) throw new Error(selector);
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
    };
    type('#health-workout-name', 'Synthetic press');
    type('#health-workout-load', '40');
    type('#health-workout-reps', '5');
    restButton(el, 'health-workout-add-set').click();
    TestBed.tick();
    const load = el.querySelector('#health-workout-load');
    expect(document.activeElement).toBe(load);
    expect(load instanceof HTMLInputElement && load.value).toBe('');
    const row = el.querySelector('[data-entered-set]');
    if (!(row instanceof HTMLElement)) throw new Error('missing set');
    expect(row.textContent).not.toContain('Earlier');
    expect(row.textContent).toContain('5 reps');
    const edit = row.querySelector('button');
    if (!(edit instanceof HTMLButtonElement)) throw new Error('missing edit');
    edit.click();
    TestBed.tick();
    const reps = el.querySelector('[id^="health-set-reps-"]');
    if (!(reps instanceof HTMLInputElement)) throw new Error('missing reps');
    expect(document.activeElement?.id.startsWith('health-set-load-')).toBeTrue();
    reps.value = '8';
    reps.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(row.textContent).toContain('8 reps');
    expect(el.querySelector('[id^="health-move-earlier-"]')).not.toBeNull();

    host.draft = { ...host.draft, state: 'completed', clientId: 'hlt_syntheticcompleted0001' };
    fixture.detectChanges();
    expect(el.textContent).not.toContain('Save draft');
    expect(el.textContent).not.toContain('Finish session');
    expect(el.textContent).toContain('Save');
    expect(el.querySelector('#health-set-completed-' + (row.getAttribute('data-entered-set') ?? ''))).not.toBeNull();
    fixture.destroy();
  });
});
