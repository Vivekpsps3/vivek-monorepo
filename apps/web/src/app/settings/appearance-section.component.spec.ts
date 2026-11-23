import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { SessionService } from '../platform/session.service';
import { scenePreferenceKey } from '../platform/scene-appearance';
import { SCENE_SAVE_ERROR, SceneAppearanceService } from '../platform/scene-appearance.service';
import { AppearanceSectionComponent } from './appearance-section.component';

describe('AppearanceSectionComponent seasons', () => {
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
      imports: [AppearanceSectionComponent],
      providers: [
        provideRouter([]),
        { provide: SessionService, useValue: { user$: user } },
      ],
    });
  });

  afterEach(() => clear());

  function render() {
    const fixture = TestBed.createComponent(AppearanceSectionComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el };
  }

  function control(el: HTMLElement, name: string): HTMLButtonElement {
    const found = [...el.querySelectorAll('button')].find(item => item.textContent?.trim() === name);
    if (!(found instanceof HTMLButtonElement)) throw new Error(`missing ${name}`);
    return found;
  }

  it('previews, discards, saves, and reloads an explicit season without a server write', () => {
    const { fixture, el } = render();
    const service = TestBed.inject(SceneAppearanceService);
    service.at.set(new Date(2026, 10, 30, 12));
    fixture.detectChanges();
    expect(el.querySelector('[data-season-preview]')?.textContent).toContain('Automatic, Autumn');
    expect(el.textContent).toContain('March through May');
    expect(el.textContent).toContain('December through February');
    const winter = el.querySelector('input[value="winter"]') as HTMLInputElement;
    winter.click();
    winter.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(el.textContent).toContain('Unsaved preview');
    expect(el.querySelector('[data-season-preview]')?.textContent).toContain('Winter');
    expect(localStorage.getItem(scenePreferenceKey(4))).toBeNull();
    const fetchSpy = spyOn(window, 'fetch');
    control(el, 'Discard preview').click();
    expect(document.activeElement).toBe(el.querySelector('input[value="automatic"]'));
    fixture.detectChanges();
    expect(el.textContent).not.toContain('Unsaved preview');
    winter.click();
    winter.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    control(el, 'Save season').click();
    expect(document.activeElement?.textContent).toContain('Season saved on this device.');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(scenePreferenceKey(4))!)).toEqual({ season: 'winter', sound: false });
    service.at.set(new Date(2026, 11, 1, 12));
    fixture.detectChanges();
    expect(service.presentation().season).toBe('winter');
    expect(el.querySelector('[data-season-preview]')?.textContent).toContain('Light snow');
  });

  it('keeps a failed save in the session and clears it when the owner changes', () => {
    const { fixture, el } = render();
    localStorage.setItem(scenePreferenceKey(9), JSON.stringify({ season: 'spring', sound: true }));
    const summer = el.querySelector('input[value="summer"]') as HTMLInputElement;
    summer.click();
    summer.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    spyOn(localStorage, 'setItem').and.throwError('blocked');
    control(el, 'Save season').click();
    fixture.detectChanges();
    expect(document.activeElement?.textContent).toContain(SCENE_SAVE_ERROR);
    expect(el.textContent).toContain('Unsaved preview');
    user.next({ id: 9 });
    fixture.detectChanges();
    expect(el.textContent).not.toContain('Unsaved preview');
    expect((el.querySelector('input[value="spring"]') as HTMLInputElement).checked).toBeTrue();
    expect((el.querySelector('input[name="town-sound"]') as HTMLInputElement).checked).toBeTrue();
    expect(localStorage.getItem(scenePreferenceKey(4))).toBeNull();
  });

  it('offers no editor until someone is signed in, and the targets are 44px', () => {
    user.next(null);
    const { el } = render();
    expect(el.textContent).toContain('Sign in to save a Town season on this device.');
    expect(el.querySelector('input[name="town-season"]')).toBeNull();
    expect(control(el, 'Save season').disabled).toBeTrue();
    user.next({ id: 4 });
    const fixture = TestBed.createComponent(AppearanceSectionComponent);
    fixture.detectChanges();
    const signedIn = fixture.nativeElement as HTMLElement;
    for (const name of ['Automatic', 'Winter', 'Town sound']) {
      const label = [...signedIn.querySelectorAll('label')].find(item => item.textContent?.includes(name));
      expect(label?.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    }
    expect(control(signedIn, 'Save season').getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    expect(signedIn.querySelector('a')?.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  });
});
