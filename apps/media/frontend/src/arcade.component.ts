import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { SESSION_CONTEXT, UiButtonComponent } from "@vivek/ui";
import {
  PLAY_TABLES,
  RHYTHM_LANES,
  RHYTHM_PATTERN,
  beginTable,
  clearArcadePlay,
  closeTable,
  memoryComplete,
  playMemory,
  playRhythm,
  readArcadePlay,
  restartTable,
  rhythmPrompt,
  tableUnopened,
  writeArcadePlay,
  type ArcadeSession,
  type ArcadeStorage,
  type MemoryCard,
} from "./arcade.mjs";

function browserStorage(): ArcadeStorage | null {
  try {
    return sessionStorage;
  } catch {
    return null;
  }
}

@Component({
  selector: "media-arcade-tables",
  standalone: true,
  imports: [UiButtonComponent],
  styleUrl: "./arcade.component.css",
  template: `<div class="arcade-tables">
    <h2 id="arcade-tables-heading">Play tables</h2>
    <p class="arcade-boundary">
      Memory Shelves and Harbor Rhythm are play tables. Starting one does not save a Media game.
    </p>
    <div class="table-row">
      @for (table of tables; track table.id) {
        <section
          class="play-table"
          [attr.data-table]="table.id"
          [attr.data-opened]="opened(table.id) ? 'true' : 'false'"
        >
          <h3 [id]="'play-table-' + table.id">{{ table.name }}</h3>
          @if (!active(table.id) && !opened(table.id)) {
            <p class="table-mark">Unopened</p>
            <p>No play has started.</p>
          } @else if (!active(table.id)) {
            <p class="table-mark">Started</p>
            <p>This session is not saved to the library.</p>
          }
          <ui-button
            variant="primary"
            [ariaExpanded]="active(table.id)"
            [ariaControls]="active(table.id) ? 'gameplay-' + table.id : undefined"
            (click)="toggle(table.id, $event)"
            >Play {{ table.name }}</ui-button
          >
          @if (active(table.id)) {
            <div class="gameplay" [id]="'gameplay-' + table.id">
              <h4 [id]="'gameplay-heading-' + table.id" tabindex="-1">{{ table.name }}</h4>
              @if (table.id === "memory") {
                <p role="status">{{ memoryNote() }}</p>
                <div class="memory-board">
                  @for (card of cards(); track card.index) {
                    <button
                      type="button"
                      class="shelf"
                      [attr.data-face]="card.face"
                      [attr.aria-label]="shelfLabel(card)"
                      (click)="flip(card.index)"
                    >
                      <span>{{ card.face === "down" ? card.index + 1 : card.symbol }}</span>
                      @if (card.face === "matched") {
                        <span class="shelf-state">matched</span>
                      }
                    </button>
                  }
                </div>
              } @else {
                <p role="status">{{ rhythmNote() }}</p>
                @if (rhythmMiss()) {
                  <p role="status">{{ rhythmMiss() }}</p>
                }
                <div class="lanes">
                  @for (lane of lanes; track lane; let index = $index) {
                    <button
                      type="button"
                      class="lane"
                      [attr.aria-current]="promptIndex() === index ? 'step' : null"
                      (click)="tap(index)"
                    >
                      <span>{{ lane }}</span>
                      @if (promptIndex() === index) {
                        <span class="lane-state">next</span>
                      }
                    </button>
                  }
                </div>
              }
              <div class="table-actions">
                <ui-button variant="secondary" (click)="restart(table.id)">Restart {{ table.name }}</ui-button>
                <ui-button variant="ghost" (click)="close()">Close {{ table.name }}</ui-button>
              </div>
            </div>
          }
        </section>
      }
    </div>
  </div>`,
})
export class ArcadeTablesComponent {
  private readonly session = inject(SESSION_CONTEXT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private ownerId: number | null = this.session.currentUser?.id ?? null;
  private alive = true;
  private returnFocus: HTMLElement | null = null;
  readonly tables = PLAY_TABLES;
  readonly lanes = RHYTHM_LANES;
  readonly play = signal<ArcadeSession | null>(null);

  constructor() {
    this.restore();
    this.destroyRef.onDestroy(() => {
      this.alive = false;
    });
    this.session.user$.pipe(takeUntilDestroyed()).subscribe((user) => {
      const next = user?.id ?? null;
      if (next === this.ownerId) return;
      this.ownerId = next;
      this.returnFocus = null;
      this.restore();
    });
    this.session.cleared$.pipe(takeUntilDestroyed()).subscribe(() => {
      clearArcadePlay(browserStorage());
      this.ownerId = null;
      this.play.set(null);
      this.returnFocus = null;
    });
  }

  opened(tableId: string): boolean {
    return !tableUnopened(this.play(), tableId);
  }

  active(tableId: string): boolean {
    return this.play()?.table === tableId;
  }

  cards(): MemoryCard[] {
    return this.play()?.memory?.cards ?? [];
  }

  shelfLabel(card: MemoryCard): string {
    const shelf = `Shelf ${card.index + 1}`;
    if (card.face === "down") return `${shelf}, face down`;
    if (card.face === "matched") return `${shelf}, ${card.symbol}, matched`;
    return `${shelf}, ${card.symbol}`;
  }

  memoryNote(): string {
    const board = this.play()?.table === "memory" ? this.play()?.memory : null;
    if (!board) return "";
    if (memoryComplete(board)) return "All pairs matched. This play is not saved.";
    if (board.moves > 0) return `Moves this session: ${board.moves}. This play is not saved.`;
    return "Turn two shelves. This play is not saved.";
  }

  rhythmNote(): string {
    const board = this.play()?.table === "rhythm" ? this.play()?.rhythm : null;
    if (!board) return "";
    if (board.done) return "Pattern complete. This play is not saved.";
    return `Play ${rhythmPrompt(board)}. This play is not saved.`;
  }

  rhythmMiss(): string {
    const board = this.play()?.table === "rhythm" ? this.play()?.rhythm : null;
    if (!board || board.misses < 1) return "";
    const latest = board.last === "miss" ? "That lane is not the next one. " : "";
    return `${latest}Misses this session: ${board.misses}.`;
  }

  promptIndex(): number {
    const board = this.play()?.table === "rhythm" ? this.play()?.rhythm : null;
    if (!board || board.done) return -1;
    const lane = RHYTHM_PATTERN[board.step];
    return typeof lane === "number" ? lane : -1;
  }

  toggle(tableId: string, event: Event): void {
    if (!this.owns()) return;
    const button = this.buttonFrom(event);
    this.returnFocus = button;
    if (this.play()?.table === tableId) {
      this.close();
      return;
    }
    this.commit(beginTable(this.ownerId, tableId, this.play()));
    this.focusHeading(tableId);
  }

  flip(index: number): void {
    if (!this.owns()) return;
    this.commit(playMemory(this.play(), this.ownerId, index));
  }

  tap(lane: number): void {
    if (!this.owns()) return;
    this.commit(playRhythm(this.play(), this.ownerId, lane));
  }

  restart(tableId: string): void {
    if (!this.owns()) return;
    this.commit(restartTable(this.play(), this.ownerId, tableId));
    this.focusHeading(tableId);
  }

  close(): void {
    if (!this.owns()) return;
    const current = this.play();
    if (!current?.table) return;
    this.commit(closeTable(current, this.ownerId));
    const focus = this.returnFocus;
    this.returnFocus = null;
    focus?.focus({ preventScroll: true });
  }

  @HostListener("keydown.escape")
  onEscape(): void {
    if (this.play()?.table) this.close();
  }

  private restore(): void {
    if (this.ownerId == null) {
      this.play.set(null);
      return;
    }
    this.play.set(readArcadePlay(browserStorage(), this.ownerId));
  }

  private commit(next: ArcadeSession | null): void {
    if (!this.owns() || !next || next.ownerId !== this.ownerId) return;
    this.play.set(next);
    writeArcadePlay(browserStorage(), next);
  }

  private owns(): boolean {
    return this.ownerId != null && this.session.currentUser?.id === this.ownerId;
  }

  private buttonFrom(event: Event): HTMLElement | null {
    const host = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    return host?.querySelector("button") ?? host;
  }

  private focusHeading(tableId: string): void {
    requestAnimationFrame(() => {
      if (!this.alive || this.play()?.table !== tableId) return;
      this.host.nativeElement
        .querySelector<HTMLElement>(`#gameplay-heading-${tableId}`)
        ?.focus({ preventScroll: true });
    });
  }
}
