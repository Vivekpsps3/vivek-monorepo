import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, InjectionToken, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { UiButtonComponent } from '@vivek/ui';
import { fromEvent } from 'rxjs';
import { SceneAppearanceService } from '../platform/scene-appearance.service';
import { SessionService } from '../platform/session.service';
import { TownPlaceComponent, type PlaceCrumb } from './town-place.component';
import {
  RHYTHM_LANES,
  RHYTHM_TICK_MS,
  advanceRhythm,
  clearRhythmPlay,
  dueLane,
  finishedResult,
  laneFromKey,
  laneLabel,
  laneStep,
  noteTravel,
  pauseRhythm,
  playLane,
  readRhythmPlay,
  restartRhythm,
  resumeRhythm,
  rhythmPlayKey,
  rhythmPlayStorage,
  rhythmStatus,
  rhythmToneAllowed,
  startRhythm,
  writeRhythmPlay,
  type RhythmBoard,
  type RhythmMode,
  type RhythmPlay,
  type RhythmResult,
  type RhythmStorage,
} from './harbor-rhythm';

export interface RhythmScheduler {
  start(tick: () => void): void;
  stop(): void;
}

export interface RhythmTones {
  play(lane: number): void;
  stop(): void;
}

/** Lane pitches are original sine tones. Nothing here is a recording. */
const LANE_HZ = [523.25, 659.25, 783.99, 392] as const;

export function rhythmInterval(): RhythmScheduler {
  let timer: ReturnType<typeof setInterval> | null = null;
  const scheduler: RhythmScheduler = {
    start(tick: () => void): void {
      scheduler.stop();
      timer = setInterval(tick, RHYTHM_TICK_MS);
    },
    stop(): void {
      if (timer != null) clearInterval(timer);
      timer = null;
    },
  };
  return scheduler;
}

export function browserRhythmTones(): RhythmTones {
  let context: AudioContext | null = null;
  return {
    play(lane: number): void {
      if (typeof window === 'undefined' || typeof window.AudioContext !== 'function') return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const hz = LANE_HZ[lane];
      if (hz == null) return;
      if (!context || context.state === 'closed') context = new window.AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime;
      oscillator.type = 'sine';
      oscillator.frequency.value = hz;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.04, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.14);
    },
    stop(): void {
      const current = context;
      context = null;
      if (!current) return;
      void current.close().catch(() => undefined);
    },
  };
}

export const RHYTHM_SCHEDULER = new InjectionToken<RhythmScheduler>('RHYTHM_SCHEDULER');
export const RHYTHM_TONES = new InjectionToken<RhythmTones>('RHYTHM_TONES');

interface RhythmView {
  readonly board: RhythmBoard | null;
  readonly last: RhythmResult | null;
}

interface RhythmMarker {
  readonly index: number;
  readonly bottom: number;
}

@Component({
  selector: 'app-harbor-rhythm',
  imports: [TownPlaceComponent, UiButtonComponent],
  templateUrl: './harbor-rhythm.component.html',
  styleUrl: './harbor-rhythm.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HarborRhythmComponent {
  private readonly session = inject(SessionService);
  private readonly scene = inject(SceneAppearanceService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly scheduler = inject(RHYTHM_SCHEDULER, { optional: true }) ?? rhythmInterval();
  private readonly tones = inject(RHYTHM_TONES, { optional: true }) ?? browserRhythmTones();
  private ownerId: number | null = null;
  private generation = 0;
  private alive = true;

  readonly crumbs: readonly PlaceCrumb[] = [
    { label: 'Town', href: '/town' },
    { label: 'Harbor Rhythm' },
  ];
  protected readonly lanes = RHYTHM_LANES;
  readonly reduced = signal(false);
  private readonly clockOn = signal(false);
  private readonly view = signal<RhythmView>({ board: null, last: null });
  protected readonly board = computed(() => this.view().board);
  protected readonly status = computed(() => rhythmStatus(this.view().board, this.view().last));
  protected readonly soundOn = computed(() => this.scene.effective().sound);
  protected readonly soundError = computed(() => this.scene.saveError());
  protected readonly phase = computed(() => this.view().board?.phase ?? 'ready');
  protected readonly mode = computed(() => this.view().board?.mode ?? 'ready');
  protected readonly elapsed = computed(() => this.view().board?.elapsed ?? 0);
  protected readonly clock = computed(() => this.clockOn() ? 'on' : 'off');
  protected readonly due = computed(() => {
    const board = this.board();
    return board ? dueLane(board) : null;
  });
  protected readonly soundCopy = computed(() => {
    if (this.reduced()) return 'Reduced motion keeps original tones silent. Notes do not travel, and the untimed sequence has no clock. This game does not play recorded music.';
    if (this.soundOn()) return 'Original tones are on. A hit can play a short tone. This game does not play recorded music.';
    return 'Original tones are off. Turn them on to hear a short tone. This game does not play recorded music.';
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.alive = false;
      this.silence();
    });
    if (typeof matchMedia === 'function') {
      const query = matchMedia('(prefers-reduced-motion: reduce)');
      this.reduced.set(query.matches);
      const onChange = (): void => {
        this.reduced.set(query.matches);
        if (query.matches) this.tones.stop();
      };
      query.addEventListener('change', onChange);
      this.destroyRef.onDestroy(() => query.removeEventListener('change', onChange));
    }
    this.session.user$.pipe(takeUntilDestroyed()).subscribe(user => this.useOwner(user?.id ?? null));
    this.session.cleared$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.generation += 1;
      this.ownerId = null;
      this.silence();
      clearRhythmPlay(this.storage());
      this.view.set({ board: null, last: null });
    });
    if (typeof document !== 'undefined') {
      fromEvent(document, 'visibilitychange').pipe(takeUntilDestroyed()).subscribe(() => {
        if (document.visibilityState === 'hidden') {
          this.silence();
          this.pause();
        }
      });
    }
  }

  protected markers(lane: number): readonly RhythmMarker[] {
    const board = this.board();
    if (!board || board.mode !== 'timed' || this.reduced() || board.phase === 'complete') return [];
    const marks: RhythmMarker[] = [];
    board.notes.forEach((note, index) => {
      if (note.lane !== lane) return;
      const travel = noteTravel(note, board.elapsed);
      if (travel == null) return;
      marks.push({ index, bottom: 28 + travel * 50 });
    });
    return marks;
  }

  protected label(index: number): string {
    return laneLabel(index, this.due() === index);
  }

  protected setSound(event: Event): void {
    const target = event.target;
    this.scene.preview({ sound: target instanceof HTMLInputElement && target.checked });
    this.scene.save();
  }

  protected play(mode: RhythmMode): void {
    const owner = this.ownerId;
    const generation = this.generation;
    if (owner == null || this.view().board) return;
    this.publish({ board: startRhythm(mode), last: this.view().last }, owner, generation);
    this.arm();
    this.focusLane(0);
  }

  protected hit(lane: number): void {
    const owner = this.ownerId;
    const generation = this.generation;
    const current = this.view();
    if (owner == null || !current.board) return;
    const board = playLane(current.board, lane);
    if (board === current.board) return;
    const connected = board.notes.some((note, index) => note.result === 'hit' && current.board?.notes[index]?.result !== 'hit');
    const last = board.phase === 'complete' ? finishedResult(board) ?? current.last : current.last;
    this.publish({ board, last }, owner, generation);
    if (!this.owns(owner, generation)) return;
    if (connected && rhythmToneAllowed(this.soundOn(), this.reduced())) this.tones.play(lane);
    if (board.phase === 'complete') {
      this.silence();
      this.focusNamed('Restart');
    }
  }

  protected pause(): void {
    const owner = this.ownerId;
    const generation = this.generation;
    const current = this.view();
    if (owner == null || !current.board) return;
    const board = pauseRhythm(current.board);
    if (board === current.board) {
      this.silence();
      return;
    }
    this.publish({ board, last: current.last }, owner, generation);
    this.silence();
    this.focusNamed('Resume');
  }

  protected resume(): void {
    const owner = this.ownerId;
    const generation = this.generation;
    const current = this.view();
    if (owner == null || !current.board) return;
    const board = resumeRhythm(current.board);
    if (board === current.board) return;
    this.publish({ board, last: current.last }, owner, generation);
    this.arm();
    this.focusLane(dueLane(board) ?? 0);
  }

  protected restart(): void {
    const owner = this.ownerId;
    const generation = this.generation;
    const current = this.view();
    if (owner == null || !current.board) return;
    const last = current.board.phase === 'complete' ? finishedResult(current.board) ?? current.last : current.last;
    this.publish({ board: restartRhythm(current.board), last }, owner, generation);
    this.arm();
    this.focusLane(0);
  }

  protected quit(): void {
    const owner = this.ownerId;
    const generation = this.generation;
    const current = this.view();
    if (owner == null || !current.board) return;
    const last = current.board.phase === 'complete' ? finishedResult(current.board) ?? current.last : current.last;
    const name = last?.mode === 'untimed' || (last == null && this.reduced()) ? 'Play untimed sequence' : 'Play 30-second chart';
    this.silence();
    this.publish({ board: null, last }, owner, generation);
    this.focusNamed(name);
  }

  protected onLaneKey(event: KeyboardEvent, index: number): void {
    const board = this.view().board;
    if (!board || board.phase !== 'playing') return;
    const delta = laneStep(event.key);
    if (delta == null) return;
    const next = index + delta;
    if (next < 0 || next >= RHYTHM_LANES.length) return;
    event.preventDefault();
    this.focusLane(next);
  }

  onWorkspaceShortcut(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.repeat) return;
    const lane = laneFromKey(event.key);
    if (lane != null && this.view().board?.phase === 'playing') {
      event.preventDefault();
      this.hit(lane);
      return;
    }
    const key = event.key.toLowerCase();
    if (key === 'p') {
      event.preventDefault();
      const phase = this.view().board?.phase;
      if (phase === 'playing') this.pause();
      else if (phase === 'paused') this.resume();
      else if (!this.view().board) this.play(this.reduced() ? 'untimed' : 'timed');
      return;
    }
    if (key === 'r' && this.view().board) {
      event.preventDefault();
      this.restart();
      return;
    }
    if (key === 'q' && this.view().board) {
      event.preventDefault();
      this.quit();
    }
  }

  private tick(): void {
    const owner = this.ownerId;
    const generation = this.generation;
    const current = this.view();
    if (owner == null || !current.board || current.board.phase !== 'playing' || current.board.mode !== 'timed') {
      this.silence();
      return;
    }
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      this.pause();
      return;
    }
    const board = advanceRhythm(current.board, RHYTHM_TICK_MS);
    if (board === current.board) return;
    const last = board.phase === 'complete' ? finishedResult(board) ?? current.last : current.last;
    this.publish({ board, last }, owner, generation);
    if (!this.owns(owner, generation) || board.phase !== 'playing') {
      this.silence();
      if (board.phase === 'complete') this.focusNamed('Restart');
    }
  }

  private publish(next: RhythmView, owner: number, generation: number): void {
    if (!this.owns(owner, generation)) return;
    const play: RhythmPlay = { ownerId: owner, board: next.board, last: next.last };
    this.view.set(next);
    const storage = this.storage();
    try {
      writeRhythmPlay(storage, play);
    } catch {
      return;
    }
    if (!this.owns(owner, generation)) storage?.removeItem(rhythmPlayKey(owner));
  }

  private useOwner(next: number | null): void {
    if (next === this.ownerId) return;
    this.generation += 1;
    const previous = this.ownerId;
    this.ownerId = next;
    this.silence();
    const storage = this.storage();
    if (next == null) {
      if (previous != null) clearRhythmPlay(storage);
      this.view.set({ board: null, last: null });
      return;
    }
    const saved = readRhythmPlay(storage, next);
    if (previous != null) {
      try {
        clearRhythmPlay(storage);
        if (saved) writeRhythmPlay(storage, saved);
      } catch {
        /* The open chart stays on screen when this tab cannot store it. */
      }
    }
    this.view.set(saved ? { board: saved.board, last: saved.last } : { board: null, last: null });
    this.arm();
  }

  private owns(owner: number, generation: number): boolean {
    return this.alive
      && generation === this.generation
      && this.ownerId === owner
      && this.session.currentUser?.id === owner;
  }

  private storage(): RhythmStorage | null {
    return rhythmPlayStorage();
  }

  private arm(): void {
    const board = this.view().board;
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    if (!this.alive || hidden || !board || board.phase !== 'playing' || board.mode !== 'timed') {
      this.scheduler.stop();
      this.clockOn.set(false);
      return;
    }
    this.scheduler.start(() => this.tick());
    this.clockOn.set(true);
  }

  private silence(): void {
    this.scheduler.stop();
    this.tones.stop();
    this.clockOn.set(false);
  }

  private focusLane(index: number): void {
    const find = (): HTMLButtonElement | null => this.host.nativeElement.querySelector(`[data-lane="${index}"]`);
    const button = find();
    if (button && !button.disabled) {
      button.focus();
      return;
    }
    const generation = this.generation;
    requestAnimationFrame(() => {
      if (!this.alive || generation !== this.generation) return;
      const next = find();
      if (next && !next.disabled) next.focus();
    });
  }

  private focusNamed(name: string): void {
    const generation = this.generation;
    const attempt = (): void => {
      if (!this.alive || generation !== this.generation) return;
      const button = [...this.host.nativeElement.querySelectorAll('button')]
        .find(item => item.textContent?.trim() === name);
      button?.focus();
    };
    // The focused control is often removed in the same turn. A second frame
    // runs after the browser moves focus off that detached button.
    requestAnimationFrame(() => {
      attempt();
      requestAnimationFrame(attempt);
    });
  }
}
