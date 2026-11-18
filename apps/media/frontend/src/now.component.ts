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
import { finalize } from "rxjs";
import { formatDay } from "@vivek/browser";
import {
  SESSION_CONTEXT,
  UiButtonComponent,
  UiCardComponent,
  UiEmptyStateComponent,
  UiPageHeaderComponent,
} from "@vivek/ui";
import { MediaCardComponent } from "./media-card.component";
import { NextEpisodeButtonComponent } from "./next-episode-button.component";
import { NextResult } from "./next-episode.service";
import { NextEpisodeUndoService } from "./next-episode-undo.service";
import { episodeLabel } from "./next-episode.mjs";
import { releaseBand } from "./format.mjs";
import { showDay } from "./display";
import {
  Detail,
  LibraryResponse,
  MediaCard,
  NextEpisode,
  errorCopy,
} from "./media.models";
import {
  CalendarEvent,
  CalendarMonth,
  SavedCalendar,
  localMonth,
} from "./saved-calendar.service";
import { continuationFromShow, seriesShelf, showContinuation } from "./theater.mjs";

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

interface NextLine {
  season: number;
  episode: number;
  title?: string | null;
  air_date?: string | null;
  state: string;
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
  template: `<main class="page media-page" data-place="now">
    <ui-page-header title="Now" [concealTitle]="true">
      @if (data()?.counts?.library) {
        <ui-button
          variant="ghost"
          [ariaDisabled]="refreshing()"
          (clicked)="refreshReleases()"
        >
          {{ refreshing() ? "Refreshing releases…" : "Refresh release metadata" }}
        </ui-button>
      }
      <ui-button
        uiPageActions
        variant="primary"
        href="/media/search"
        label="Find something new"
      />
    </ui-page-header>
    @if (error()) {
      <p class="local-error" role="alert">{{ error() }}</p>
      <ui-button variant="ghost" (clicked)="load()">Retry Now</ui-button>
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
            <div class="media-grid now-progress">
              @for (item of summary.currently; track item.id) {
                <media-card
                  [item]="item"
                  [layout]="item.kind === 'movie' || item.kind === 'tv' ? 'poster' : 'row'"
                >
                  @if (showNext(item)) {
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
              @for (episode of leftoverEpisodes(summary); track episode.entry_id) {
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
                      [episodeId]="episode.state === 'next' ? episode.episode_id : null"
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
        <section>
          <h2 id="now-coming" tabindex="-1">Coming out</h2>
          @if (releasesError()) {
            <p class="local-error" role="alert">{{ releasesError() }}</p>
            <ui-button variant="ghost" (clicked)="loadCalendar(true)"
              >Retry releases</ui-button
            >
          }
          @if (releases(); as calendar) {
            @if (unconfigured(calendar); as missing) {
              <p role="status">{{ missing }}</p>
            }
            @if (calendar.partial) {
              <p role="status" class="local-error">
                Some release metadata is unavailable. Saved dates are still
                shown; refresh to check sources.
              </p>
            }
            @for (day of comingDays(calendar); track day.date) {
              <article class="release-row">
                <h3>{{ showDay(day.date) }}</h3>
                @for (event of day.events; track event.title + event.entry_id) {
                  <p class="release-band">
                    @if (event.entry_id) {
                      <a
                        class="release-link"
                        [routerLink]="['/media/item', event.entry_id]"
                        >{{ event.title }}</a
                      >
                    } @else {
                      {{ event.title }}
                    }
                    · {{ releaseBand(event) }}
                  </p>
                }
              </article>
            }
            @for (event of bandEvents(calendar); track event.title + event.entry_id) {
              <p class="release-band">
                @if (event.entry_id) {
                  <a
                    class="release-link"
                    [routerLink]="['/media/item', event.entry_id]"
                    >{{ event.title }}</a
                  >
                } @else {
                  {{ event.title }}
                }
                · {{ releaseBand(event) }}
              </p>
            }
            @if (comingEmpty(calendar)) {
              <p class="muted">Nothing coming out this month.</p>
            }
            <p>
              <a
                class="release-link"
                [routerLink]="['/media/calendar']"
                [queryParams]="{ month: calendar.month }"
                >See where these dates sit</a
              >
            </p>
          } @else if (!releasesError()) {
            <p role="status">Loading releases…</p>
          }
        </section>
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
  private readonly session = inject(SESSION_CONTEXT);
  private readonly saved = inject(SavedCalendar);
  private summaryEpoch = 0;
  private releaseFlight = 0;
  private ownerId = this.session.currentUser?.id ?? null;
  private releaseMonth = localMonth();
  readonly showDay = showDay;
  readonly releaseBand = releaseBand;
  readonly data = signal<Summary | null>(null);
  readonly error = signal("");
  readonly favorites = signal<MediaCard[] | null>(null);
  readonly favoritesError = signal(false);
  readonly releases = signal<CalendarMonth | null>(null);
  readonly releasesError = signal("");
  readonly refreshing = signal(false);

  constructor() {
    inject(NextEpisodeUndoService).restored$
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe(() => {
        this.saved.forget();
        this.reloadSummary();
      });
    this.session.cleared$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.summaryEpoch += 1;
      this.releaseFlight += 1;
      this.data.set(null);
      this.releases.set(null);
      this.favorites.set(null);
      this.refreshing.set(false);
    });
    this.session.user$.pipe(takeUntilDestroyed()).subscribe((user) => {
      const next = user?.id ?? null;
      if (next === this.ownerId) return;
      this.ownerId = next;
      this.summaryEpoch += 1;
      this.data.set(null);
      this.releases.set(null);
      this.favorites.set(null);
      if (next != null) this.load();
    });
    this.load();
  }

  load(): void {
    this.error.set("");
    const epoch = ++this.summaryEpoch;
    const owner = this.ownerId;
    this.http
      .get<Summary>("/media/api/summary")
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (summary) => this.publishSummary(summary, epoch, owner, true),
        error: (error: unknown) => {
          if (!this.owns(epoch, owner)) return;
          this.error.set(errorCopy(error));
        },
      });
  }

  /** Silent refetch: the old data stays on screen until the new data arrives. */
  reloadSummary(): void {
    const epoch = ++this.summaryEpoch;
    const owner = this.ownerId;
    this.http
      .get<Summary>("/media/api/summary")
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (summary) => this.publishSummary(summary, epoch, owner, false),
        error: () => undefined,
      });
  }

  loadFavorites(): void {
    this.favoritesError.set(false);
    const owner = this.ownerId;
    this.http
      .get<LibraryResponse>("/media/api/library", {
        params: { favorite: "true", sort: "rating", limit: "8" },
      })
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (response) => {
          if (owner !== this.ownerId) return;
          this.favorites.set(response.items);
        },
        error: () => {
          if (owner === this.ownerId) this.favoritesError.set(true);
        },
      });
  }

  loadCalendar(force = false): void {
    const month = this.releaseMonth || localMonth();
    this.releaseMonth = month;
    const owner = this.ownerId;
    this.releasesError.set("");
    this.saved
      .read(month, force)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (calendar) => {
          if (owner !== this.ownerId || this.releaseMonth !== month) return;
          this.releases.set(calendar);
        },
        error: (error: unknown) => {
          if (owner !== this.ownerId) return;
          this.releasesError.set(errorCopy(error));
        },
      });
  }

  refreshReleases(): void {
    const month = this.releaseMonth || localMonth();
    this.releaseMonth = month;
    const flight = ++this.releaseFlight;
    this.refreshing.set(true);
    this.releasesError.set("");
    this.saved
      .refresh(month)
      .pipe(
        finalize(() => {
          if (flight === this.releaseFlight) this.refreshing.set(false);
        }),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({
        next: (calendar) => {
          if (this.releaseMonth === month && this.ownerId === this.session.currentUser?.id) {
            this.releases.set(calendar);
          }
        },
        error: (error: unknown) => {
          if (this.releaseMonth === month) this.releasesError.set(errorCopy(error));
        },
      });
  }

  protected unconfigured(calendar: CalendarMonth): string {
    return calendar.unconfigured?.includes("tmdb")
      ? "TMDB is not configured. Saved release dates stay available."
      : "";
  }

  protected comingDays(calendar: CalendarMonth): CalendarMonth["days"] {
    return calendar.days.filter((day) => day.date >= calendar.today);
  }

  protected bandEvents(calendar: CalendarMonth): CalendarEvent[] {
    return [...calendar.month_band, ...calendar.year_band, ...calendar.unknown];
  }

  protected comingEmpty(calendar: CalendarMonth): boolean {
    return !this.comingDays(calendar).length && !this.bandEvents(calendar).length;
  }

  protected showNext(item: MediaCard): boolean {
    if (item.kind !== "tv") return false;
    const shelf = seriesShelf(item);
    if (shelf.progress === "next" || shelf.progress === "upcoming") return true;
    return (
      shelf.progress === "caught-up" &&
      shelf.lifecycle !== "ended" &&
      shelf.lifecycle !== "canceled"
    );
  }

  protected cardRow(item: MediaCard): NextEpisode | undefined {
    const continuation = showContinuation(item);
    if (continuation && (continuation.state === "next" || continuation.state === "upcoming")) {
      return {
        entry_id: item.id,
        episode_id: continuation.episode_id,
        show_title: item.title,
        season: continuation.season,
        episode: continuation.episode,
        title: continuation.title ?? "",
        air_date: continuation.air_date ?? "",
        state: continuation.state,
      };
    }
    return this.data()?.next_episodes.find((row) => row.entry_id === item.id);
  }

  protected cardEpisodeId(item: MediaCard): number | null {
    const row = this.cardRow(item);
    return row && row.state === "next" ? row.episode_id : null;
  }

  /** The "Next:" line for a row; empty when there is no row to describe. */
  protected nextLine(row: NextLine | undefined): string {
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

  protected onNextDone(result: NextResult & { entry?: Detail }, entryId: number): void {
    this.summaryEpoch += 1;
    const summary = this.data();
    const show = result.entry?.show;
    if (summary && show) {
      const continuation = continuationFromShow(show);
      const previous = summary.next_episodes.find((row) => row.entry_id === entryId);
      const currently = summary.currently.map((item) =>
        item.id === entryId
          ? {
              ...item,
              caught_up: show.caught_up,
              metadata_incomplete: show.metadata_incomplete,
              episode_count: show.episode_count,
              watched_count: show.watched_count,
              continuation,
            }
          : item,
      );
      const next_episodes = continuation
        ? summary.next_episodes.some((row) => row.entry_id === entryId)
          ? summary.next_episodes.map((row) =>
              row.entry_id === entryId
                ? {
                    entry_id: entryId,
                    episode_id: continuation.episode_id,
                    show_title:
                      previous?.show_title ??
                      summary.currently.find((item) => item.id === entryId)?.title ??
                      "",
                    season: continuation.season,
                    episode: continuation.episode,
                    title: continuation.title ?? "",
                    air_date: continuation.air_date ?? "",
                    state: continuation.state,
                  }
                : row,
            )
          : [
              ...summary.next_episodes,
              {
                entry_id: entryId,
                episode_id: continuation.episode_id,
                show_title: previous?.show_title ?? "",
                season: continuation.season,
                episode: continuation.episode,
                title: continuation.title ?? "",
                air_date: continuation.air_date ?? "",
                state: continuation.state,
              },
            ]
        : summary.next_episodes.filter((row) => row.entry_id !== entryId);
      this.data.set({ ...summary, currently, next_episodes });
    }
    this.saved.forget();
    this.focusShow(entryId);
  }

  protected onNextFailed(event: { reload: boolean }): void {
    if (event.reload) this.reloadSummary();
  }

  private publishSummary(summary: Summary, epoch: number, owner: number | null, loud: boolean): void {
    if (!this.owns(epoch, owner)) return;
    this.data.set(summary);
    if (!summary.counts.library) {
      this.releases.set(null);
      return;
    }
    if (loud || this.favorites() === null) this.loadFavorites();
    if (loud || this.releases() === null) this.loadCalendar();
  }

  private owns(epoch: number, owner: number | null): boolean {
    return epoch === this.summaryEpoch && owner === this.ownerId;
  }

  /** The host replaces the button after a mark; move focus to the show's title link. */
  private focusShow(entryId: number): void {
    requestAnimationFrame(() => {
      const host = this.host.nativeElement as HTMLElement;
      const link = host.querySelector<HTMLElement>(`a[data-media-item="${entryId}"]`);
      const fallback =
        host.querySelector<HTMLElement>("#now-next-episodes") ??
        host.querySelector<HTMLElement>("#now-in-progress");
      (link ?? fallback)?.focus();
    });
  }
}
