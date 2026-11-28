import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, InjectionToken, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { UiButtonComponent } from '@vivek/ui';
import { fromEvent } from 'rxjs';
import { SceneAppearanceService } from '../platform/scene-appearance.service';
import { SessionService } from '../platform/session.service';
import { TownPlaceComponent, type PlaceCrumb } from './town-place.component';
import {
  failedReward,
  harborFinishBody,
  nextRewardAction,
  openedReward,
  openingReward,
  savingReward,
  settledReward,
  type RewardDraft,
} from './play-reward';
import { TownApiService } from './town.api';
import {
  RHYTHM_LANES,
  RHYTHM_SEED,
  RHYTHM_TICK_MS,
  accuracyOf,
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
  play(lane: number, volume?: number): void;
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
    play(lane: number, volume = 1): void {
      if (!(volume > 0)) return;
      if (typeof window === 'undefined' || typeof window.AudioContext !== 'function') return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const hz = LANE_HZ[lane];
      if (hz == null) return;
      const peak = Math.max(0.0002, 0.04 * Math.min(1, volume));
      if (!context || context.state === 'closed') context = new window.AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime;
      oscillator.type = 'sine';
      oscillator.frequency.value = hz;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.02);
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
  readonly reward: RewardDraft | null;
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
  private readonly api = inject(TownApiService);
  private ownerId: number | null = null;
  private generation = 0;
  private rewardRun = 0;
  private alive = true;

  readonly crumbs: readonly PlaceCrumb[] = [
    { label: 'Town', href: '/town' },
    { label: 'Harbor Rhythm' },
  ];
  protected readonly lanes = RHYTHM_LANES;
  readonly reduced = this.scene.reduced;
  private readonly clockOn = signal(false);
  private readonly view = signal<RhythmView>({ board: null, last: null, reward: null });
  protected readonly board = computed(() => this.view().board);
  protected readonly status = computed(() => rhythmStatus(this.view().board, this.view().last));
  protected readonly rewardNote = computed(() => this.view().reward?.note || null);
  protected readonly rewardFailed = computed(() =>
    this.view().board?.phase === 'complete' && this.view().reward?.phase === 'failed');
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
    effect(() => {
      if (this.reduced()) this.tones.stop();
    });
    this.session.user$.pipe(takeUntilDestroyed()).subscribe(user => this.useOwner(user?.id ?? null));
    this.session.cleared$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.generation += 1;
      this.rewardRun += 1;
      this.ownerId = null;
      this.silence();
      clearRhythmPlay(this.storage());
      this.view.set({ board: null, last: null, reward: null });
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
    this.scene.persist({ sound: target instanceof HTMLInputElement && target.checked });
  }

  protected play(mode: RhythmMode): void {
    const owner = this.ownerId;
    const generation = this.generation;
    if (owner == null || this.view().board) return;
    this.beginRun(startRhythm(mode), this.view().last, owner, generation);
    this.arm();
    this.focusLane(0);
  }

  protected retry(): void {
    const owner = this.ownerId;
    const generation = this.generation;
    if (owner == null) return;
    this.submitIfComplete(owner, generation, true);
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
    if (connected && rhythmToneAllowed(this.soundOn(), this.reduced())) this.tones.play(lane, this.scene.effective().volume);
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
    this.beginRun(restartRhythm(current.board), last, owner, generation);
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

  private publish(
    next: { board: RhythmBoard | null; last: RhythmResult | null; reward?: RewardDraft | null },
    owner: number,
    generation: number,
    submit: 'if-new' | 'no' = 'if-new',
  ): void {
    if (!this.owns(owner, generation)) return;
    const reward = next.reward === undefined ? this.view().reward : next.reward;
    const view: RhythmView = { board: next.board, last: next.last, reward };
    const became = view.board?.phase === 'complete' && this.view().board?.phase !== 'complete';
    const play: RhythmPlay = { ownerId: owner, board: view.board, last: view.last, reward };
    this.view.set(view);
    const storage = this.storage();
    try {
      writeRhythmPlay(storage, play);
    } catch {
      if (this.owns(owner, generation) && submit === 'if-new' && became) {
        this.submitIfComplete(owner, generation, false);
      }
      return;
    }
    if (!this.owns(owner, generation)) {
      storage?.removeItem(rhythmPlayKey(owner));
      return;
    }
    if (submit === 'if-new' && became) this.submitIfComplete(owner, generation, false);
  }

  private beginRun(board: RhythmBoard, last: RhythmResult | null, owner: number, generation: number): void {
    this.publish({ board, last, reward: openingReward(RHYTHM_SEED) }, owner, generation);
    this.requestOpen(owner, generation, board.mode);
  }

  private requestOpen(owner: number, generation: number, mode: RhythmBoard['mode']): void {
    this.rewardRun += 1;
    const run = this.rewardRun;
    this.api.openPlayRun({ game_id: 'harbor-rhythm', mode }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: view => this.acceptOpen(view, owner, generation, run),
      error: () => this.failOpen(owner, generation, run),
    });
  }

  private acceptOpen(view: unknown, owner: number, generation: number, run: number): void {
    if (!this.owns(owner, generation) || run !== this.rewardRun) return;
    const opened = openedReward(view, 'harbor-rhythm', RHYTHM_SEED);
    if (!opened) {
      this.failOpen(owner, generation, run);
      return;
    }
    const current = this.view();
    this.publish({ board: current.board, last: current.last, reward: opened }, owner, generation, 'no');
    if (current.board?.phase === 'complete') this.submitIfComplete(owner, generation, false);
  }

  private failOpen(owner: number, generation: number, run: number): void {
    if (!this.owns(owner, generation) || run !== this.rewardRun) return;
    const current = this.view();
    const show = current.board?.phase === 'complete';
    this.publish({
      board: current.board,
      last: current.last,
      reward: failedReward(current.reward, RHYTHM_SEED, show),
    }, owner, generation, 'no');
    if (show) this.focusNamed('Try the reward again');
  }

  private submitIfComplete(owner: number, generation: number, force: boolean): void {
    if (!this.owns(owner, generation)) return;
    const current = this.view();
    const board = current.board;
    if (!board || board.phase !== 'complete') return;
    const action = nextRewardAction(current.reward, force);
    if (action === 'open') this.requestOpen(owner, generation, board.mode);
    else if (action === 'finish') this.sendFinish(owner, generation);
  }

  private sendFinish(owner: number, generation: number): void {
    const current = this.view();
    const board = current.board;
    const nonce = current.reward?.nonce;
    if (!board || !nonce || !current.reward) return;
    const run = this.rewardRun;
    const score = accuracyOf(board) ?? 0;
    this.publish({ board, last: current.last, reward: savingReward(current.reward) }, owner, generation, 'no');
    this.api.finishPlayRun(nonce, harborFinishBody(board, RHYTHM_SEED)).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: view => this.acceptFinish(view, owner, generation, run, nonce, score),
      error: () => this.failFinish(owner, generation, run),
    });
  }

  private acceptFinish(
    view: unknown,
    owner: number,
    generation: number,
    run: number,
    nonce: string,
    score: number,
  ): void {
    if (!this.owns(owner, generation) || run !== this.rewardRun) return;
    const current = this.view();
    if (current.board && current.board.phase !== 'complete') return;
    if (current.board && (accuracyOf(current.board) ?? 0) !== score) {
      this.failFinish(owner, generation, run);
      return;
    }
    const settled = settledReward(view, 'harbor-rhythm', RHYTHM_SEED, nonce, score);
    if (!settled) {
      this.failFinish(owner, generation, run);
      return;
    }
    this.publish({ board: current.board, last: current.last, reward: settled }, owner, generation, 'no');
  }

  private failFinish(owner: number, generation: number, run: number): void {
    if (!this.owns(owner, generation) || run !== this.rewardRun) return;
    const current = this.view();
    if (current.board?.phase !== 'complete') return;
    this.publish({
      board: current.board,
      last: current.last,
      reward: failedReward(current.reward, RHYTHM_SEED, true),
    }, owner, generation, 'no');
    this.focusNamed('Try the reward again');
  }

  private useOwner(next: number | null): void {
    if (next === this.ownerId) return;
    this.generation += 1;
    this.rewardRun += 1;
    const previous = this.ownerId;
    this.ownerId = next;
    this.silence();
    const storage = this.storage();
    if (next == null) {
      if (previous != null) clearRhythmPlay(storage);
      this.view.set({ board: null, last: null, reward: null });
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
    this.view.set(saved
      ? { board: saved.board, last: saved.last, reward: saved.reward }
      : { board: null, last: null, reward: null });
    if (saved?.board?.phase === 'complete' && saved.reward?.phase !== 'rewarded' && saved.reward?.phase !== 'replay') {
      this.submitIfComplete(next, this.generation, true);
    }
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
