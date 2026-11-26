import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BehaviorSubject, Subject } from 'rxjs';
import { scenePreferenceKey } from '../platform/scene-appearance';
import { SessionService } from '../platform/session.service';
import { MEMORY_MATCH_TONE, MemoryShelvesComponent } from './memory-shelves.component';
import { MEMORY_PLAY_PREFIX, memoryPlayKey } from './memory-shelves';

@Component({ standalone: true, template: '' })
class BlankComponent {}

function wipe(): void {
  for (const storage of [sessionStorage, localStorage]) {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(MEMORY_PLAY_PREFIX) || key?.startsWith('town.scene.v1.')) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
  }
}

function button(host: HTMLElement, name: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find(item => item.textContent?.trim() === name);
  if (!found) throw new Error(name);
  return found;
}

function shelf(host: HTMLElement, index: number): HTMLButtonElement {
  const found = host.querySelector<HTMLButtonElement>(`[data-index="${index}"]`);
  if (!found) throw new Error(`shelf ${index}`);
  return found;
}

describe('Memory Shelves page', () => {
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
    tone: jasmine.Spy;
  }> {
    const user$ = new BehaviorSubject<{ id: number } | null>({ id: owner });
    const cleared$ = new Subject<void>();
    const session = { currentUser: { id: owner } as { id: number } | null, user$, cleared$ };
    const tone = jasmine.createSpy('tone').and.resolveTo(undefined);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'town/memory', component: MemoryShelvesComponent },
          { path: 'town', component: BlankComponent },
        ]),
        { provide: SessionService, useValue: session },
        { provide: MEMORY_MATCH_TONE, useValue: tone },
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/town/memory');
    return { harness, host: harness.routeNativeElement as HTMLElement, session, user$, cleared$, tone };
  }

  it('finishes seed 10, restarts without a matched shelf, and quits to the same score', async () => {
    const { harness, host } = await open();
    expect(host.querySelector('h1')?.textContent).toContain('Memory Shelves');
    expect(host.textContent).toContain('Enter or Space turns a shelf');
    expect(host.textContent).toContain('not timed');
    expect(host.textContent).toContain('does not award Stamps');
    expect(host.textContent).not.toMatch(/Buy|Grant/);
    button(host, 'Play Memory Shelves').click();
    harness.detectChanges();
    expect(host.querySelector('[data-phase]')?.getAttribute('data-phase')).toBe('playing');
    expect(host.textContent).toContain('0 moves.');

    const component = harness.routeDebugElement?.componentInstance as MemoryShelvesComponent;
    component.onWorkspaceShortcut(new KeyboardEvent('keydown', { key: 'p' }));
    harness.detectChanges();
    expect(host.textContent).toContain('Paused. 0 moves.');
    shelf(host, 0).click();
    harness.detectChanges();
    expect(shelf(host, 0).dataset['face']).toBe('down');
    component.onWorkspaceShortcut(new KeyboardEvent('keydown', { key: 'p' }));
    harness.detectChanges();

    shelf(host, 0).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    harness.detectChanges();
    expect(shelf(host, 1).tabIndex).toBe(0);

    for (const index of [2, 3, 0, 11, 1, 6, 4, 7, 5, 8, 9, 10]) {
      shelf(host, index).click();
      harness.detectChanges();
    }
    expect(host.textContent).toContain('All six pairs matched in 6 moves.');
    expect(shelf(host, 2).disabled).toBeTrue();
    expect(shelf(host, 2).dataset['face']).toBe('matched');

    button(host, 'Restart').click();
    harness.detectChanges();
    expect(host.textContent).toContain('0 moves.');
    expect(shelf(host, 2).dataset['face']).toBe('down');
    expect(shelf(host, 2).disabled).toBeFalse();
    shelf(host, 2).click();
    harness.detectChanges();
    expect(shelf(host, 2).dataset['face']).toBe('up');
    expect(shelf(host, 2).getAttribute('aria-label')).toBe('Shelf 3, Lantern');
    expect(host.textContent).toContain('0 moves.');

    component.onWorkspaceShortcut(new KeyboardEvent('keydown', { key: 'r' }));
    harness.detectChanges();
    expect(shelf(host, 2).dataset['face']).toBe('down');
    button(host, 'Quit').click();
    harness.detectChanges();
    expect(host.querySelector('[data-index]')).toBeNull();
    expect(host.textContent).toContain('Last game finished in 6 moves.');
    expect(host.querySelector('[data-sound]')?.getAttribute('data-sound')).toBe('off');
  });

  it('keeps the open shelf when storage fails, the page hides, or the player leaves', async () => {
    const { harness, host } = await open();
    button(host, 'Play Memory Shelves').click();
    harness.detectChanges();
    spyOn(sessionStorage, 'setItem').and.throwError('full');
    shelf(host, 0).click();
    harness.detectChanges();
    expect(shelf(host, 0).dataset['face']).toBe('up');
    (sessionStorage.setItem as jasmine.Spy).and.callThrough();

    const state = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    harness.detectChanges();
    expect(host.textContent).toContain('Paused. 0 moves.');
    expect(shelf(host, 0).dataset['face']).toBe('up');
    Reflect.deleteProperty(document, 'visibilityState');
    if (state) Object.defineProperty(Document.prototype, 'visibilityState', state);

    button(host, 'Resume').click();
    harness.detectChanges();
    await harness.navigateByUrl('/town');
    await harness.navigateByUrl('/town/memory');
    const restored = harness.routeNativeElement as HTMLElement;
    expect(restored.querySelector('[data-index="0"]')?.getAttribute('data-face')).toBe('up');
    expect(restored.textContent).toContain('0 moves.');
  });

  it('drops the board when the owner changes and ignores a write from the previous owner', async () => {
    const { harness, host, session, user$ } = await open();
    button(host, 'Play Memory Shelves').click();
    harness.detectChanges();
    const real = sessionStorage.setItem.bind(sessionStorage);
    let switched = false;
    spyOn(sessionStorage, 'setItem').and.callFake((key: string, value: string) => {
      real(key, value);
      if (!switched && key === memoryPlayKey(4)) {
        switched = true;
        session.currentUser = { id: 9 };
        user$.next({ id: 9 });
      }
    });
    shelf(host, 0).click();
    harness.detectChanges();
    expect(host.querySelector('[data-index]')).toBeNull();
    expect(sessionStorage.getItem(memoryPlayKey(4))).toBeNull();
    expect(sessionStorage.getItem(memoryPlayKey(9))).toBeNull();
    expect(host.textContent).not.toContain('Lantern');
  });

  it('clears the draft on sign-out and plays a tone only for a sounded match', async () => {
    const { harness, host, session, user$, cleared$, tone } = await open();
    button(host, 'Play Memory Shelves').click();
    harness.detectChanges();
    shelf(host, 0).click();
    harness.detectChanges();
    cleared$.next();
    session.currentUser = null;
    user$.next(null);
    harness.detectChanges();
    expect(host.querySelector('[data-index]')).toBeNull();
    expect(Object.keys(sessionStorage).filter(key => key.startsWith(MEMORY_PLAY_PREFIX))).toEqual([]);
    expect(tone).not.toHaveBeenCalled();
  });

  it('plays the match tone when sound is on and skips it for reduced motion', async () => {
    localStorage.setItem(scenePreferenceKey(4), JSON.stringify({ season: 'default', sound: true }));
    const sounded = await open();
    expect(sounded.host.querySelector('[data-sound]')?.getAttribute('data-sound')).toBe('on');
    button(sounded.host, 'Play Memory Shelves').click();
    sounded.harness.detectChanges();
    shelf(sounded.host, 0).click();
    shelf(sounded.host, 1).click();
    sounded.harness.detectChanges();
    expect(sounded.tone).not.toHaveBeenCalled();
    shelf(sounded.host, 2).click();
    shelf(sounded.host, 3).click();
    sounded.harness.detectChanges();
    expect(sounded.tone).toHaveBeenCalledTimes(1);
    TestBed.resetTestingModule();
    wipe();

    spyOn(window, 'matchMedia').and.returnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      addEventListener(): void { /* static query */ },
      removeEventListener(): void { /* static query */ },
      dispatchEvent(): boolean { return false; },
      onchange: null,
      addListener(): void { /* static query */ },
      removeListener(): void { /* static query */ },
    } as MediaQueryList);
    localStorage.setItem(scenePreferenceKey(4), JSON.stringify({ season: 'default', sound: true }));
    const reduced = await open();
    expect(reduced.host.querySelector('[data-motion]')?.getAttribute('data-motion')).toBe('reduce');
    button(reduced.host, 'Play Memory Shelves').click();
    reduced.harness.detectChanges();
    shelf(reduced.host, 2).click();
    shelf(reduced.host, 3).click();
    reduced.harness.detectChanges();
    expect(reduced.host.querySelector('[role=status]')?.textContent).toContain('1 move. 1 of 6 pairs matched.');
    expect(reduced.tone).not.toHaveBeenCalled();
  });
});
