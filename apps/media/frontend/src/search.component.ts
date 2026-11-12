import { Component, DestroyRef, effect, inject, signal } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { catchError, of, switchMap, tap, Subject, debounceTime } from "rxjs";
import {
  UiBadgeComponent,
  UiButtonComponent,
  UiEmptyStateComponent,
  UiFieldComponent,
  UiFieldControlDirective,
  UiPageHeaderComponent,
} from "@vivek/ui";
import {
  kinds,
  errorCopy,
  SearchResponse,
  SearchHit,
  Detail,
} from "./media.models";
import { PopularMoviesService } from "./popular-movies.service";
import { popularFocus, safeArt } from "./popular.mjs";
@Component({
  standalone: true,
  imports: [
    FormsModule,
    UiButtonComponent,
    UiFieldComponent,
    UiFieldControlDirective,
    UiPageHeaderComponent,
    UiEmptyStateComponent,
    UiBadgeComponent,
  ],
  template: `<main class="page media-page">
    <ui-page-header title="Search Media" [concealTitle]="true">
      <ui-button
        uiPageActions
        variant="ghost"
        href="/media/add"
        [queryParams]="{ title: q }"
        label="Add manually"
      />
    </ui-page-header>
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
          name="kind"
          [(ngModel)]="kind"
          (ngModelChange)="search()"
        >
          <option value="all">All types</option>
          @for (k of kinds; track k.value) {
            <option [value]="k.value">{{ k.label }}</option>
          }
        </select></ui-field
      ><ui-button
        variant="primary"
        type="submit"
        [disabled]="q.trim().length < 2"
      >
        Search
      </ui-button>
    </form>
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
        <ui-button variant="ghost" (click)="search(true)"
          >Retry search</ui-button
        >
      </div>
    }
    @if (result(); as response) {
      @if (response.partial) {
        <div class="local-error" role="status">
          <strong>Search is incomplete.</strong> Some sources could not finish.
          Available matches are still shown.
          <ui-button variant="ghost" (click)="search(true)">
            Retry unavailable sources
          </ui-button>
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
                [queryParams]="{ title: q }"
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
  </main>`,
})
export class SearchComponent {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);
  readonly kinds = kinds;
  readonly typed = new Subject<void>();
  q = "";
  kind = "all";
  private offset = 0;
  readonly result = signal<SearchResponse | null>(null);
  readonly loading = signal(false);
  readonly error = signal("");
  readonly saving = signal("");
  readonly saveErrors = signal<Record<string, string>>({});
  readonly popular = inject(PopularMoviesService);
  readonly popularBusy = signal("");
  readonly popularErrors = signal<Record<string, string>>({});
  readonly popularSkeleton = [1, 2, 3, 4];
  readonly art = safeArt;
  private readonly popularInflight = new Set<string>();
  private readonly popularAttempt = new Map<string, number>();
  private focusTimer = 0;
  constructor() {
    let previous = this.popular.state();
    effect(() => {
      const state = this.popular.state();
      const count = this.popular.rows().length;
      const target = popularFocus(previous, state, count);
      previous = state;
      if (target) this.focusSoon(target);
    });
    this.destroy.onDestroy(() => window.clearTimeout(this.focusTimer));
    this.typed
      .pipe(debounceTime(350), takeUntilDestroyed())
      .subscribe(() => this.search());
    this.route.queryParamMap
      .pipe(
        tap((p) => {
          const next = p.get("q") || "";
          if (next !== this.q || p.get("kind") !== this.kind)
            this.result.set(null);
          this.q = next;
          this.kind = p.get("kind") || "all";
          this.offset = Number(p.get("offset") || 0);
          this.error.set("");
          this.loading.set(this.q.trim().length >= 2);
        }),
        switchMap((p) =>
          this.q.trim().length < 2
            ? of(null)
            : this.http
                .get<SearchResponse>("/media/api/search", {
                  params: {
                    q: this.q,
                    kind: this.kind,
                    offset: this.offset,
                    limit: 20,
                    retry: p.get("retry") ? "true" : "false",
                  },
                })
                .pipe(
                  catchError((e) => {
                    this.error.set(errorCopy(e));
                    return of(null);
                  }),
                ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((response) => {
        if (response) this.result.set(response);
        this.loading.set(false);
      });
  }
  search(retry = false): void {
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
          this.popular.markSaved(key, detail.id);
          this.finishPopular(key, "");
        },
        error: (error) => {
          if (this.popularAttempt.get(key) !== attempt) return;
          this.finishPopular(key, errorCopy(error));
        },
      });
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
      const button = host.querySelector("button");
      (button instanceof HTMLElement ? button : host).focus();
    });
  }
  save(item: SearchHit): void {
    const key = item.source + item.source_id;
    this.saving.set(key);
    this.saveErrors.update((e) => ({ ...e, [key]: "" }));
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
          item.already_saved = true;
          item.saved_id = detail.id;
          this.result.update((r) => (r ? { ...r } : r));
          this.saving.set("");
        },
        error: (e) => {
          this.saveErrors.update((errors) => ({
            ...errors,
            [key]: errorCopy(e),
          }));
          this.saving.set("");
        },
      });
  }
}
