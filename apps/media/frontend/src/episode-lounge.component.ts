import { HttpClient } from "@angular/common/http";
import {
  Component,
  DestroyRef,
  effect,
  ElementRef,
  HostListener,
  inject,
  input,
  output,
  signal,
  untracked,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { RouterLink } from "@angular/router";
import { formatDay } from "@vivek/browser";
import { SESSION_CONTEXT, UiButtonComponent, UiEmptyStateComponent } from "@vivek/ui";
import { Detail, errorCopy, MediaCard } from "./media.models";
import { NextEpisodeButtonComponent } from "./next-episode-button.component";
import { NextResult } from "./next-episode.service";
import {
  progressKey,
  progressKeyFromShow,
  seatingRows,
  seriesShelf,
  showContinuation,
} from "./theater.mjs";

interface OpenSeries {
  entryId: number;
  title: string;
  loading: boolean;
  ready: boolean;
  error: string;
  episodes: NonNullable<Detail["show"]>["episodes"];
  nextId: number | null;
}

@Component({
  selector: "media-episode-lounge",
  standalone: true,
  imports: [RouterLink, UiButtonComponent, UiEmptyStateComponent, NextEpisodeButtonComponent],
  styleUrl: "./episode-lounge.component.css",
  template: `<div class="episode-lounge">
    <section class="next-board" aria-labelledby="next-episode-board-heading">
      <h2 id="next-episode-board-heading" tabindex="-1">Next-episode board</h2>
      @if (items().length) {
        <div class="lounge-rows">
          @for (item of items(); track item.id) {
            <article
              class="lounge-row"
              [attr.data-entry]="item.id"
              [attr.data-progress]="shelf(item).progress"
              [attr.data-lifecycle]="shelf(item).lifecycle"
            >
              <h3>
                <a
                  [attr.data-media-item]="item.id"
                  [routerLink]="['/media/item', item.id]"
                  [state]="linkState()"
                  >{{ item.title }}</a
                >
              </h3>
              <p class="poster-fact">{{ shelf(item).fact }}</p>
              <p class="poster-lifecycle">{{ shelf(item).lifecycleLabel }}</p>
              @if (airLine(item); as air) {
                <p class="poster-air">{{ air }}</p>
              }
              <div class="board-actions">
                @if (offers(item)) {
                  <media-next-episode
                    [entryId]="item.id"
                    [episodeId]="episodeId(item)"
                    [season]="item.continuation?.season ?? 0"
                    [episode]="item.continuation?.episode ?? 0"
                    [showTitle]="item.title"
                    (done)="onMarked(item, $event)"
                    (failed)="failed.emit($event)"
                  />
                }
                <ui-button
                  variant="secondary"
                  [ariaLabel]="'Open seating for ' + item.title"
                  [ariaExpanded]="showing(item.id)"
                  ariaControls="seating-diagram"
                  (clicked)="openFrom(item, $event)"
                  >Open seating</ui-button
                >
              </div>
            </article>
          }
        </div>
      } @else {
        <ui-empty-state [title]="emptyTitle()" [message]="emptyMessage()">
          @if (filtered()) {
            <ui-button variant="ghost" (clicked)="clearFilters.emit()">Clear filters</ui-button>
          } @else {
            <ui-button variant="ghost" href="/media/library" label="All items" />
          }
          <ui-button variant="primary" href="/media/search" [queryParams]="searchParams()" label="Search Media" />
        </ui-empty-state>
      }
    </section>

    <section class="seating-diagram" id="seating-diagram" aria-labelledby="seating-diagram-heading">
      <h2 id="seating-diagram-heading" tabindex="-1">Seating diagram</h2>
      @if (shown(); as open) {
        <h3>{{ open.title }}</h3>
        @if (cardFor(open.entryId); as item) {
          <p class="poster-fact">{{ shelf(item).fact }}</p>
          <p class="poster-lifecycle">{{ shelf(item).lifecycleLabel }}</p>
        }
        @if (!open.ready) {
          @if (open.error) {
            <p class="lounge-error" role="alert">{{ open.error }}</p>
            <ui-button variant="secondary" (clicked)="retry()">Retry this series</ui-button>
          }
          @if (open.loading) {
            <p role="status">Loading saved episodes…</p>
          }
          <ui-button variant="ghost" (clicked)="close()">Close seating</ui-button>
        } @else {
          @if (open.error) {
            <p class="lounge-error" role="alert">{{ open.error }}</p>
            <ui-button variant="secondary" (clicked)="retry()">Retry this series</ui-button>
          }
          @if (rows(open).length) {
            @for (row of rows(open); track row.season) {
              <h4>{{ row.label }}</h4>
              <ol class="seat-row">
                @for (seat of row.seats; track seat.id) {
                  <li class="seat" [attr.data-seat]="seat.place" [attr.data-code]="seat.code">
                    <span class="seat-code">{{ seat.code }}</span>
                    <span class="seat-place">{{ seat.label }}</span>
                    @if (seat.place === "future" && seat.airDate) {
                      <span class="seat-date">Airs {{ dayLabel(seat.airDate) }}</span>
                    }
                    @if (seat.place === "watched" && seat.watchedOn) {
                      <span class="seat-date">{{ dayLabel(seat.watchedOn) }}</span>
                    }
                  </li>
                }
              </ol>
            }
          } @else {
            <p>No episodes saved for this series.</p>
          }
          <a [routerLink]="['/media/item', open.entryId]" [state]="linkState()">Open series entry</a>
          <ui-button variant="ghost" (clicked)="close()">Close seating</ui-button>
        }
      } @else {
        <p>Select a series to see its seats.</p>
      }
    </section>
    <div class="lounge-footer">
      <a class="lounge-calendar" routerLink="/media/calendar">See where these dates sit</a>
      <ui-button variant="ghost" href="/hub" label="Exit to Hub" />
    </div>
  </div>`,
})
export class EpisodeLoungeComponent {
  private readonly http = inject(HttpClient);
  private readonly session = inject(SESSION_CONTEXT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly ownerId = this.session.currentUser?.id ?? null;
  private alive = true;
  private readonly tokens = new Map<number, number>();
  private returnFocus: HTMLElement | null = null;
  private readonly paintedKey = signal("");
  readonly items = input.required<MediaCard[]>();
  readonly linkState = input<Record<string, unknown> | undefined>(undefined);
  readonly emptyTitle = input("");
  readonly emptyMessage = input("");
  readonly filtered = input(false);
  readonly advanced = output<{ result: NextResult & { entry?: Detail }; entryId: number }>();
  readonly failed = output<{ reload: boolean }>();
  readonly clearFilters = output<void>();
  private readonly opened = signal<OpenSeries | null>(null);

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.alive = false;
    });
    this.session.cleared$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.opened.set(null);
      this.returnFocus = null;
    });
    effect(() => {
      const open = this.opened();
      const items = this.items();
      const painted = this.paintedKey();
      if (!open?.ready) return;
      const item = items.find((row) => row.id === open.entryId);
      if (!item) return;
      const key = progressKey(item);
      if (key === painted) return;
      untracked(() => {
        if (!this.owns()) return;
        this.paintedKey.set(key);
        this.load(item, false);
      });
    });
  }

  shelf(item: MediaCard) {
    return seriesShelf(item);
  }

  offers(item: MediaCard): boolean {
    const shelf = seriesShelf(item);
    if (shelf.progress === "next" || shelf.progress === "upcoming") return true;
    return shelf.progress === "caught-up" && shelf.lifecycle !== "ended" && shelf.lifecycle !== "canceled";
  }

  episodeId(item: MediaCard): number | null {
    const row = showContinuation(item);
    return row && row.state === "next" ? row.episode_id : null;
  }

  airLine(item: MediaCard): string {
    const row = showContinuation(item);
    if (!row || row.state !== "upcoming") return "";
    if (!row.air_date) return "Air date not announced";
    const day = formatDay(row.air_date);
    return day ? `Airs ${day}` : "Air date not announced";
  }

  dayLabel(day: string | null): string {
    return day ? formatDay(day) : "";
  }

  rows(open: OpenSeries) {
    return seatingRows(open.episodes, open.nextId);
  }

  cardFor(id: number): MediaCard | undefined {
    return this.items().find((item) => item.id === id);
  }

  showing(id: number): boolean {
    return this.shown()?.entryId === id;
  }

  shown(): OpenSeries | null {
    const open = this.opened();
    if (!open) return null;
    return this.items().some((item) => item.id === open.entryId) ? open : null;
  }

  searchParams(): { kind: string } {
    return { kind: "tv" };
  }

  openFrom(item: MediaCard, event: Event): void {
    const host = event.currentTarget;
    const active = document.activeElement;
    const focus =
      host instanceof HTMLElement && active instanceof HTMLElement && host.contains(active)
        ? active
        : host instanceof HTMLElement
          ? (host.querySelector("button") ?? host)
          : null;
    this.open(item, focus);
  }

  open(item: MediaCard, focus: HTMLElement | null, force = false): void {
    if (!this.owns()) return;
    if (!force && this.opened()?.entryId === item.id) {
      this.close();
      return;
    }
    const previous = this.opened();
    if (previous && previous.entryId !== item.id) this.bump(previous.entryId);
    this.returnFocus = focus;
    this.paintedKey.set(progressKey(item));
    this.load(item, true);
  }

  retry(): void {
    const id = this.opened()?.entryId;
    const item = this.items().find((row) => row.id === id);
    if (!item) return;
    this.open(item, this.returnFocus, true);
  }

  close(): void {
    const open = this.opened();
    if (!open) return;
    this.bump(open.entryId);
    this.opened.set(null);
    const focus = this.returnFocus;
    this.returnFocus = null;
    focus?.focus({ preventScroll: true });
  }

  onMarked(item: MediaCard, result: NextResult & { entry?: Detail }): void {
    const show = result.entry?.show;
    if (show && this.opened()?.entryId === item.id) {
      this.bump(item.id);
      this.paintedKey.set(progressKeyFromShow(show));
      this.paint(item.id, item.title, show);
    }
    this.advanced.emit({ result, entryId: item.id });
  }

  @HostListener("document:keydown.escape")
  onEscape(): void {
    if (this.opened()) this.close();
  }

  private load(item: MediaCard, focusHeading: boolean): void {
    if (!this.owns()) return;
    const token = this.begin(item.id);
    const current = this.opened();
    if (!current || current.entryId !== item.id) {
      this.opened.set({
        entryId: item.id,
        title: item.title,
        loading: true,
        ready: false,
        error: "",
        episodes: [],
        nextId: null,
      });
    } else {
      this.opened.set({ ...current, title: item.title, loading: !current.ready, error: "" });
    }
    this.http
      .get<Detail>(`/media/api/entries/${item.id}`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detail) => {
          if (!this.accept(item.id, token)) return;
          if (this.opened()?.entryId !== item.id) return;
          const show = detail.show;
          if (!show) {
            this.opened.update((open) =>
              open && open.entryId === item.id
                ? { ...open, loading: false, ready: false, error: "This series has no saved episodes to seat." }
                : open,
            );
            if (focusHeading) this.focusHeading(item.id);
            return;
          }
          this.paint(item.id, detail.title || item.title, show);
          if (focusHeading) this.focusHeading(item.id);
        },
        error: (error) => {
          if (!this.accept(item.id, token)) return;
          this.opened.update((open) => {
            if (!open || open.entryId !== item.id) return open;
            return { ...open, loading: false, error: errorCopy(error) };
          });
          if (focusHeading) this.focusHeading(item.id);
        },
      });
  }

  private paint(id: number, title: string, show: NonNullable<Detail["show"]>): void {
    const open = this.opened();
    if (!open || open.entryId !== id) return;
    this.opened.set({
      entryId: id,
      title,
      loading: false,
      ready: true,
      error: "",
      episodes: show.episodes ?? [],
      nextId: show.next_episode?.id ?? null,
    });
  }

  private focusHeading(id: number): void {
    requestAnimationFrame(() => {
      if (!this.alive || this.opened()?.entryId !== id) return;
      this.host.nativeElement
        .querySelector<HTMLElement>("#seating-diagram-heading")
        ?.focus({ preventScroll: true });
    });
  }

  private owns(): boolean {
    return this.alive && this.session.currentUser?.id === this.ownerId;
  }

  private bump(id: number): number {
    const token = (this.tokens.get(id) ?? 0) + 1;
    this.tokens.set(id, token);
    return token;
  }

  private begin(id: number): number {
    return this.bump(id);
  }

  private accept(id: number, token: number): boolean {
    return this.owns() && this.tokens.get(id) === token;
  }
}
