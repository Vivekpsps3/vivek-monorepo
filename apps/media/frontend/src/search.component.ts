import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  ViewChild,
  effect,
  inject,
  signal,
} from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, ParamMap, Router, RouterLink } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { catchError, of, switchMap, tap, Subject, debounceTime } from "rxjs";
import {
  SESSION_CONTEXT,
  ConfirmService,
  UiBadgeComponent,
  UiButtonComponent,
  UiCardComponent,
  UiEmptyStateComponent,
  UiFieldComponent,
  UiFieldControlDirective,
  UiIconComponent,
  UiPageHeaderComponent,
} from "@vivek/ui";
import {
  kinds,
  errorCopy,
  SearchResponse,
  SearchHit,
  Detail,
  Kind,
} from "./media.models";
import { PopularMoviesService } from "./popular-movies.service";
import { popularFocus, safeArt } from "./popular.mjs";
import {
  FIELD_ORDER,
  validateAdd,
  type AddErrors,
} from "./add-validate.mjs";
import {
  acceptCaptureResult,
  addQuery,
  captureParams,
  coverageText,
  kindLabel,
  retryOpen,
  selectedKind,
  type CoverageSource,
} from "./capture.mjs";

@Component({
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    UiButtonComponent,
    UiCardComponent,
    UiFieldComponent,
    UiFieldControlDirective,
    UiIconComponent,
    UiPageHeaderComponent,
    UiEmptyStateComponent,
    UiBadgeComponent,
  ],
  styles: `
    .required-legend {
      margin: 0 0 var(--space-3);
    }
    .field-error {
      display: flex;
      align-items: center;
      gap: var(--space-1);
      color: var(--danger);
      font-size: var(--text-sm);
      margin: var(--space-1) 0 var(--space-3);
    }
  `,
  template: `<main
    class="page media-page"
    [attr.data-capture]="manualEntry ? 'manual' : 'search'"
  >
    @if (manualEntry) {
      <a class="capture-back" routerLink="/media/search" [queryParams]="searchReturn()"
        >← Search</a
      >
      <ui-page-header title="Add manually" [concealTitle]="true" />
    } @else {
      <ui-page-header title="Search Media" [concealTitle]="true">
        <ui-button
          uiPageActions
          variant="ghost"
          href="/media/add"
          [queryParams]="manualLink()"
          label="Add manually"
        />
      </ui-page-header>
    }
    <p class="muted" id="capture-type-status" role="status">{{ typeStatus() }}</p>
    @if (!manualEntry) {
      <form class="media-filters" (ngSubmit)="search()">
        <ui-field label="Title or artist"
          ><input
            uiFieldControl
            type="search"
            name="query"
            [(ngModel)]="q"
            (ngModelChange)="typed.next()"
            placeholder="Try The Gentlemen"
            autocomplete="off" /></ui-field
        ><ui-field label="Type"
          ><select
            uiFieldControl
            id="add-kind"
            name="kind"
            [(ngModel)]="kind"
            (ngModelChange)="onKind()"
            [attr.aria-invalid]="errors()['kind'] ? true : null"
            [attr.aria-describedby]="errors()['kind'] ? 'add-kind-error' : null"
          >
            <option value="all">All types</option>
            @for (k of kinds; track k.value) {
              <option [value]="k.value">{{ k.label }}</option>
            }
          </select></ui-field
        >
        @if (errors()["kind"]) {
          <p class="field-error" id="add-kind-error">
            <ui-icon name="alert" size="sm" /> {{ errors()["kind"] }}
          </p>
        }
        <ui-button variant="primary" type="submit" [disabled]="q.trim().length < 2">
          Search
        </ui-button>
      </form>
    }
    <section class="provider-coverage" aria-labelledby="provider-coverage-heading">
      <h2 id="provider-coverage-heading">Provider coverage</h2>
      @if (coverageLoading()) {
        <p role="status">Checking which sources cover this type…</p>
      }
      @if (coverageError()) {
        <p role="status">{{ coverageError() }}</p>
      }
      <ul>
        @for (source of coverage(); track $index) {
          <li [attr.data-state]="source.state">{{ coverageLine(source) }}</li>
        }
      </ul>
    </section>
    @if (!manualEntry) {
      <section class="popular" aria-labelledby="popular-heading">
        <h2 id="popular-heading" tabindex="-1">Popular movies</h2>
        @if (popular.state() === "idle") {
          <ui-button variant="secondary" (click)="openPopular()">
            Popular
          </ui-button>
        }
        @if (popular.state() === "loading") {
          <div
            id="popular-status"
            class="popular-status"
            role="status"
            tabindex="-1"
          >
            Loading popular movies…
          </div>
          <div class="popular-skeletons" aria-hidden="true">
            @for (slot of popularSkeleton; track slot) {
              <div class="popular-skeleton"></div>
            }
          </div>
        }
        @if (popular.state() === "error") {
          <div class="local-error popular-error" role="alert">
            @if (popular.error()) {
              <p>{{ popular.error() }}</p>
            }
            <ui-button id="popular-retry" variant="ghost" (click)="retryPopular()">
              Retry popular
            </ui-button>
          </div>
        }
        @if (popular.state() === "ready" && popular.rows().length === 0) {
          <ui-empty-state
            title="No popular movies"
            message="The movie service returned nothing. Retry, or search for a title."
          >
            <ui-button
              id="popular-retry"
              variant="primary"
              (click)="retryPopular()"
            >
              Retry popular
            </ui-button>
          </ui-empty-state>
        }
        @if (popular.state() === "ready" && popular.rows().length) {
          <div class="popular-list">
            @for (
              item of popular.rows();
              track item.source + "|" + item.source_id
            ) {
              <article class="media-card popular-card">
                <div class="media-art">
                  @if (art(item.artwork_url); as src) {
                    <img
                      [src]="src"
                      alt=""
                      loading="lazy"
                      (error)="clearArt(item)"
                    />
                  } @else {
                    <span>{{ item.title.slice(0, 2).toUpperCase() }}</span>
                  }
                </div>
                <div class="media-card-copy">
                  <h3>{{ item.title }}</h3>
                  @if (item.year) {
                    <p class="muted">{{ item.year }}</p>
                  }
                  @if (item.already_saved && item.saved_id) {
                    <ui-button
                      variant="ghost"
                      [href]="'/media/item/' + item.saved_id"
                      label="Open saved item"
                    />
                  } @else {
                    <ui-button
                      variant="ghost"
                      [disabled]="popularBusy() === popularKey(item)"
                      (click)="addPopular(item)"
                    >
                      {{
                        popularBusy() === popularKey(item)
                          ? "Saving…"
                          : "Add to library"
                      }}
                    </ui-button>
                  }
                  @if (popularErrors()[popularKey(item)]) {
                    <p role="alert">
                      {{ popularErrors()[popularKey(item)] }}
                    </p>
                  }
                </div>
              </article>
            }
          </div>
        }
      </section>
      @if (loading()) {
        <p role="status">Searching sources…</p>
      }
      @if (error()) {
        <div class="local-error" role="alert">
          {{ error() }}
          @if (captureRetryOpen(searchRetries())) {
            <ui-button variant="ghost" (click)="search(true)">Retry search</ui-button>
          } @else {
            <p id="search-retry-limit" tabindex="-1">
              Search retry limit reached. Add the title manually. This page will not
              call the sources again for this search.
            </p>
          }
        </div>
      }
      @if (result(); as response) {
        @if (response.partial) {
          <div class="local-error" role="status">
            <strong>Search is incomplete.</strong> Some sources could not finish.
            Available matches are still shown.
            @if (captureRetryOpen(searchRetries())) {
              <ui-button variant="ghost" (click)="search(true)">
                Retry unavailable sources
              </ui-button>
            } @else {
              <p id="search-partial-limit" tabindex="-1">
                Search retry limit reached. Add the title manually. This page will not
                call the sources again for this search.
              </p>
            }
          </div>
        }
        <details class="source-details">
          <summary>
            Source coverage · {{ kind === "all" ? "all types" : kind }}
          </summary>
          @for (source of response.sources; track source.id) {
            <p>
              {{ source.id }} · {{ source.kinds.join(", ") }} ·
              {{ source.coverage }} · {{ source.state }}
              @if (source.reason) {
                — {{ source.reason }}
              }
              @if (source.cached) {
                · Cached
              }
            </p>
          }
        </details>
        <p class="muted">
          {{ response.total }} matches in this source window.
          @if (response.total) {
            Showing {{ response.offset + 1 }}–{{
              response.offset + response.results.length
            }}.
          }
        </p>
        <div class="search-results">
          @for (
            item of response.results;
            track item.source + ":" + item.source_id
          ) {
            <article class="media-card">
              <div class="media-art">
                @if (item.artwork_url) {
                  <img
                    [src]="item.artwork_url"
                    alt=""
                    loading="lazy"
                    (error)="item.artwork_url = null"
                  />
                } @else {
                  <span>{{ item.title.slice(0, 2).toUpperCase() }}</span>
                }
              </div>
              <div class="media-card-copy">
                <ui-badge>
                  {{ item.kind === "tv" ? "Series" : item.kind }}
                  @if (item.year) {
                    · {{ item.year }}
                  }
                </ui-badge>
                <h2>{{ item.title }}</h2>
                <p class="muted">
                  {{ item.creator }} · {{ item.source }} #{{ item.source_id }}
                </p>
                @if (item.extra?.lifecycle) {
                  <p>{{ item.extra?.lifecycle }}</p>
                }
                @if (item.metadata_pending) {
                  <p>Metadata is still pending. Saved item is editable.</p>
                }
                @if (item.already_saved) {
                  <ui-button
                    variant="ghost"
                    [href]="'/media/item/' + item.saved_id"
                    [label]="
                      'Open saved ' + (item.kind === 'artist' ? 'artist' : 'item')
                    "
                  />
                } @else {
                  <ui-button
                    variant="ghost"
                    [disabled]="saving() === item.source + item.source_id"
                    (click)="save(item)"
                  >
                    {{
                      saving() === item.source + item.source_id
                        ? "Saving…"
                        : item.kind === "artist"
                          ? "Follow artist"
                          : "Add to library"
                    }}
                  </ui-button>
                }
                @if (saveErrors()[item.source + item.source_id]) {
                  <p role="alert">
                    {{ saveErrors()[item.source + item.source_id] }}
                  </p>
                }
              </div>
            </article>
          } @empty {
            @if (!loading()) {
              <ui-empty-state
                [title]="
                  response.partial
                    ? 'Available sources returned no matches'
                    : 'No matching titles'
                "
                [message]="
                  response.partial
                    ? 'Retry the unavailable sources or add this title manually.'
                    : 'Try another spelling, a broader title, or another type.'
                "
              >
                <ui-button
                  variant="primary"
                  href="/media/add"
                  [queryParams]="manualLink()"
                  label="Add manually"
                />
              </ui-empty-state>
            }
          }
        </div>
        <div class="pagination">
          @if (response.offset > 0) {
            <ui-button variant="ghost" (click)="page(-20)">Previous</ui-button>
          }
          @if (response.has_more) {
            <ui-button variant="ghost" (click)="page(20)">More results</ui-button>
          }
        </div>
      }
      @if (!q.trim() && popular.state() === "idle") {
        <ui-empty-state
          title="What are you curious about?"
          message="Search movies, series, books, games, artists, albums, and songs."
        />
      }
    }
    <section
      class="capture-manual"
      [attr.aria-labelledby]="manualEntry ? null : 'manual-heading'"
    >
      @if (!manualEntry) {
        <h2 id="manual-heading">Add manually</h2>
      }
      <ui-card
        ><form class="media-form" #form="ngForm" novalidate (ngSubmit)="saveManual()">
          <p class="muted required-legend">
            <span aria-hidden="true">*</span> Required
          </p>
          <ui-field label="Title" [required]="true"
            ><input
              uiFieldControl
              required
              id="add-title"
              name="title"
              maxlength="300"
              [(ngModel)]="title"
              (ngModelChange)="revalidate()"
              [attr.aria-invalid]="errors()['title'] ? true : null"
              [attr.aria-describedby]="errors()['title'] ? 'add-title-error' : null"
          /></ui-field>
          @if (errors()["title"]) {
            <p class="field-error" id="add-title-error">
              <ui-icon name="alert" size="sm" /> {{ errors()["title"] }}
            </p>
          }
          @if (manualEntry) {
            <ui-field label="Type" [required]="true"
              ><select
                uiFieldControl
                required
                id="add-kind"
                name="kind"
                [(ngModel)]="kind"
                (ngModelChange)="onKind()"
                [attr.aria-invalid]="errors()['kind'] ? true : null"
                [attr.aria-describedby]="errors()['kind'] ? 'add-kind-error' : null"
              >
                <option value="all">All types</option>
                @for (k of kinds; track k.value) {
                  <option [value]="k.value">{{ k.label }}</option>
                }
              </select></ui-field
            >
            @if (errors()["kind"]) {
              <p class="field-error" id="add-kind-error">
                <ui-icon name="alert" size="sm" /> {{ errors()["kind"] }}
              </p>
            }
          }
          <details #optionalDetails>
            <summary>Optional details</summary>
            <ui-field label="Creator"
              ><input
                uiFieldControl
                name="creator"
                maxlength="300"
                [(ngModel)]="creator" /></ui-field
            ><ui-field label="Release year"
              ><input
                uiFieldControl
                type="number"
                min="1000"
                max="3000"
                id="add-year"
                name="year"
                [(ngModel)]="year"
                (ngModelChange)="revalidate()"
                [attr.aria-invalid]="errors()['year'] ? true : null"
                [attr.aria-describedby]="errors()['year'] ? 'add-year-error' : null"
            /></ui-field>
            @if (errors()["year"]) {
              <p class="field-error" id="add-year-error">
                <ui-icon name="alert" size="sm" /> {{ errors()["year"] }}
              </p>
            }
            <ui-field label="Note">
              <textarea
                uiFieldControl
                name="review"
                maxlength="20000"
                [(ngModel)]="review"
              ></textarea>
            </ui-field>
          </details>
          @if (manualError()) {
            <p class="local-error" role="alert">{{ manualError() }}</p>
          }
          <div class="button-row">
            <ui-button variant="primary" type="submit" [disabled]="busy()">
              {{
                busy()
                  ? "Adding…"
                  : kind === "artist"
                    ? "Follow artist"
                    : "Add to library"
              }}</ui-button
            ><a routerLink="/media/library">Cancel</a>
          </div>
        </form></ui-card
      >
    </section>
  </main>`,
})
export class SearchComponent {
  private readonly session = inject(SESSION_CONTEXT);
  private readonly ownerId = this.session.currentUser?.id;
  private get ownsSession(): boolean {
    return !!this.ownerId && this.ownerId === this.session.currentUser?.id;
  }
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);
  private readonly confirm = inject(ConfirmService);
  readonly kinds = kinds;
  readonly typed = new Subject<void>();
  readonly manualEntry = this.route.snapshot.routeConfig?.path === "add";
  readonly coverageLine = coverageText;
  readonly captureRetryOpen = retryOpen;
  q = "";
  kind = "all";
  title = "";
  creator = "";
  year: number | null = null;
  review = "";
  private offset = 0;
  private trackedQ = "";
  private trackedKind = "";
  private saveEpoch = 0;
  private draftEpoch = 0;
  private coverageEpoch = 0;
  private coverageKind = "";
  private saved = false;
  submitted = false;
  readonly result = signal<SearchResponse | null>(null);
  readonly loading = signal(false);
  readonly error = signal("");
  readonly manualError = signal("");
  readonly busy = signal(false);
  readonly errors = signal<AddErrors>({});
  readonly saving = signal("");
  readonly saveErrors = signal<Record<string, string>>({});
  readonly searchRetries = signal(0);
  readonly coverage = signal<CoverageSource[]>([]);
  readonly coverageLoading = signal(false);
  readonly coverageError = signal("");
  readonly popular = inject(PopularMoviesService);
  readonly popularBusy = signal("");
  readonly popularErrors = signal<Record<string, string>>({});
  readonly popularSkeleton = [1, 2, 3, 4];
  readonly art = safeArt;
  private readonly popularInflight = new Set<string>();
  private readonly popularAttempt = new Map<string, number>();
  private readonly saveInflight = new Set<string>();
  private focusTimer = 0;
  @ViewChild("optionalDetails")
  private optionalDetails?: ElementRef<HTMLDetailsElement>;
  constructor() {
    const initial = this.route.snapshot.queryParamMap;
    this.q = initial.get("q") || "";
    this.kind = selectedKind(initial.get("kind"), this.manualEntry);
    this.trackedQ = this.q;
    this.trackedKind = this.kind;
    this.offset = Number(initial.get("offset") || 0);
    this.title = this.manualEntry ? initial.get("title") || "" : "";
    let previous = this.popular.state();
    effect(() => {
      const state = this.popular.state();
      const count = this.popular.rows().length;
      const target = popularFocus(previous, state, count);
      previous = state;
      if (target) this.focusSoon(target);
    });
    this.destroy.onDestroy(() => window.clearTimeout(this.focusTimer));
    this.session.cleared$.pipe(takeUntilDestroyed()).subscribe(() => this.clearDraft());
    this.typed
      .pipe(debounceTime(350), takeUntilDestroyed())
      .subscribe(() => this.search());
    this.route.queryParamMap
      .pipe(
        tap((params) => this.syncQuery(params)),
        switchMap((params) =>
          this.manualEntry || this.q.trim().length < 2
            ? of(null)
            : this.http
                .get<SearchResponse>("/media/api/search", {
                  params: {
                    q: this.q,
                    kind: this.kind,
                    offset: this.offset,
                    limit: 20,
                    retry: params.get("retry") ? "true" : "false",
                  },
                })
                .pipe(
                  catchError((failure) => {
                    this.error.set(errorCopy(failure));
                    return of(null);
                  }),
                ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((response) => {
        if (response) this.result.set(response);
        this.loading.set(false);
        if (!retryOpen(this.searchRetries()) && (this.error() || response?.partial)) {
          this.focusSoon(this.error() ? "search-retry-limit" : "search-partial-limit");
        }
      });
  }
  typeStatus(): string {
    if (this.kind === "all") {
      return "All types. Choose a type to keep a manual item in one collection.";
    }
    return (
      "This capture stays on " +
      kindLabel(this.kind) +
      ". Change type only with the Type field."
    );
  }
  manualLink(): { title?: string; kind?: string } {
    return addQuery(this.q, this.kind);
  }
  searchReturn(): { kind?: string; q?: string } {
    const params = captureParams(this.kind);
    const query = this.q.trim();
    return query ? { ...params, q: query } : params;
  }
  onKind(): void {
    this.revalidate();
    const shown = this.route.snapshot.queryParamMap.get("kind");
    if (this.kind === selectedKind(shown, this.manualEntry)) return;
    if (this.manualEntry) {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { kind: this.kind },
        queryParamsHandling: "merge",
      });
      return;
    }
    this.search();
  }
  search(retry = false): void {
    if (this.manualEntry) return;
    if (retry && !retryOpen(this.searchRetries())) return;
    if (retry) this.searchRetries.update((used) => used + 1);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        q: this.q.trim() || null,
        kind: this.kind,
        offset: 0,
        retry: retry ? Date.now() : null,
      },
      onSameUrlNavigation: "reload",
    });
  }
  page(delta: number): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParamsHandling: "merge",
      queryParams: { offset: Math.max(0, this.offset + delta), retry: null },
    });
  }
  openPopular(): void {
    this.popular.load();
  }
  retryPopular(): void {
    this.popular.retry();
  }
  popularKey(item: SearchHit): string {
    return item.source + "|" + item.source_id;
  }
  clearArt(item: SearchHit): void {
    item.artwork_url = null;
  }
  addPopular(item: SearchHit): void {
    const key = this.popularKey(item);
    if (item.already_saved || this.popularInflight.has(key)) return;
    const attempt = (this.popularAttempt.get(key) ?? 0) + 1;
    const epoch = this.saveEpoch;
    this.popularAttempt.set(key, attempt);
    this.popularInflight.add(key);
    this.popularBusy.set(key);
    this.popularErrors.update((errors) => ({ ...errors, [key]: "" }));
    this.http
      .post<Detail>("/media/api/library/from-provider", {
        source: item.source,
        source_id: item.source_id,
        kind: item.kind,
        title: item.title,
      })
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (detail) => {
          if (this.popularAttempt.get(key) !== attempt) return;
          if (!acceptCaptureResult(epoch, this.saveEpoch, this.ownsSession)) {
            this.finishPopular(key, "");
            return;
          }
          this.popular.markSaved(key, detail.id);
          this.finishPopular(key, "");
        },
        error: (failure) => {
          if (this.popularAttempt.get(key) !== attempt) return;
          if (!acceptCaptureResult(epoch, this.saveEpoch, this.ownsSession)) {
            this.finishPopular(key, "");
            return;
          }
          this.finishPopular(key, errorCopy(failure));
        },
      });
  }
  save(item: SearchHit): void {
    const key = item.source + item.source_id;
    if (item.already_saved || this.saveInflight.has(key)) return;
    const epoch = this.saveEpoch;
    this.saveInflight.add(key);
    this.saving.set(key);
    this.saveErrors.update((current) => ({ ...current, [key]: "" }));
    this.http
      .post<Detail>("/media/api/library/from-provider", {
        source: item.source,
        source_id: item.source_id,
        kind: item.kind,
        title: item.title,
      })
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (detail) => {
          this.saveInflight.delete(key);
          if (this.saving() === key) this.saving.set("");
          if (!acceptCaptureResult(epoch, this.saveEpoch, this.ownsSession)) return;
          item.already_saved = true;
          item.saved_id = detail.id;
          item.metadata_pending = detail.catalog?.extra?.["metadata_pending"] === true;
          this.result.update((current) => (current ? { ...current } : current));
        },
        error: (failure) => {
          this.saveInflight.delete(key);
          if (this.saving() === key) this.saving.set("");
          if (!acceptCaptureResult(epoch, this.saveEpoch, this.ownsSession)) return;
          this.saveErrors.update((current) => ({
            ...current,
            [key]: errorCopy(failure),
          }));
        },
      });
  }
  revalidate(): void {
    if (this.submitted) {
      this.errors.set(
        validateAdd({ title: this.title, kind: this.kind, year: this.year }),
      );
    }
  }
  focusFirstInvalid(): void {
    const current = this.errors();
    for (const key of FIELD_ORDER) {
      if (!current[key as keyof AddErrors]) continue;
      if (key === "year" && this.optionalDetails) {
        this.optionalDetails.nativeElement.open = true;
      }
      document.getElementById("add-" + key)?.focus();
      return;
    }
  }
  canLeave(): boolean | Promise<boolean> {
    return (
      !this.ownsSession ||
      this.saved ||
      !(this.title || this.creator || this.review) ||
      this.confirm.ask(
        "Leave this draft?",
        "This item has not been added yet.",
        "Leave draft",
        "Keep editing",
      )
    );
  }
  @HostListener("window:beforeunload", ["$event"])
  unload(event: BeforeUnloadEvent): void {
    if (this.ownsSession && !this.saved && (this.title || this.review)) {
      event.preventDefault();
      event.returnValue = "";
    }
  }
  saveManual(): void {
    if (this.busy()) return;
    this.submitted = true;
    const problems = validateAdd({ title: this.title, kind: this.kind, year: this.year });
    this.errors.set(problems);
    if (Object.keys(problems).length) {
      this.focusFirstInvalid();
      return;
    }
    const epoch = this.draftEpoch;
    const kind = this.kind as Kind;
    this.manualError.set("");
    this.busy.set(true);
    this.http
      .post<Detail>("/media/api/library", {
        title: this.title,
        kind,
        creator: this.creator || null,
        year: this.year,
        review: this.review || null,
        status: kind === "artist" ? "following" : "want",
      })
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (detail) => {
          if (!acceptCaptureResult(epoch, this.draftEpoch, this.ownsSession)) {
            this.busy.set(false);
            return;
          }
          this.saved = true;
          this.router.navigate(["/media/item", detail.id]);
        },
        error: (failure) => {
          if (!acceptCaptureResult(epoch, this.draftEpoch, this.ownsSession)) {
            this.busy.set(false);
            return;
          }
          this.manualError.set(errorCopy(failure));
          this.busy.set(false);
        },
      });
  }
  private syncQuery(params: ParamMap): void {
    const nextQ = params.get("q") || "";
    const nextKind = selectedKind(params.get("kind"), this.manualEntry);
    if (nextQ !== this.trackedQ || nextKind !== this.trackedKind) {
      this.searchRetries.set(0);
      this.saveEpoch += 1;
      if (nextKind !== this.trackedKind) this.draftEpoch += 1;
      this.trackedQ = nextQ;
      this.trackedKind = nextKind;
    }
    if (nextQ !== this.q || nextKind !== this.kind) this.result.set(null);
    this.q = nextQ;
    this.kind = nextKind;
    this.offset = Number(params.get("offset") || 0);
    this.error.set("");
    this.loading.set(!this.manualEntry && nextQ.trim().length >= 2);
    this.loadCoverage(nextKind);
  }
  private loadCoverage(kind: string): void {
    if (kind === this.coverageKind) return;
    this.coverageKind = kind;
    const epoch = ++this.coverageEpoch;
    this.coverage.set([]);
    this.coverageLoading.set(true);
    this.coverageError.set("");
    this.http
      .get<{ sources: CoverageSource[] }>("/media/api/capture/coverage", {
        params: { kind },
      })
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (body) => {
          if (epoch !== this.coverageEpoch) return;
          this.coverage.set(Array.isArray(body?.sources) ? body.sources : []);
          this.coverageLoading.set(false);
        },
        error: () => {
          if (epoch !== this.coverageEpoch) return;
          this.coverage.set([]);
          this.coverageLoading.set(false);
          this.coverageError.set(
            "Provider coverage could not be loaded. No search result was invented.",
          );
        },
      });
  }
  private clearDraft(): void {
    this.title = "";
    this.creator = "";
    this.year = null;
    this.review = "";
    this.saved = true;
    this.draftEpoch += 1;
    this.saveEpoch += 1;
    this.errors.set({});
    this.manualError.set("");
    this.busy.set(false);
  }
  private finishPopular(key: string, message: string): void {
    this.popularInflight.delete(key);
    if (this.popularBusy() === key) this.popularBusy.set("");
    this.popularErrors.update((errors) => ({ ...errors, [key]: message }));
  }
  private focusSoon(id: string): void {
    window.clearTimeout(this.focusTimer);
    this.focusTimer = window.setTimeout(() => {
      const host = document.getElementById(id);
      if (!host) return;
      const button = host.querySelector("button, a");
      (button instanceof HTMLElement ? button : host).focus();
    });
  }
}
