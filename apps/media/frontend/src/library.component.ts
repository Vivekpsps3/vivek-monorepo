import { Component, DestroyRef, HostListener, inject, signal } from "@angular/core";
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
  of,
  switchMap,
  tap,
} from "rxjs";
import { MediaCardComponent } from "./media-card.component";
import {
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
  Detail,
  MediaCard,
} from "./media.models";
import {
  filterCount,
  filterLabel,
  isFiltered,
  readFilters,
  tagOptions,
  toQueryParams,
  type LibraryFilters,
} from "./library-filters.mjs";
@Component({
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    MediaCardComponent,
    UiButtonComponent,
    UiDialogComponent,
    UiFieldComponent,
    UiFieldControlDirective,
    UiPageHeaderComponent,
    UiEmptyStateComponent,
  ],
  styleUrl: "./library-filters.css",
  template: `<main class="page media-page">
    <ui-page-header
      title="Library"
      titleId="library-heading"
      [titleTabIndex]="-1"
      [concealTitle]="true"
    />
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
      <ui-field label="Type"
        ><select
          uiFieldControl
          [(ngModel)]="kind"
          (ngModelChange)="applySoon()"
        >
          <option value="">All types</option>
          @for (k of kinds; track k.value) {
            <option [value]="k.value">{{ k.label }}</option>
          }
        </select></ui-field
      >
      <ui-field label="State"
        ><select
          uiFieldControl
          [(ngModel)]="status"
          (ngModelChange)="applySoon()"
        >
          <option value="">All states</option>
          @for (s of states; track s) {
            <option [value]="s">{{ s.replace("_", " ") }}</option>
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
    @if (error()) {
      <div class="local-error" role="alert">
        {{ error() }}
        <ui-button variant="ghost" (click)="retry()">Retry library</ui-button>
      </div>
    }
    @if (loading()) {
      <p role="status">Loading your library…</p>
    }
    @if (data(); as library) {
      <p class="muted">
        {{ library.total }} saved {{ library.total === 1 ? "item" : "items" }}
      </p>
      <div class="media-grid" [attr.aria-busy]="refreshing()">
        @for (item of library.items; track item.id) {
          <section>
            <media-card [item]="item" />
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
                    <media-card [item]="child" />
                  } @empty {
                    @if (!childrenLoading() && !childrenError()) {
                      <p>No saved albums or songs for this artist.</p>
                    }
                  }
                  <a [routerLink]="['/media/item', item.id, 'discography']"
                    >Browse discography</a
                  >
                </div>
              }
            }
          </section>
        } @empty {
          <ui-empty-state
            [title]="
              filtered
                ? 'No saved items match these filters'
                : 'Your next favorite starts here'
            "
            [message]="
              filtered
                ? 'Try clearing a filter.'
                : 'Search for a title, follow an artist, or add something of your own.'
            "
          >
            @if (filtered) {
              <ui-button variant="ghost" (click)="clearAllFilters()">
                Clear filters
              </ui-button>
            }
            <ui-button
              variant="primary"
              href="/media/search"
              label="Search Media"
            />
          </ui-empty-state>
        }
      </div>
      <nav class="button-row" aria-label="Library pages">
        <ui-button
          variant="ghost"
          [disabled]="!offset || loading()"
          (click)="page(-1)"
        >
          Previous items</ui-button
        ><span
          >{{ library.total ? library.offset + 1 : 0 }}–{{
            library.offset + library.items.length
          }}
          of {{ library.total }}</span
        ><ui-button
          variant="ghost"
          [disabled]="!library.has_more || loading()"
          (click)="page(1)"
        >
          Next items
        </ui-button>
      </nav>
    }
  </main>`,
})
export class LibraryComponent {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);
  readonly reload = new BehaviorSubject(0);
  private restoredScroll =
    typeof history === "undefined"
      ? 0
      : Number(history.state?.mediaLibraryScroll) || 0;
  private scrollerReady = false;
  private restoring = false;
  private active = true;
  readonly kinds = kinds;
  readonly states = [
    "want",
    "anticipating",
    "in_progress",
    "completed",
    "paused",
    "dropped",
    "following",
    "unfollowed",
  ];
  q = "";
  kind = "";
  status = "";
  favorite = false;
  sort = "activity";
  tags: string[] = [];
  offset = 0;
  private filterTimer: ReturnType<typeof setTimeout> | undefined;
  readonly data = signal<LibraryResponse | null>(null);
  readonly error = signal("");
  readonly loading = signal(true);
  readonly refreshing = signal(false);
  readonly filtersOpen = signal(false);
  readonly availableTags = signal<string[]>([]);
  private currentFilters(): LibraryFilters {
    return {
      q: this.q,
      kind: this.kind,
      status: this.status,
      sort: this.sort,
      favorite: this.favorite,
      tags: this.tags,
    };
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
  /** True after Back until the next pointer or key gesture. A late select update in that gap is discarded. */
  private backPending = false;
  readonly expanded = signal<number | null>(null);
  readonly children = signal<MediaCard[]>([]);
  readonly childrenError = signal("");
  readonly childrenLoading = signal(false);
  constructor() {
    this.destroy.onDestroy(() => {
      this.active = false;
      clearTimeout(this.filterTimer);
    });
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (
        event instanceof NavigationStart &&
        event.navigationTrigger === "popstate"
      ) {
        clearTimeout(this.filterTimer);
        this.filterTimer = undefined;
        this.backPending = true;
        this.restoreFilters(event.url);
      }
      if (
        event instanceof NavigationStart &&
        event.navigationTrigger === "imperative"
      )
        history.replaceState(
          {
            ...history.state,
            mediaLibraryScroll: this.restoredScroll || window.scrollY,
          },
          "",
        );
      if (event instanceof Scroll) {
        this.scrollerReady = true;
        this.restoreScroll();
      }
    });
    combineLatest([this.route.queryParamMap, this.reload])
      .pipe(
        tap(([p]) => {
          const filters = readFilters(p);
          this.q = filters.q;
          this.kind = filters.kind;
          this.status = filters.status;
          this.sort = filters.sort;
          this.favorite = filters.favorite;
          this.tags = filters.tags;
          this.offset = Math.max(0, Number(p.get("offset")) || 0);
          this.expanded.set(Number(p.get("expanded")) || null);
          if (!this.data()) this.loading.set(true);
          this.refreshing.set(true);
          this.error.set("");
        }),
        switchMap(() => {
          let params = new HttpParams()
            .set("q", this.q)
            .set("kind", this.kind)
            .set("status", this.status)
            .set("sort", this.sort)
            .set("offset", this.offset)
            .set("limit", 24)
            .set("favorite", this.favorite);
          for (const tag of this.tags) params = params.append("tags", tag);
          return this.http
            .get<LibraryResponse>("/media/api/library", { params })
            .pipe(
              catchError((e) => {
                this.error.set(errorCopy(e));
                return of(null);
              }),
            );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((data) => {
        this.data.set(data);
        if (data?.available_tags) this.availableTags.set(data.available_tags);
        this.loading.set(false);
        this.refreshing.set(false);
        const expanded = data?.items.find(
          (item) => item.id === this.expanded(),
        );
        if (expanded) this.loadChildren(expanded);
        else this.restoreScroll();
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
      queryParams: toQueryParams(this.currentFilters()),
      onSameUrlNavigation: "reload",
    });
  }
  @HostListener("document:pointerdown")
  @HostListener("document:keydown")
  allowFilterEdits(): void {
    this.backPending = false;
  }

  applySoon(): void {
    // Back can win the race against the select's model update. That update is not a new edit.
    if (this.backPending) {
      this.restoreFilters(`${window.location.pathname}${window.location.search}`);
      return;
    }
    clearTimeout(this.filterTimer);
    this.filterTimer = setTimeout(() => this.applyNow(), 250);
  }

  private restoreFilters(url: string): void {
    const search = new URL(url, window.location.origin).searchParams;
    const filters = readFilters({
      get: (key: string) => search.get(key),
      getAll: (key: string) => search.getAll(key),
    });
    this.q = filters.q;
    this.kind = filters.kind;
    this.status = filters.status;
    this.sort = filters.sort;
    this.favorite = filters.favorite;
    this.tags = filters.tags;
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
    this.kind = "";
    this.status = "";
    this.favorite = false;
    this.tags = [];
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
    const top = this.restoredScroll;
    if (
      !top ||
      !this.scrollerReady ||
      this.loading() ||
      this.childrenLoading() ||
      this.restoring ||
      typeof window === "undefined"
    )
      return;
    this.restoring = true;
    const started = performance.now();
    const apply = () => {
      if (!this.active) return;
      const room = document.documentElement.scrollHeight - window.innerHeight;
      if (room + 1 < top && performance.now() - started < 1000) {
        requestAnimationFrame(apply);
        return;
      }
      this.restoredScroll = 0;
      this.restoring = false;
      window.scrollTo({ left: 0, top, behavior: "instant" });
    };
    requestAnimationFrame(apply);
  }
  private loadChildren(item: MediaCard): void {
    this.children.set([]);
    this.childrenError.set("");
    this.childrenLoading.set(true);
    this.http
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
}
