import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { SessionService } from './session.service';
import { scenePreferenceKey } from './scene-appearance';
import { SCENE_SAVE_ERROR, SceneAppearanceService } from './scene-appearance.service';

describe('SceneAppearanceService', () => {
  let user: BehaviorSubject<{ id: number } | null>;

  function clear(): void {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('town.scene.v1.')) localStorage.removeItem(key);
    }
  }

  beforeEach(() => {
    clear();
    TestBed.resetTestingModule();
    user = new BehaviorSubject<{ id: number } | null>({ id: 7 });
    TestBed.configureTestingModule({
      providers: [{ provide: SessionService, useValue: { user$: user } }],
    });
  });

  afterEach(() => clear());

  function setup(): SceneAppearanceService {
    return TestBed.inject(SceneAppearanceService);
  }

  it('previews, saves, reloads, and isolates owners across a month boundary', () => {
    const service = setup();
    service.at.set(new Date(2026, 4, 31, 12));
    expect(service.presentation().season).toBe('spring');
    expect(service.presentation().dayPart).toBe('day');
    service.at.set(new Date(2026, 5, 1, 18));
    expect(service.presentation()).toEqual(jasmine.objectContaining({ season: 'summer', dayPart: 'night' }));
    expect(localStorage.getItem(scenePreferenceKey(7))).toBeNull();

    service.preview({ season: 'winter' });
    expect(service.dirty()).toBeTrue();
    expect(service.presentation().season).toBe('winter');
    const fetchSpy = spyOn(window, 'fetch');
    expect(service.save()).toBeTrue();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(service.dirty()).toBeFalse();
    expect(JSON.parse(localStorage.getItem(scenePreferenceKey(7))!)).toEqual({ season: 'winter', sound: false });

    service.at.set(new Date(2026, 7, 31, 12));
    expect(service.presentation().season).toBe('winter');
    service.at.set(new Date(2026, 8, 1, 12));
    expect(service.presentation().season).toBe('winter');

    localStorage.setItem(scenePreferenceKey(8), JSON.stringify({ season: 'spring', sound: true }));
    user.next({ id: 8 });
    expect(service.owner()).toBe(8);
    expect(service.effective()).toEqual({ season: 'spring', sound: true });
    expect(service.dirty()).toBeFalse();
    user.next({ id: 7 });
    expect(service.effective().season).toBe('winter');
    expect(service.effective().sound).toBeFalse();
  });

  it('drops an unsaved preview when the owner changes and does not write the new owner', () => {
    const service = setup();
    localStorage.setItem(scenePreferenceKey(8), JSON.stringify({ season: 'autumn', sound: false }));
    service.preview({ season: 'summer', sound: true });
    user.next({ id: 8 });
    expect(service.effective()).toEqual({ season: 'autumn', sound: false });
    expect(service.dirty()).toBeFalse();
    expect(localStorage.getItem(scenePreferenceKey(7))).toBeNull();
    expect(JSON.parse(localStorage.getItem(scenePreferenceKey(8))!).sound).toBeFalse();
  });

  it('keeps the same-session preview when storage fails', () => {
    const service = setup();
    service.preview({ season: 'summer' });
    spyOn(localStorage, 'setItem').and.throwError('blocked');
    expect(service.save()).toBeFalse();
    expect(service.saveError()).toBe(SCENE_SAVE_ERROR);
    expect(service.dirty()).toBeTrue();
    expect(service.effective().season).toBe('summer');
    expect(localStorage.getItem(scenePreferenceKey(7))).toBeNull();
  });

  it('does not apply a preview to the owner who arrives during the write', () => {
    const service = setup();
    localStorage.setItem(scenePreferenceKey(8), JSON.stringify({ season: 'default', sound: false }));
    service.preview({ season: 'summer' });
    spyOn(localStorage, 'setItem').and.callFake((key: string, value: string) => {
      user.next({ id: 8 });
      Storage.prototype.setItem.call(localStorage, key, value);
    });
    expect(service.save()).toBeFalse();
    expect(service.owner()).toBe(8);
    expect(service.dirty()).toBeFalse();
    expect(service.effective()).toEqual({ season: 'default', sound: false });
    expect(JSON.parse(localStorage.getItem(scenePreferenceKey(7))!)).toEqual({ season: 'summer', sound: false });
    expect(JSON.parse(localStorage.getItem(scenePreferenceKey(8))!).season).toBe('default');
  });

  it('does not preview or save without an owner', () => {
    user.next(null);
    const service = setup();
    service.preview({ season: 'winter' });
    expect(service.dirty()).toBeFalse();
    expect(service.save()).toBeFalse();
    expect(localStorage.length === 0 || Object.keys(localStorage).every(key => !key.startsWith('town.scene.v1.'))).toBeTrue();
  });
});
