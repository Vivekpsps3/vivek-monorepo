import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { DEFAULT_SCENE_PREFERENCE, scenePreferenceKey, type ScenePreference } from '../platform/scene-appearance';
import { SCENE_SAVE_ERROR, SceneAppearanceService } from '../platform/scene-appearance.service';
import { SessionService } from '../platform/session.service';
import { GameSectionComponent } from './game-section.component';

function preference(patch: Partial<ScenePreference> = {}): ScenePreference {
  return { ...DEFAULT_SCENE_PREFERENCE, ...patch };
}

describe('Game preferences', () => {
  let user: BehaviorSubject<{ id: number } | null>;

  function clear(): void {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('town.scene.v1.')) localStorage.removeItem(key);
    }
  }

  beforeEach(() => {
    clear();
    TestBed.resetTestingModule();
    user = new BehaviorSubject<{ id: number } | null>({ id: 4 });
    TestBed.configureTestingModule({
      imports: [GameSectionComponent],
      providers: [
        provideRouter([]),
        { provide: SessionService, useValue: { user$: user } },
      ],
    });
  });

  afterEach(() => clear());

  function render() {
    const fixture = TestBed.createComponent(GameSectionComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  function input(el: HTMLElement, name: string): HTMLInputElement {
    const found = el.querySelector<HTMLInputElement>(`input[name="${name}"]`);
    if (!found) throw new Error(name);
    return found;
  }

  it('defaults to mute, keeps volume, and saves motion and decoration for one owner', async () => {
    const contexts: unknown[] = [];
    const original = window.AudioContext;
    window.AudioContext = class {
      constructor() { contexts.push(this); }
    } as unknown as typeof AudioContext;
    const { fixture, el } = render();
    expect(input(el, 'town-mute').checked).toBeTrue();
    expect(input(el, 'town-volume').value).toBe('70');
    expect(input(el, 'town-motion').value).toBe('system');
    expect((el.querySelector('input[name="town-motion"][value="system"]') as HTMLInputElement).checked).toBeTrue();
    expect(input(el, 'town-decoration').checked).toBeTrue();
    expect(el.textContent).toContain('Nothing plays by itself');
    expect(localStorage.getItem(scenePreferenceKey(4))).toBeNull();

    const volume = input(el, 'town-volume');
    volume.value = '40';
    volume.dispatchEvent(new Event('change'));
    const mute = input(el, 'town-mute');
    mute.checked = false;
    mute.dispatchEvent(new Event('change'));
    const reduce = el.querySelector('input[name="town-motion"][value="reduce"]') as HTMLInputElement;
    reduce.click();
    reduce.dispatchEvent(new Event('change'));
    const decoration = input(el, 'town-decoration');
    decoration.checked = false;
    decoration.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(el.textContent).toContain('Saved on this device.');
    expect(JSON.parse(localStorage.getItem(scenePreferenceKey(4))!)).toEqual(preference({
      sound: true, volume: 0.4, motion: 'reduce', decoration: false,
    }));
    expect(contexts).toEqual([]);
    window.AudioContext = original;

    user.next({ id: 9 });
    fixture.detectChanges();
    expect(input(el, 'town-mute').checked).toBeTrue();
    expect(input(el, 'town-volume').value).toBe('70');
    expect(input(el, 'town-decoration').checked).toBeTrue();
    user.next({ id: 4 });
    fixture.detectChanges();
    expect(input(el, 'town-mute').checked).toBeFalse();
    expect(input(el, 'town-volume').value).toBe('40');
    expect((el.querySelector('input[name="town-motion"][value="reduce"]') as HTMLInputElement).checked).toBeTrue();
    expect(input(el, 'town-decoration').checked).toBeFalse();
    expect(TestBed.inject(SceneAppearanceService).reduced()).toBeTrue();
  });

  it('keeps a blocked write in the session and leaves Town preferences usable', async () => {
    const { fixture, el } = render();
    spyOn(localStorage, 'setItem').and.throwError('blocked');
    const mute = input(el, 'town-mute');
    mute.checked = false;
    mute.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement?.textContent).toContain(SCENE_SAVE_ERROR);
    expect(input(el, 'town-mute').checked).toBeFalse();
    expect(TestBed.inject(SceneAppearanceService).effective().sound).toBeTrue();
    expect(localStorage.getItem(scenePreferenceKey(4))).toBeNull();
    expect(el.querySelector('a')?.getAttribute('href')).toBe('/town/rhythm');
  });

  it('offers no editor until someone is signed in, and the targets are 44px', () => {
    user.next(null);
    const signedOut = render().el;
    expect(signedOut.textContent).toContain('Sign in to save game preferences on this device.');
    expect(signedOut.querySelector('input')).toBeNull();
    user.next({ id: 4 });
    const el = render().el;
    for (const name of ['Mute', 'Follow this device', 'Reduce motion', 'Game decoration and feedback']) {
      const label = [...el.querySelectorAll('label')].find(item => item.textContent?.includes(name));
      expect(label?.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    }
    expect(el.querySelector('input[type="range"]')?.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    for (const link of [...el.querySelectorAll('a')]) {
      expect(link.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    }
  });
});
