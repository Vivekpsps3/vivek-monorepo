import {
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
} from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { RouterLink } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { formatDay } from "@vivek/browser";
import { MediaCardComponent } from "./media-card.component";
import { NextEpisodeButtonComponent } from "./next-episode-button.component";
import { NextResult } from "./next-episode.service";
import { NextEpisodeUndoService } from "./next-episode-undo.service";
import { episodeLabel } from "./next-episode.mjs";
import { MediaCard, LibraryResponse, NextEpisode, errorCopy } from "./media.models";
import {
  UiButtonComponent,
  UiCardComponent,
  UiPageHeaderComponent,
  UiEmptyStateComponent,
} from "@vivek/ui";
interface Summary {
  currently: MediaCard[];
  next_episodes: NextEpisode[];
  recent_reviews: {
    id: number;
    title: string;
    review_excerpt: string;
    rating: number | null;
  }[];
  upcoming: {
    id: number;
    title: string;
    when: string;
    release_on: string | null;
  }[];
  counts: {
    library: number;
  };
}
@Component({
  standalone: true,
  imports: [
    RouterLink,
    MediaCardComponent,
    NextEpisodeButtonComponent,
    UiButtonComponent,
    UiCardComponent,
    UiPageHeaderComponent,
    UiEmptyStateComponent,
  ],
  template: `<main class="page media-page">
    <ui-page-header title="Now" [concealTitle]="true">
      <ui-button
        uiPageActions
        variant="primary"
        href="/media/search"
        label="Find something new"
      />
    </ui-page-header>
    @if (error()) {
      <p class="local-error" role="alert">{{ error() }}</p>
      <ui-button variant="ghost" (click)="load()">Retry Now</ui-button>
    }
    @if (data(); as summary) {
      @if (!summary.counts.library) {
        <ui-empty-state
          title="A place for your favorites"
          message="Add a book, film, album, or anything you'd like to return to."
        >
          <ui-button
            variant="primary"
            href="/media/search"
            label="Start your library"
          />
        </ui-empty-state>
      } @else {
        <section>
          <h2 id="now-in-progress" tabindex="-1">In progress</h2>
          @if (summary.currently.length) {
            <div class="media-grid">
              @for (item of summary.currently; track item.id) {
                <media-card [item]="item">
                  @if (item.kind === "tv") {
                    <div mediaCardActions class="media-card-actions">
                      @if (nextLine(cardRow(item)); as line) {
                        <p class="next-line">{{ line }}</p>
                      }
                      <media-next-episode
                        [entryId]="item.id"
                        [episodeId]="cardEpisodeId(item)"
                        [season]="cardRow(item)?.season ?? 0"
                        [episode]="cardRow(item)?.episode ?? 0"
                        [showTitle]="item.title"
                        (done)="onNextDone($event, item.id)"
                        (failed)="onNextFailed($event)"
                      />
                    </div>
                  }
                </media-card>
              }
            </div>
          } @else {
            <p class="muted">
              Nothing in progress.
              <a routerLink="/media/library">Pick something from your library.</a>
            </p>
          }
        </section>
        @if (leftoverEpisodes(summary).length) {
          <section>
            <h2 id="now-next-episodes" tabindex="-1">Next episodes</h2>
            <ui-card>
              @for (episode of leftoverEpisodes(summary); track episode.episode_id) {
                <article class="episode-row">
                  <div>
                    <a [routerLink]="['/media/item', episode.entry_id]"
                      ><strong>{{ episode.show_title }}</strong></a
                    >
                    @if (nextLine(episode); as line) {
                      <p class="next-line">{{ line }}</p>
                    }
                    <media-next-episode
                      [entryId]="episode.entry_id"
                      [episodeId]="
                        episode.state === 'next' ? episode.episode_id : null
                      "
                      [season]="episode.season"
                      [episode]="episode.episode"
                      [showTitle]="episode.show_title"
                      (done)="onNextDone($event, episode.entry_id)"
                      (failed)="onNextFailed($event)"
                    />
                  </div>
                </article>
              }
            </ui-card>
          </section>
        }
        @if (favoritesError()) {
          <section>
            <h2>Favorites</h2>
            <p class="muted">
              Favorites didn't load.
              <ui-button variant="ghost" size="sm" (clicked)="loadFavorites()"
                >Retry</ui-button
              >
            </p>
          </section>
        } @else if (favorites(); as favoriteItems) {
          @if (favoriteItems.length) {
            <section>
              <h2>Favorites</h2>
              <div class="media-grid">
                @for (item of favoriteItems; track item.id) {
                  <media-card [item]="item" />
                }
              </div>
            </section>
          }
        }
        @if (summary.upcoming.length) {
          <ui-card>
            <h2>Looking forward to</h2>
            @for (item of summary.upcoming; track item.id) {
              <p>
                <a [routerLink]="['/media/item', item.id]">{{ item.title }}</a> ·
                {{ releaseDay(item.release_on) || "Date unknown" }}
              </p>
            }
          </ui-card>
        }
        @if (summary.recent_reviews.length) {
          <ui-card>
            <h2>Recent notes</h2>
            @for (review of summary.recent_reviews; track review.id) {
              <article>
                <h3>
                  <a [routerLink]="['/media/item', review.id]">{{
                    review.title
                  }}</a>
                </h3>
                <p>{{ review.review_excerpt }}</p>
              </article>
            }
          </ui-card>
        }
      }
    } @else {
      @if (!error()) {
        <p role="status">Loading your media…</p>
      }
    }
  </main>`,
})
export class NowComponent {
  private readonly http = inject(HttpClient);
  private readonly destroy = inject(DestroyRef);
  private readonly host = inject(ElementRef);
  readonly data = signal<Summary | null>(null);
  readonly error = signal("");
  readonly favorites = signal<MediaCard[] | null>(null);
  readonly favoritesError = signal(false);
  constructor() {
    inject(NextEpisodeUndoService).restored$
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe(() => this.reloadSummary());
    this.load();
  }
  load(): void {
    this.error.set("");
    this.http
      .get<Summary>("/media/api/summary")
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (d) => {
          this.data.set(d);
          if (d.counts.library > 0) this.loadFavorites();
        },
        error: (e) => this.error.set(errorCopy(e)),
      });
  }
  /** Silent refetch: the old data stays on screen until the new data arrives. */
  reloadSummary(): void {
    this.http
      .get<Summary>("/media/api/summary")
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (d) => {
          this.data.set(d);
          if (d.counts.library > 0) this.loadFavorites();
        },
        error: () => undefined,
      });
  }
  loadFavorites(): void {
    this.favoritesError.set(false);
    this.http
      .get<LibraryResponse>("/media/api/library", {
        params: { favorite: "true", sort: "rating", limit: "8" },
      })
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (r) => this.favorites.set(r.items),
        error: () => this.favoritesError.set(true),
      });
  }
  protected releaseDay(value: string | null): string {
    return value ? formatDay(value) : "";
  }
  protected cardRow(item: MediaCard): NextEpisode | undefined {
    return this.data()?.next_episodes.find((row) => row.entry_id === item.id);
  }
  protected cardEpisodeId(item: MediaCard): number | null {
    const row = this.cardRow(item);
    return row && row.state === "next" ? row.episode_id : null;
  }
  /** The "Next:" line for a row; empty when there is no row to describe. */
  protected nextLine(row: NextEpisode | undefined): string {
    if (!row) return "";
    const label = episodeLabel(row.season, row.episode);
    if (row.state === "upcoming") {
      return row.air_date
        ? `Next: ${label} · airs ${formatDay(row.air_date)}`
        : `Next: ${label} · air date not announced`;
    }
    let line = `Next: ${label}`;
    if (row.title) line += ` · ${row.title}`;
    if (row.air_date) line += ` · ${formatDay(row.air_date)}`;
    return line;
  }
  protected leftoverEpisodes(summary: Summary): NextEpisode[] {
    const inProgress = new Set(summary.currently.map((item) => item.id));
    return summary.next_episodes.filter((row) => !inProgress.has(row.entry_id));
  }
  protected onNextDone(result: NextResult, entryId: number): void {
    const summary = this.data();
    if (summary) {
      const previous = summary.next_episodes.find(
        (row) => row.entry_id === entryId,
      );
      const nextRow: NextEpisode | null = result.next
        ? {
            entry_id: entryId,
            episode_id: result.next.id,
            show_title:
              previous?.show_title ??
              summary.currently.find((item) => item.id === entryId)?.title ??
              "",
            season: result.next.season_number,
            episode: result.next.episode_number,
            title: result.next.title ?? "",
            air_date: result.next.air_date ?? "",
            state: result.next.released ? "next" : "upcoming",
          }
        : null;
      const rows = summary.next_episodes;
      const next_episodes = nextRow
        ? rows.some((row) => row.entry_id === entryId)
          ? rows.map((row) => (row.entry_id === entryId ? nextRow : row))
          : [...rows, nextRow]
        : rows.filter((row) => row.entry_id !== entryId);
      this.data.set({ ...summary, next_episodes });
    }
    this.focusShow(entryId);
  }
  protected onNextFailed(event: { reload: boolean }): void {
    if (event.reload) this.reloadSummary();
  }
  /** The host replaces the button after a mark; move focus to the show's title link. */
  private focusShow(entryId: number): void {
    requestAnimationFrame(() => {
      const host = this.host.nativeElement as HTMLElement;
      const link = host.querySelector<HTMLElement>(
        `a[href="/media/item/${entryId}"]`,
      );
      const fallback =
        host.querySelector<HTMLElement>("#now-next-episodes") ??
        host.querySelector<HTMLElement>("#now-in-progress");
      (link ?? fallback)?.focus();
    });
  }
}
