import { Component, DestroyRef, ElementRef, inject, signal } from "@angular/core";
import { HttpClient, HttpParams } from "@angular/common/http";
import { FormsModule } from "@angular/forms";
import {
  ActivatedRoute,
  NavigationStart,
  Scroll,
  Router,
  RouterLink,
} from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  BehaviorSubject,
  combineLatest,
  catchError,
  EMPTY,
  map,
  of,
  switchMap,
  Subscription,
  tap,
} from "rxjs";
import { BookShelfComponent } from "./book-shelf.component";
import { EpisodeLoungeComponent } from "./episode-lounge.component";
import { ArcadeTablesComponent } from "./arcade.component";
import { GameCabinetComponent } from "./game-cabinet.component";
import { MusicRoomsComponent, MusicStageComponent } from "./music-bar.component";
import { TheaterComponent } from "./theater.component";
import { noteExcerpt } from "./books.mjs";
import { MediaCardComponent } from "./media-card.component";
import { NextResult } from "./next-episode.service";
import { NextEpisodeUndoService } from "./next-episode-undo.service";
import { continuationFromShow } from "./theater.mjs";
import {
  ReturnContext,
  SESSION_CONTEXT,
  UiButtonComponent,
  UiDialogComponent,
  UiEmptyStateComponent,
  UiFieldComponent,
  UiFieldControlDirective,
  UiPageHeaderComponent,
} from "@vivek/ui";
import {
  errorCopy,
  kinds,
  LibraryResponse,
  ArtistGroup,
  ArtistGroupPage,
  ArtistGroupSummary,
  Detail,
  MediaCard,
} from "./media.models";
import {
  collectionKey,
  collectionQuery,
  collectionSummary,
  emptyLibraryCopy,
  filterCount,
  filterLabel,
  isFiltered,
  libraryTransition,
  MUSIC_VIEWS,
  readFilters,
  statusChoices,
  tagOptions,
  toQueryParams,
  type LibraryFilters,
  type LibraryView,
} from "./library-filters.mjs";
const LIBRARY = "/media/library";

@Component({
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    BookShelfComponent,
    EpisodeLoungeComponent,
    ArcadeTablesComponent,
    GameCabinetComponent,
    MusicRoomsComponent,
    MusicStageComponent,
    TheaterComponent,
    MediaCardComponent,
    UiButtonComponent,
    UiDialogComponent,
    UiFieldComponent,
    UiFieldControlDirective,
    UiPageHeaderComponent,
    UiEmptyStateComponent,
  ],
  styleUrl: "./library-filters.css",
  template: `<main class="page media-page" [attr.data-collection]="collection">
    <ui-page-header
      [title]="heading"
      titleId="library-heading"
      [titleTabIndex]="-1"
      [concealTitle]="true"
    />
    <p class="collection-summary">{{ summary }}</p>
    @if (collection === "music") {
      <nav class="music-views" aria-label="Music views">
        @for (view of musicViews; track view.kind) {
          <a
            [routerLink]="['/media/library']"
            [queryParams]="viewParams(view.kind)"
            [attr.aria-current]="kind === view.kind ? 'page' : null"
            >{{ view.label }}</a
          >
        }
      </nav>
    }
    <div class="library-toolbar">
      <form class="library-search" role="search" (ngSubmit)="searchNow()">
        <label for="library-q" class="visually-hidden"
          >Search your library</label
        >
        <input
          id="library-q"
          type="search"
          name="q"
          [(ngModel)]="q"
          (ngModelChange)="searchSoon()"
          placeholder="Search your library"
          autocomplete="off"
        />
      </form>
      <button
        type="button"
        class="btn"
        aria-haspopup="dialog"
        aria-controls="library-filters"
        (click)="openFilters()"
      >
        {{ label }}
      </button>
    </div>
    <ui-dialog
      id="library-filters"
      [open]="filtersOpen()"
      labelledBy="filters-title"
      (closed)="closeFilters()"
    >
      <h2 id="filters-title">Filters</h2>
      <ui-field label="State"
        ><select
          uiFieldControl
          [(ngModel)]="status"
          (ngModelChange)="applySoon()"
        >
          <option value="">All states</option>
          @for (s of stateChoices; track s.value) {
            <option [value]="s.value">{{ s.label }}</option>
          }
        </select></ui-field
      >
      <ui-field label="Sort"
        ><select
          uiFieldControl
          [(ngModel)]="sort"
          (ngModelChange)="applySoon()"
        >
          <option value="activity">Recent</option>
          <option value="title">Title</option>
          <option value="added">Recently added</option>
          <option value="rating">Rating</option>
          <option value="release">Release</option>
        </select></ui-field
      ><label class="check-label"
        ><input
          type="checkbox"
          [(ngModel)]="favorite"
          (ngModelChange)="applySoon()"
        />Favorites only</label
      >
      <fieldset class="tags-fieldset">
        <legend>Tags</legend>
        @if (tagOptionsList.length) {
          <div class="tags-grid">
            @for (tag of tagOptionsList; track tag) {
              <label class="check-label"
                ><input
                  type="checkbox"
                  [checked]="tags.includes(tag)"
                  [disabled]="!tags.includes(tag) && tags.length >= 10"
                  (change)="toggleTag(tag, $any($event.target).checked)"
                />{{ tag }}</label
              >
            }
          </div>
          @if (tags.length >= 10) {
            <p class="muted">You can filter by up to 10 tags.</p>
          }
        } @else {
          <p class="muted">No tags yet. Add tags from an item's page.</p>
        }
      </fieldset>
      <div class="button-row">
        <button
          type="button"
          class="btn btn-ghost"
          [disabled]="!count"
          (click)="clearFilters()"
        >
          Clear filters
        </button>
        <button
          type="button"
          class="btn btn-primary"
          data-dialog-initial-focus
          (click)="closeFilters()"
        >
          Done
        </button>
      </div>
    </ui-dialog>
    @if (notice()) {
      <p class="collection-notice" role="status">{{ notice() }}</p>
    }
    @if (error()) {
      <div class="local-error" role="alert">
        {{ error() }}
        <ui-button variant="ghost" (click)="retry()">Retry library</ui-button>
      </div>
    }
    @if (loading()) {
      <p role="status">Loading your library…</p>
    }
    @if (collection === "game") {
      <media-arcade-tables />
    }
    @if (data(); as library) {
      <p class="muted library-count">
        @if (kind === "artist") {
          {{ library.total }} {{ library.total === 1 ? "artist" : "artists" }}
        } @else {
          {{ library.total }} saved {{ library.total === 1 ? "item" : "items" }}
        }
      </p>
      @if (collection === "music") {
        <media-music-rooms
          [kind]="kind"
          [groups]="visibleGroups()"
          [items]="library.items"
          [source]="source()"
          [expandedGroup]="expandedGroup()"
          [groupLoading]="groupLoading()"
          [groupError]="groupError()"
          [offPage]="offPageGroup()"
          [refreshing]="refreshing()"
          [filters]="currentFilters()"
          [emptyTitle]="emptyTitle"
          [emptyMessage]="emptyMessage"
          [filtered]="filtered"
          (expandGroup)="expandGroup($event)"
          (reloadGroup)="reloadGroup()"
          (clearFilters)="clearAllFilters()"
        />
      } @else if (collection === "book") {
        <media-book-shelf
          [items]="library.items"
          [status]="status"
          [face]="face"
          [query]="q"
          [sort]="sort"
          [favorite]="favorite"
          [tags]="tags"
          [offset]="offset"
          [emptyTitle]="emptyTitle"
          [emptyMessage]="emptyMessage"
          [filtered]="filtered"
          [linkState]="source()"
          (saved)="onBookSaved($event)"
          (clearFilters)="clearAllFilters()"
        />
      } @else if (collection === "game") {
        <nav class="game-bays" aria-label="Game cabinet">
          @for (sign of gameSigns; track sign.status) {
            <a
              [routerLink]="['/media/library']"
              [queryParams]="bayParams(sign.status)"
              [attr.aria-current]="status === sign.status ? 'page' : null"
              >{{ sign.label }}</a
            >
          }
        </nav>
        @if (library.items.length) {
          <media-game-cabinet
            [items]="library.items"
            [status]="status"
            [linkState]="source()"
            (saved)="onGameSaved($event)"
          />
        } @else {
          <ui-empty-state [title]="emptyTitle" [message]="emptyMessage">
            @if (filtered) {
              <ui-button variant="ghost" (click)="clearAllFilters()">
                Clear filters
              </ui-button>
            } @else if (kind) {
              <ui-button variant="ghost" href="/media/library" label="All items" />
            }
            <ui-button
              variant="primary"
              href="/media/search"
              [queryParams]="captureParams()"
              label="Search Media"
            />
          </ui-empty-state>
        }
      } @else if (collection === "movie") {
        <media-theater
          [items]="library.items"
          [query]="q"
          [status]="status"
          [sort]="sort"
          [favorite]="favorite"
          [tags]="tags"
          [linkState]="source()"
          [emptyTitle]="emptyTitle"
          [emptyMessage]="emptyMessage"
          [filtered]="filtered"
          (saved)="onFilmSaved($event)"
          (clearFilters)="clearAllFilters()"
        />
      } @else if (collection === "tv") {
        <media-episode-lounge
          [items]="library.items"
          [linkState]="source()"
          [emptyTitle]="emptyTitle"
          [emptyMessage]="emptyMessage"
          [filtered]="filtered"
          (advanced)="onShelfDone($event.result, $event.entryId)"
          (failed)="onShelfFailed($event)"
          (clearFilters)="clearAllFilters()"
        />
      } @else {
      <div
        class="media-grid"
        [attr.aria-busy]="refreshing()"
      >
        @for (item of library.items; track item.id) {
          <section>
            <media-card [item]="item" [source]="source()" />
            @if (item.kind === "artist") {
              <ui-button
                variant="ghost"
                size="sm"
                [ariaExpanded]="expanded() === item.id"
                [ariaControls]="'saved-' + item.id"
                (click)="expand(item)"
              >
                {{ expanded() === item.id ? "Hide" : "Show" }} saved albums and
                songs ({{ item.saved_count || 0 }})
              </ui-button>
              @if (expanded() === item.id) {
                <div [id]="'saved-' + item.id" class="saved-children">
                  @if (childrenLoading()) {
                    <p role="status">Loading saved music…</p>
                  }
                  @if (childrenError()) {
                    <p role="alert">{{ childrenError() }}</p>
                    <ui-button variant="ghost" (click)="expand(item, true)">
                      Retry saved music
                    </ui-button>
                  }
                  @for (child of children(); track child.id) {
                    <media-card [item]="child" [source]="source()" />
                  } @empty {
                    @if (!childrenLoading() && !childrenError()) {
                      <p>No saved albums or songs for this artist.</p>
                    }
                  }
                  <a [routerLink]="['/media/item', item.id, 'discography']" [state]="source()"
                    >Browse discography</a
                  >
                </div>
              }
            }
            @if (item.kind === "album" || item.kind === "track") {
              @for (group of item.artist_groups || []; track group.catalog_id) {
                <a
                  class="group-link"
                  [routerLink]="['/media/library']"
                  [queryParams]="artistGroupParams(group)"
                  >Show {{ group.title }}{{ group.followed ? "" : ", not followed" }} ({{
                    group.saved_count || 0
                  }})</a
                >
              }
            }
          </section>
        } @empty {
          <ui-empty-state [title]="emptyTitle" [message]="emptyMessage">
            @if (filtered) {
              <ui-button variant="ghost" (click)="clearAllFilters()">
                Clear filters
              </ui-button>
            } @else if (kind) {
              <ui-button variant="ghost" href="/media/library" label="All items" />
            }
            <ui-button
              variant="primary"
              href="/media/search"
              [queryParams]="captureParams()"
              label="Search Media"
            />
          </ui-empty-state>
        }
      </div>
      }
      <nav class="button-row" aria-label="Library pages">
        <ui-button
          variant="ghost"
          [disabled]="!offset || loading()"
          (click)="page(-1)"
        >
          Previous items</ui-button
        ><span
          >{{ library.total ? library.offset + 1 : 0 }}–{{ pageEnd() }} of
          {{ library.total }}</span
        ><ui-button
          variant="ghost"
          [disabled]="!library.has_more || loading()"
          (click)="page(1)"
        >
          Next items
        </ui-button>
      </nav>
    }
    @if (collection === "music") {
      <media-music-stage />
    }
  </main>`,
})
export class LibraryComponent {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);
  private readonly session = inject(SESSION_CONTEXT);
  private readonly shelfOwner = this.session.currentUser?.id ?? null;
  private progressEpoch = 0;
  private focusAfterLoad: number | null = null;
  readonly reload = new BehaviorSubject(0);
  private readonly context = inject(ReturnContext);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private restoredView = this.context.view(LIBRARY);
  private scrollerReady = false;
  private restoring = false;
  private active = true;
  source(): Record<string, unknown> {
    return this.context.link(LIBRARY);
  }
  readonly kinds = kinds;
  readonly musicViews = MUSIC_VIEWS;
  readonly gameSigns = [
    { status: "", label: "All bays" },
    { status: "in_progress", label: "Playing" },
    { status: "want", label: "Want to play" },
    { status: "completed", label: "Played" },
  ];
  readonly notice = signal("");
  private seen: LibraryView | null = null;
  q = "";
  kind = "";
  status = "";
  favorite = false;
  sort = "activity";
  tags: string[] = [];
  face: "spine" | "text" = "spine";
  offset = 0;
  private childrenRequest?: Subscription;
  private groupRequest?: Subscription;
  private filterTimer: ReturnType<typeof setTimeout> | undefined;
  readonly data = signal<LibraryResponse | null>(null);
  readonly error = signal("");
  readonly loading = signal(true);
  readonly refreshing = signal(false);
  readonly filtersOpen = signal(false);
  readonly availableTags = signal<string[]>([]);
  currentFilters(): LibraryFilters {
    return {
      q: this.q,
      kind: this.kind,
      status: this.status,
      sort: this.sort,
      favorite: this.favorite,
      tags: this.tags,
    };
  }
  get heading(): string {
    return this.kind === "artist"
      ? "Music"
      : kinds.find(item => item.value === this.kind)?.label || "Library";
  }
  get summary(): string {
    return collectionSummary(this.kind);
  }
  get collection(): string {
    return collectionKey(this.kind);
  }
  get stateChoices() {
    return statusChoices(this.kind);
  }
  get emptyTitle(): string {
    return emptyLibraryCopy(this.kind, this.filtered).title;
  }
  get emptyMessage(): string {
    return emptyLibraryCopy(this.kind, this.filtered).message;
  }
  viewParams(kind: string) {
    return collectionQuery(this.currentFilters(), kind);
  }
  captureParams(): { kind?: string } {
    return this.kind ? { kind: this.kind } : {};
  }
  bayParams(status: string) {
    return {
      ...collectionQuery(this.currentFilters(), "game"),
      status: status || null,
    };
  }
  onBookSaved(detail: Detail): void {
    if (
      !this.active ||
      this.session.currentUser?.id !== this.shelfOwner ||
      this.collection !== "book"
    ) {
      return;
    }
    const library = this.data();
    if (!library) return;
    const note = noteExcerpt(detail.review);
    this.data.set({
      ...library,
      items: library.items.map((item) =>
        item.id === detail.id
          ? {
              ...item,
              status: detail.status,
              progress_value: detail.progress_value,
              progress_unit: detail.progress_unit,
              progress_label: detail.progress_label ?? null,
              note,
            }
          : item,
      ),
    });
  }
  onGameSaved(detail: Detail): void {
    if (
      !this.active ||
      this.session.currentUser?.id !== this.shelfOwner ||
      this.collection !== "game"
    ) {
      return;
    }
    const library = this.data();
    if (!library) return;
    const note = noteExcerpt(detail.review);
    this.data.set({
      ...library,
      items: library.items.map((item) =>
        item.id === detail.id
          ? {
              ...item,
              status: detail.status,
              progress_value: detail.progress_value,
              progress_unit: detail.progress_unit,
              progress_label: detail.progress_label ?? null,
              rating: detail.rating,
              favorite: detail.favorite,
              note,
            }
          : item,
      ),
    });
  }
  get count(): number {
    return filterCount(this.currentFilters());
  }
  get label(): string {
    return filterLabel(this.count);
  }
  get filtered(): boolean {
    return isFiltered(this.currentFilters());
  }
  get tagOptionsList(): string[] {
    return tagOptions(this.availableTags(), this.tags);
  }
  readonly expanded = signal<number | null>(null);
  readonly children = signal<MediaCard[]>([]);
  readonly childrenError = signal("");
  readonly childrenLoading = signal(false);
  readonly expandedGroup = signal<number | null>(null);
  readonly artistGroups = signal<ArtistGroup[]>([]);
  readonly focusedGroup = signal<ArtistGroup | null>(null);
  readonly groupError = signal("");
  readonly groupLoading = signal(false);
  visibleGroups(): ArtistGroup[] {
    const page = this.artistGroups();
    const opened = this.focusedGroup();
    if (!opened || page.some((group) => group.catalog_id === opened.catalog_id)) return page;
    return [opened, ...page];
  }
  offPageGroup(): boolean {
    const groupId = this.expandedGroup();
    return groupId != null && !this.artistGroups().some((group) => group.catalog_id === groupId) && !this.focusedGroup();
  }
  pageEnd(): number {
    const shown = this.kind === "artist" ? this.artistGroups().length : this.data()?.items.length || 0;
    return this.offset + shown;
  }
  artistGroupParams(group: ArtistGroupSummary) {
    return { ...collectionQuery(this.currentFilters(), "artist"), group: group.catalog_id };
  }
  onFilmSaved(detail: Detail): void {
    if (
      !this.active ||
      this.session.currentUser?.id !== this.shelfOwner ||
      this.collection !== "movie"
    ) {
      return;
    }
    const library = this.data();
    if (!library) return;
    const note = noteExcerpt(detail.review);
    this.data.set({
      ...library,
      items: library.items.map((item) =>
        item.id === detail.id
          ? {
              ...item,
              status: detail.status,
              rating: detail.rating,
              favorite: detail.favorite,
              note,
              viewed_on: detail.viewed_on ?? null,
            }
          : item,
      ),
    });
  }
  onShelfDone(result: NextResult & { entry?: Detail }, entryId: number): void {
    if (!this.shelfCurrent()) return;
    const library = this.data();
    if (!library) return;
    this.progressEpoch += 1;
    const items = library.items.map((item) =>
      item.id === entryId ? this.advancedShow(item, result) : item,
    );
    this.data.set({ ...library, items });
    this.focusTitle(entryId);
  }
  onShelfFailed(event: { reload: boolean }): void {
    if (!this.shelfCurrent() || !event.reload) return;
    this.reload.next(this.reload.value + 1);
  }
  private shelfCurrent(): boolean {
    return (
      this.active &&
      this.shelfOwner != null &&
      this.session.currentUser?.id === this.shelfOwner &&
      this.collection === "tv"
    );
  }
  private advancedShow(item: MediaCard, result: NextResult & { entry?: Detail }): MediaCard {
    const show = result.entry?.show;
    if (!show) return item;
    return {
      ...item,
      caught_up: show.caught_up,
      metadata_incomplete: show.metadata_incomplete,
      episode_count: show.episode_count,
      watched_count: show.watched_count,
      continuation: continuationFromShow(show),
    };
  }
  private focusTitle(entryId: number): void {
    requestAnimationFrame(() => {
      if (!this.active) return;
      this.host.nativeElement
        .querySelector<HTMLElement>(`a[data-media-item="${entryId}"]`)
        ?.focus();
    });
  }
  constructor() {
    inject(NextEpisodeUndoService).restored$
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe((entryId) => {
        if (!this.shelfCurrent()) return;
        this.focusAfterLoad = entryId;
        this.reload.next(this.reload.value + 1);
      });
    // Router Back is deferred with setTimeout(0). A paused test clock does not
    // run that timer, so the URL changes while the State control keeps the
    // pending value. Sync from the browser URL in the popstate event itself.
    const onPopState = () => this.dropPendingFilters(true);
    window.addEventListener("popstate", onPopState);
    this.destroy.onDestroy(() => {
      this.active = false;
      clearTimeout(this.filterTimer);
      window.removeEventListener("popstate", onPopState);
    });
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (
        event instanceof NavigationStart &&
        event.navigationTrigger === "popstate"
      ) {
        this.dropPendingFilters(false);
      }
      if (
        event instanceof NavigationStart &&
        event.navigationTrigger === "imperative"
      ) {
        clearTimeout(this.filterTimer);
        this.filterTimer = undefined;
        const item = /^\/media\/item\/(\d+)(?:[/?#]|$)/.exec(event.url)?.[1] ?? null;
        if (!this.restoredView) this.context.saveView(LIBRARY, item);
      }
      if (event instanceof Scroll) {
        this.scrollerReady = true;
        this.restoreScroll();
      }
    });
    let requestedKind: string | undefined;
    let suppressRead = false;
    combineLatest([this.route.queryParamMap, this.reload])
      .pipe(
        tap(([p]) => {
          const filters = readFilters(p);
          const transition = libraryTransition(this.seen, filters);
          if (requestedKind !== filters.kind) {
            requestedKind = filters.kind;
            this.data.set(null);
            this.artistGroups.set([]);
            this.focusedGroup.set(null);
          }
          this.q = filters.q;
          this.kind = transition.kind;
          this.status = transition.status;
          this.sort = filters.sort;
          this.favorite = filters.favorite;
          this.tags = filters.tags;
          this.face = p.get("face") === "text" ? "text" : "spine";
          this.offset = Math.max(0, Number(p.get("offset")) || 0);
          const expanded = Number(p.get("expanded")) || null;
          if (expanded !== this.expanded()) {
            this.childrenRequest?.unsubscribe();
            this.children.set([]);
            this.childrenError.set("");
            this.childrenLoading.set(false);
          }
          this.expanded.set(expanded);
          const group = Number(p.get("group")) || null;
          if (group !== this.expandedGroup()) {
            this.groupRequest?.unsubscribe();
            this.focusedGroup.set(null);
            this.groupError.set("");
            this.groupLoading.set(false);
          }
          this.expandedGroup.set(group);
          if (transition.notice) this.notice.set(transition.notice);
          else if (
            transition.kindChange ||
            (filters.status !== "" && filters.status !== this.seen?.status)
          ) {
            this.notice.set("");
          }
          this.seen = { kind: transition.kind, status: transition.status };
          suppressRead = transition.redirect;
          if (transition.redirect) {
            void this.router.navigate([], {
              relativeTo: this.route,
              queryParams: { status: null },
              queryParamsHandling: "merge",
              replaceUrl: true,
            });
          }
          if (!this.data()) this.loading.set(true);
          this.refreshing.set(!suppressRead);
          this.error.set("");
        }),
        switchMap(() => {
          if (suppressRead) return EMPTY;
          const requested = this.kind;
          const epoch = this.progressEpoch;
          let params = new HttpParams()
            .set("q", this.q)
            .set("kind", this.kind)
            .set("status", this.status)
            .set("sort", this.sort)
            .set("offset", this.offset)
            .set("limit", 24)
            .set("favorite", this.favorite);
          for (const tag of this.tags) params = params.append("tags", tag);
          const url =
            requested === "artist" ? "/media/api/music-groups" : "/media/api/library";
          if (requested === "artist") params = params.delete("kind");
          return this.http.get<LibraryResponse | ArtistGroupPage>(url, { params }).pipe(
            map((body) => ({ requested, body, epoch })),
            catchError((e) => {
              if (this.kind === requested) this.error.set(errorCopy(e));
              return of({
                requested,
                body: null as LibraryResponse | ArtistGroupPage | null,
                epoch,
              });
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((result) => {
        if (!result || result.requested !== this.kind || result.epoch !== this.progressEpoch) {
          return;
        }
        const data = result.body;
        this.loading.set(false);
        this.refreshing.set(false);
        if (!data) {
          this.data.set(null);
          this.artistGroups.set([]);
          this.restoreScroll();
          return;
        }
        if (data.available_tags) this.availableTags.set(data.available_tags);
        if (result.requested === "artist") {
          const page = data as ArtistGroupPage;
          const items = page.items || [];
          this.artistGroups.set(items);
          this.data.set({
            items: [],
            total: page.total,
            offset: page.offset,
            limit: page.limit,
            has_more: page.has_more,
            available_tags: page.available_tags,
          });
          const groupId = this.expandedGroup();
          const visible = groupId != null && items.some((group) => group.catalog_id === groupId);
          if (groupId != null && !visible) this.loadGroup(groupId);
          else {
            this.focusedGroup.set(null);
            this.groupLoading.set(false);
            this.restoreScroll();
          }
          return;
        }
        const library = data as LibraryResponse;
        this.artistGroups.set([]);
        this.focusedGroup.set(null);
        this.data.set(library);
        if (this.focusAfterLoad != null) {
          const focusId = this.focusAfterLoad;
          this.focusAfterLoad = null;
          this.focusTitle(focusId);
        }
        const expanded = library.items.find((item) => item.id === this.expanded());
        if (expanded) this.loadChildren(expanded);
        if (!expanded) this.restoreScroll();
      });
  }
  retry(): void {
    document.getElementById("library-heading")?.focus();
    this.reload.next(this.reload.value + 1);
  }
  applyNow(): void {
    clearTimeout(this.filterTimer);
    this.filterTimer = undefined;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        ...toQueryParams(this.currentFilters()),
        face: this.collection === "book" && this.face === "text" ? "text" : null,
      },
      onSameUrlNavigation: "reload",
    });
  }
  applySoon(): void {
    clearTimeout(this.filterTimer);
    this.filterTimer = setTimeout(() => this.applyNow(), 250);
  }
  private dropPendingFilters(syncRouter: boolean): void {
    clearTimeout(this.filterTimer);
    this.filterTimer = undefined;
    const filters = readFilters(new URLSearchParams(window.location.search));
    const transition = libraryTransition(this.seen, filters);
    this.q = filters.q;
    this.kind = transition.kind;
    this.status = transition.status;
    this.sort = filters.sort;
    this.favorite = filters.favorite;
    this.tags = filters.tags;
    this.face = new URLSearchParams(window.location.search).get("face") === "text" ? "text" : "spine";
    const search = document.getElementById("library-q");
    if (search instanceof HTMLInputElement) search.value = filters.q;
    const root = document.getElementById("library-filters");
    const selects = root?.querySelectorAll("select");
    if (selects) {
      const [state, sort] = selects;
      if (state instanceof HTMLSelectElement) state.value = transition.status;
      if (sort instanceof HTMLSelectElement) sort.value = filters.sort;
    }
    const favorite = root?.querySelector('input[type="checkbox"]');
    if (favorite instanceof HTMLInputElement)
      favorite.checked = filters.favorite;
    if (!syncRouter) return;
    // The router applies Back on a paused timer. Follow the URL now so the
    // restored library read is not delayed until that timer runs.
    void this.router.navigateByUrl(
      `${window.location.pathname}${window.location.search}`,
      { skipLocationChange: true },
    );
  }
  searchSoon(): void {
    this.applySoon();
  }
  searchNow(): void {
    this.applyNow();
  }
  openFilters(): void {
    this.filtersOpen.set(true);
  }
  closeFilters(): void {
    if (this.filterTimer !== undefined) this.applyNow();
    this.filtersOpen.set(false);
  }
  clearFilters(): void {
    this.status = "";
    this.favorite = false;
    this.tags = [];
    this.notice.set("");
    this.applyNow();
  }
  clearAllFilters(): void {
    this.q = "";
    this.clearFilters();
  }
  toggleTag(tag: string, checked: boolean): void {
    this.tags = checked
      ? [...this.tags, tag]
      : this.tags.filter((t) => t !== tag);
    this.applySoon();
  }
  page(direction: number): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { offset: Math.max(0, this.offset + direction * 24) },
      queryParamsHandling: "merge",
    });
  }
  expandGroup(group: ArtistGroupSummary): void {
    const next = this.expandedGroup() === group.catalog_id ? null : group.catalog_id;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { group: next },
      queryParamsHandling: "merge",
      replaceUrl: true,
    });
  }
  reloadGroup(): void {
    const catalogId = this.expandedGroup();
    if (catalogId != null) this.loadGroup(catalogId);
  }
  expand(item: MediaCard, retry = false): void {
    if (retry) {
      this.loadChildren(item);
      return;
    }
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { expanded: this.expanded() === item.id ? null : item.id },
      queryParamsHandling: "merge",
      replaceUrl: true,
    });
  }
  private restoreScroll(): void {
    const view = this.restoredView;
    if (
      !view ||
      !this.scrollerReady ||
      this.loading() ||
      this.childrenLoading() ||
      this.groupLoading() ||
      this.restoring ||
      typeof window === "undefined"
    )
      return;
    this.restoring = true;
    const started = performance.now();
    const apply = () => {
      if (!this.active) return;
      const room = document.documentElement.scrollHeight - window.innerHeight;
      if (room + 1 < view.top && performance.now() - started < 1000) {
        requestAnimationFrame(apply);
        return;
      }
      this.restoredView = null;
      this.restoring = false;
      const heading = this.host.nativeElement.querySelector<HTMLElement>("#library-heading");
      if (view.focus && (document.activeElement === document.body || document.activeElement === heading)) {
        const target = this.host.nativeElement.querySelector<HTMLElement>(`[data-media-item="${view.focus}"]`);
        (target ?? heading)?.focus({ preventScroll: true });
      }
      window.scrollTo({ left: 0, top: view.top, behavior: "instant" });
    };
    requestAnimationFrame(apply);
  }
  private loadChildren(item: MediaCard): void {
    this.children.set([]);
    this.childrenError.set("");
    this.childrenLoading.set(true);
    this.childrenRequest?.unsubscribe();
    this.childrenRequest = this.http
      .get<Detail>("/media/api/entries/" + item.id)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (d) => {
          if (this.expanded() !== item.id) return;
          this.children.set(d.music?.saved_children || []);
          this.childrenLoading.set(false);
          this.restoreScroll();
        },
        error: (e) => {
          if (this.expanded() !== item.id) return;
          this.childrenError.set(errorCopy(e));
          this.childrenLoading.set(false);
          this.restoreScroll();
        },
      });
  }
  private focusOpenedGroup(catalogId: number): void {
    requestAnimationFrame(() => {
      if (!this.active || this.restoredView) return;
      const active = document.activeElement;
      if (active !== document.body && active?.id !== "library-heading") return;
      const section = this.host.nativeElement.querySelector<HTMLElement>(
        `[data-artist-group="${catalogId}"]`,
      );
      section?.querySelector<HTMLElement>("h2 a, .group-toggle button")?.focus({ preventScroll: true });
    });
  }
  private loadGroup(catalogId: number): void {
    this.focusedGroup.set(null);
    this.groupError.set("");
    this.groupLoading.set(true);
    this.groupRequest?.unsubscribe();
    this.groupRequest = this.http
      .get<ArtistGroup>("/media/api/music-groups/" + catalogId)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (payload) => {
          if (this.expandedGroup() !== catalogId || this.kind !== "artist") return;
          this.focusedGroup.set(payload);
          this.groupLoading.set(false);
          this.restoreScroll();
          this.focusOpenedGroup(catalogId);
        },
        error: (error) => {
          if (this.expandedGroup() !== catalogId || this.kind !== "artist") return;
          this.groupError.set(errorCopy(error));
          this.groupLoading.set(false);
          this.restoreScroll();
        },
      });
  }
}
