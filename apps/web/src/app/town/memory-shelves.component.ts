import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, InjectionToken, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { UiButtonComponent } from '@vivek/ui';
import { fromEvent } from 'rxjs';
import { SceneAppearanceService } from '../platform/scene-appearance.service';
import { SessionService } from '../platform/session.service';
import { playSceneTone } from './scene-sound';
import { TownPlaceComponent, type PlaceCrumb } from './town-place.component';
import {
  MEMORY_SEED,
  clearMemoryPlay,
  dealMemory,
  flipTile,
  matchToneAllowed,
  memoryPlayKey,
  memoryPlayStorage,
  memoryStatus,
  pauseBoard,
  readMemoryPlay,
  restartBoard,
  resumeBoard,
  shelfLabel,
  shelfStep,
  writeMemoryPlay,
  type MemoryBoard,
  type MemoryPlay,
  type MemoryStorage,
  type MemoryTile,
} from './memory-shelves';

export const MEMORY_MATCH_TONE = new InjectionToken<() => Promise<void>>('MEMORY_MATCH_TONE');

interface MemoryView {
  readonly board: MemoryBoard | null;
  readonly lastMoves: number | null;
}

@Component({
  selector: 'app-memory-shelves',
  imports: [TownPlaceComponent, UiButtonComponent],
  templateUrl: './memory-shelves.component.html',
  styleUrl: './memory-shelves.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MemoryShelvesComponent {
  private readonly session = inject(SessionService);
  private readonly scene = inject(SceneAppearanceService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly matchTone = inject(MEMORY_MATCH_TONE, { optional: true }) ?? playSceneTone;
  private ownerId: number | null = null;
  private generation = 0;
  private alive = true;

  readonly crumbs: readonly PlaceCrumb[] = [
    { label: 'Town', href: '/town' },
    { label: 'Memory Shelves' },
  ];
  readonly reduced = signal(false);
  private readonly focusIndex = signal(0);
  private readonly view = signal<MemoryView>({ board: null, lastMoves: null });
  protected readonly board = computed(() => this.view().board);
  protected readonly status = computed(() => memoryStatus(this.view().board, this.view().lastMoves));
  protected readonly soundOn = computed(() => this.scene.effective().sound);
  protected readonly phase = computed(() => this.view().board?.phase ?? 'ready');
  protected readonly tabStop = computed(() => {
    const board = this.board();
    if (board?.phase !== 'playing') return null;
    const eligible = board.tiles.filter(tile => tile.face !== 'matched');
    return eligible.find(tile => tile.index >= this.focusIndex())?.index ?? eligible[0]?.index ?? null;
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.alive = false;
    });
    if (typeof matchMedia === 'function') {
      const query = matchMedia('(prefers-reduced-motion: reduce)');
      this.reduced.set(query.matches);
      const onChange = (): void => this.reduced.set(query.matches);
      query.addEventListener('change', onChange);
      this.destroyRef.onDestroy(() => query.removeEventListener('change', onChange));
    }
    this.session.user$.pipe(takeUntilDestroyed()).subscribe(user => this.useOwner(user?.id ?? null));
    this.session.cleared$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.generation += 1;
      this.ownerId = null;
      this.focusIndex.set(0);
      clearMemoryPlay(this.storage());
      this.view.set({ board: null, lastMoves: null });
    });
    if (typeof document !== 'undefined') {
      fromEvent(document, 'visibilitychange').pipe(takeUntilDestroyed()).subscribe(() => {
        if (document.visibilityState === 'hidden') this.pause();
      });
    }
  }

  protected label(tile: MemoryTile): string {
    return shelfLabel(tile);
  }

  protected play(): void {
    const owner = this.ownerId;
    const generation = this.generation;
    if (owner == null || this.view().board) return;
    this.publish({ board: dealMemory(MEMORY_SEED), lastMoves: this.view().lastMoves }, owner, generation);
    this.focusShelf(0);
  }

  protected flip(index: number): void {
    const owner = this.ownerId;
    const generation = this.generation;
    const current = this.view();
    if (owner == null || !current.board) return;
    const board = flipTile(current.board, index);
    if (board === current.board) return;
    const matched = board.moves === current.board.moves + 1
      && board.open.length === 0
      && board.tiles.some((tile, tileIndex) => tile.face === 'matched' && current.board?.tiles[tileIndex]?.face !== 'matched');
    const lastMoves = board.phase === 'complete' ? board.moves : current.lastMoves;
    this.focusIndex.set(index);
    this.publish({ board, lastMoves }, owner, generation);
    if (!this.owns(owner, generation)) return;
    if (matched && matchToneAllowed(this.soundOn(), this.reduced())) {
      void this.matchTone().catch(() => undefined);
    }
    if (board.phase === 'complete') this.focusNamed('Restart');
    else if (matched) this.focusShelf();
  }

  protected pause(): void {
    const owner = this.ownerId;
    const generation = this.generation;
    const current = this.view();
    if (owner == null || !current.board) return;
    const board = pauseBoard(current.board);
    if (board === current.board) return;
    this.publish({ board, lastMoves: current.lastMoves }, owner, generation);
    this.focusNamed('Resume');
  }

  protected resume(): void {
    const owner = this.ownerId;
    const generation = this.generation;
    const current = this.view();
    if (owner == null || !current.board) return;
    const board = resumeBoard(current.board);
    if (board === current.board) return;
    this.publish({ board, lastMoves: current.lastMoves }, owner, generation);
    this.focusShelf();
  }

  protected restart(): void {
    const owner = this.ownerId;
    const generation = this.generation;
    const current = this.view();
    if (owner == null || !current.board) return;
    const finished = current.board.phase === 'complete' ? current.board.moves : current.lastMoves;
    this.publish({ board: restartBoard(current.board), lastMoves: finished }, owner, generation);
    this.focusShelf(0);
  }

  protected quit(): void {
    const owner = this.ownerId;
    const generation = this.generation;
    const current = this.view();
    if (owner == null || !current.board) return;
    const lastMoves = current.board.phase === 'complete' ? current.board.moves : current.lastMoves;
    this.publish({ board: null, lastMoves }, owner, generation);
    this.focusNamed('Play Memory Shelves');
  }

  protected onShelfKey(event: KeyboardEvent, index: number): void {
    const board = this.view().board;
    if (!board || board.phase !== 'playing' || !event.key.startsWith('Arrow')) return;
    const grid = (event.currentTarget as HTMLButtonElement | null)?.parentElement;
    // The grid can fit fewer shelves when its text is enlarged.
    const columns = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : undefined;
    const delta = shelfStep(event.key, columns);
    if (delta == null) return;
    event.preventDefault();
    for (let next = index + delta; next >= 0 && next < board.tiles.length; next += delta) {
      if (board.tiles[next]?.face === 'matched') continue;
      this.focusShelf(next);
      return;
    }
  }

  onWorkspaceShortcut(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.repeat) return;
    const key = event.key.toLowerCase();
    if (key === 'p') {
      event.preventDefault();
      const phase = this.view().board?.phase;
      if (phase === 'playing') this.pause();
      else if (phase === 'paused') this.resume();
      else if (!this.view().board) this.play();
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

  private publish(next: MemoryView, owner: number, generation: number): void {
    if (!this.owns(owner, generation)) return;
    const play: MemoryPlay = { ownerId: owner, board: next.board, lastMoves: next.lastMoves };
    this.view.set({ board: next.board, lastMoves: next.lastMoves });
    const storage = this.storage();
    try {
      writeMemoryPlay(storage, play);
    } catch {
      return;
    }
    // A write that switches owner has already replaced this view. Drop the old key.
    if (!this.owns(owner, generation)) storage?.removeItem(memoryPlayKey(owner));
  }

  private useOwner(next: number | null): void {
    if (next === this.ownerId) return;
    this.generation += 1;
    const previous = this.ownerId;
    this.ownerId = next;
    this.focusIndex.set(0);
    const storage = this.storage();
    if (next == null) {
      if (previous != null) clearMemoryPlay(storage);
      this.view.set({ board: null, lastMoves: null });
      return;
    }
    const saved = readMemoryPlay(storage, next);
    if (previous != null) {
      try {
        clearMemoryPlay(storage);
        if (saved) writeMemoryPlay(storage, saved);
      } catch {
        /* The saved board stays on screen when this tab cannot store it. */
      }
    }
    this.view.set(saved
      ? { board: saved.board, lastMoves: saved.lastMoves }
      : { board: null, lastMoves: null });
  }

  private owns(owner: number, generation: number): boolean {
    return this.alive
      && generation === this.generation
      && this.ownerId === owner
      && this.session.currentUser?.id === owner;
  }

  private storage(): MemoryStorage | null {
    return memoryPlayStorage();
  }

  private focusShelf(index = this.tabStop()): void {
    if (index == null) return;
    this.focusIndex.set(index);
    if (this.tabStop() !== index) return;
    const findShelf = (): HTMLButtonElement | null =>
      this.host.nativeElement.querySelector<HTMLButtonElement>(`[data-index="${index}"]`);
    const button = findShelf();
    if (button && !button.disabled) {
      button.focus();
      return;
    }
    const generation = this.generation;
    requestAnimationFrame(() => {
      if (!this.alive || generation !== this.generation || this.tabStop() !== index) return;
      findShelf()?.focus();
    });
  }

  private focusNamed(name: string): void {
    const generation = this.generation;
    requestAnimationFrame(() => {
      if (!this.alive || generation !== this.generation) return;
      const button = [...this.host.nativeElement.querySelectorAll('button')]
        .find(item => item.textContent?.trim() === name);
      button?.focus();
    });
  }
}
