import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { distinctUntilChanged, map } from 'rxjs';
import { SessionService } from './session.service';
import {
  DEFAULT_SCENE_PREFERENCE,
  browserSceneStorage,
  motionReduced,
  preferencesEqual,
  presentScene,
  readScenePreference,
  scenePreference,
  writeScenePreference,
  type ScenePreference,
  type ScenePresentation,
} from './scene-appearance';

export const SCENE_SAVE_ERROR = 'This device could not store the scene. The preview stays in this session.';

@Injectable({ providedIn: 'root' })
export class SceneAppearanceService {
  private readonly session = inject(SessionService);
  private readonly destroyRef = inject(DestroyRef);
  private ownerId: number | null = null;

  readonly owner = signal<number | null>(null);
  readonly saved = signal<ScenePreference>(DEFAULT_SCENE_PREFERENCE);
  readonly draft = signal<ScenePreference | null>(null);
  readonly saveError = signal<string | null>(null);
  /** Local presentation clock. Visibility refreshes it once; nothing polls. */
  readonly at = signal(new Date());
  readonly systemReduced = signal(false);
  readonly effective = computed(() => this.draft() ?? this.saved());
  readonly reduced = computed(() => motionReduced(this.effective().motion, this.systemReduced()));
  readonly dirty = computed(() => {
    const draft = this.draft();
    return draft !== null && !preferencesEqual(draft, this.saved());
  });
  readonly presentation = computed((): ScenePresentation => presentScene(this.effective().season, this.at()));

  constructor() {
    this.session.user$.pipe(
      map(user => user?.id ?? null),
      distinctUntilChanged(),
      takeUntilDestroyed(),
    ).subscribe(ownerId => this.useOwner(ownerId));
    this.listenForReducedMotion();
    if (typeof document !== 'undefined') {
      const onVisible = (): void => {
        if (document.visibilityState === 'visible') this.at.set(new Date());
      };
      document.addEventListener('visibilitychange', onVisible);
      this.destroyRef.onDestroy(() => document.removeEventListener('visibilitychange', onVisible));
    }
  }

  preview(patch: Partial<ScenePreference>): void {
    if (this.ownerId == null) return;
    const next = scenePreference({ ...this.effective(), ...patch });
    this.saveError.set(null);
    if (preferencesEqual(next, this.saved())) {
      this.draft.set(null);
      return;
    }
    this.draft.set(next);
  }

  discard(): void {
    this.draft.set(null);
    this.saveError.set(null);
  }

  /**
   * Writes the signed-in owner's key only. A failed write keeps the draft.
   * An owner change during the write does not publish that draft onto the new owner.
   */
  save(): boolean {
    const owner = this.ownerId;
    if (owner == null) return false;
    const value = this.effective();
    const ok = writeScenePreference(browserSceneStorage(), owner, value);
    if (this.ownerId !== owner) return false;
    if (!ok) {
      this.draft.set(value);
      this.saveError.set(SCENE_SAVE_ERROR);
      return false;
    }
    this.saved.set(value);
    this.draft.set(null);
    this.saveError.set(null);
    return true;
  }

  /**
   * Writes one patched saved preference. An open season preview stays uncommitted.
   * A failed write keeps the patch in this session and does not change the other owner.
   */
  persist(patch: Partial<ScenePreference>): boolean {
    const owner = this.ownerId;
    if (owner == null) return false;
    const nextSaved = scenePreference({ ...this.saved(), ...patch });
    const session = scenePreference({ ...this.effective(), ...patch });
    const ok = writeScenePreference(browserSceneStorage(), owner, nextSaved);
    if (this.ownerId !== owner) return false;
    if (!ok) {
      this.draft.set(session);
      this.saveError.set(SCENE_SAVE_ERROR);
      return false;
    }
    this.saved.set(nextSaved);
    this.draft.set(preferencesEqual(session, nextSaved) ? null : session);
    this.saveError.set(null);
    return true;
  }

  private listenForReducedMotion(): void {
    if (typeof matchMedia !== 'function') return;
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    this.systemReduced.set(query.matches);
    const onChange = (): void => this.systemReduced.set(query.matches);
    query.addEventListener?.('change', onChange);
    this.destroyRef.onDestroy(() => query.removeEventListener?.('change', onChange));
  }

  private useOwner(ownerId: number | null): void {
    this.ownerId = ownerId;
    this.owner.set(ownerId);
    this.draft.set(null);
    this.saveError.set(null);
    this.saved.set(ownerId == null
      ? DEFAULT_SCENE_PREFERENCE
      : readScenePreference(browserSceneStorage(), ownerId));
  }
}
