import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ToastService, UiButtonComponent } from "@vivek/ui";
import { episodeLabel, nextEpisodeError } from "./next-episode.mjs";
import { NextEpisodeService, NextResult } from "./next-episode.service";

let nextButtonId = 0;

@Component({
  selector: "media-next-episode",
  standalone: true,
  imports: [UiButtonComponent],
  template: `@if (episodeId() === null) {
    <p class="muted next-episode-wait">Waiting for the next episode</p>
  } @else {
    <ui-button
      variant="secondary"
      [size]="compact() ? 'sm' : 'md'"
      [busy]="busy()"
      [disabled]="busy()"
      [describedBy]="titleId"
      (clicked)="mark()"
    >
      <span aria-hidden="true">▶ </span>Watched {{ label() }}
    </ui-button>
    <span class="visually-hidden" [id]="titleId">{{ showTitle() }}</span>
    @if (error()) {
      <p class="next-episode-error" role="alert">{{ error() }}</p>
    }
  }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NextEpisodeButtonComponent {
  readonly entryId = input.required<number>();
  readonly episodeId = input.required<number | null>();
  readonly season = input(0);
  readonly episode = input(0);
  readonly showTitle = input("");
  readonly compact = input(false);

  readonly pending = output<void>();
  readonly done = output<NextResult>();
  readonly failed = output<{ reload: boolean }>();
  readonly undone = output<void>();

  protected readonly titleId = `next-episode-title-${++nextButtonId}`;
  protected readonly busy = signal(false);
  protected readonly error = signal("");

  private readonly service = inject(NextEpisodeService);
  private readonly toast = inject(ToastService);
  private readonly destroy = inject(DestroyRef);
  constructor() {
    // The inline error clears when the inputs change (a new next episode).
    effect(() => {
      void this.entryId();
      void this.episodeId();
      void this.season();
      void this.episode();
      untracked(() => this.error.set(""));
    });
  }

  protected label(): string {
    return episodeLabel(this.season(), this.episode());
  }

  protected mark(): void {
    const episodeId = this.episodeId();
    if (episodeId === null || this.busy()) return;
    this.error.set("");
    this.busy.set(true);
    this.pending.emit();
    this.service
      .markNext(this.entryId(), episodeId)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (result) => {
          this.busy.set(false);
          this.done.emit(result);
          const label = result.marked.label;
          this.toast.show(`Marked ${label} watched`, "success", undefined, {
            label: "Undo",
            run: () => this.undo(result),
          });
        },
        error: (e: { status?: number; error?: { detail?: unknown } }) => {
          this.busy.set(false);
          const mapped = nextEpisodeError(e?.status ?? 0, e?.error?.detail);
          this.error.set(mapped.message);
          this.failed.emit({ reload: mapped.reload });
        },
      });
  }

  private undo(result: NextResult): void {
    const label = result.marked.label;
    this.service
      .undo(this.entryId(), result.marked.episode_id)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: () => {
          this.undone.emit();
          this.toast.show(`${label} is next again.`);
        },
        error: () => {
          this.toast.show(`Couldn't undo. ${label} is still marked watched.`, "error");
        },
      });
  }
}
