import { NgTemplateOutlet } from "@angular/common";
import { HttpClient } from "@angular/common/http";
import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { formatDay } from "@vivek/browser";
import { timeout } from "rxjs";
import {
  UiButtonComponent,
  UiEmptyStateComponent,
  UiFieldComponent,
  UiFieldControlDirective,
  SESSION_CONTEXT,
  silentErrorToast,
} from "@vivek/ui";
import {
  bookAuthorLine,
  bookKeepsakes,
  bookProgressFact,
  bookSeriesLine,
  emptyBookKeepsakes,
  visibleShelves,
  type BookKeepsake,
  type BookKeepsakeView,
} from "./books.mjs";
import { MediaDrafts } from "./drafts.service";
import { collectionQuery, type LibraryFilters } from "./library-filters.mjs";
import { errorCopy, Detail, MediaCard } from "./media.models";

interface Desk {
  entryId: number;
  title: string;
  loading: boolean;
  ready: boolean;
  error: string;
  message: string;
  progress: string;
  unit: string;
  review: string;
  reviewBase: string;
  itemBase: string;
  baseProgress: number | null;
  baseUnit: string;
  baseReview: string;
  baseStatus: string;
  rating: number | null;
  favorite: boolean;
  anticipated: boolean;
  tags: string[];
}

@Component({
  selector: "media-book-shelf",
  standalone: true,
  imports: [
    FormsModule,
    NgTemplateOutlet,
    RouterLink,
    UiButtonComponent,
    UiEmptyStateComponent,
    UiFieldComponent,
    UiFieldControlDirective,
  ],
  styleUrl: "./book-shelf.component.css",
  template: `<div class="book-hall" [attr.data-face]="face()">
    <section class="reading-lobby" aria-labelledby="reading-hall-heading">
      <h2 id="reading-hall-heading" tabindex="-1">Reading hall</h2>
      <p class="hall-boundary">This hall lists your saved books. It does not open the text or play audio.</p>
      <div class="hall-objects">
        <div class="hall-object">
          <h3>Shelf signs</h3>
          <p>Choose Current, Read, or To read.</p>
          <nav class="book-signs" aria-label="Shelf signs">
            @for (sign of signs; track sign.status) {
              <a
                [routerLink]="['/media/library']"
                [queryParams]="signParams(sign.status)"
                [attr.aria-current]="status() === sign.status ? 'page' : null"
                >{{ sign.label }}</a
              >
            }
          </nav>
        </div>
        <div class="hall-object">
          <h3>Spines</h3>
          <p>Each spine shows the title and opens that book.</p>
          <ui-button variant="secondary" (click)="focusRegion('book-stacks-heading')">Go to book spines</ui-button>
        </div>
        <div class="hall-object">
          <h3>Desk</h3>
          <p>Update progress loads the saved progress and note and saves them on the book entry.</p>
          <ui-button variant="secondary" (click)="focusDesk()">Go to reading desk</ui-button>
        </div>
      </div>
      <nav class="book-signs" aria-label="Book presentation">
        <a
          [routerLink]="['/media/library']"
          [queryParams]="faceLink('spine')"
          [attr.aria-current]="face() === 'spine' ? 'page' : null"
          >Covers and spines</a
        >
        <a
          [routerLink]="['/media/library']"
          [queryParams]="faceLink('text')"
          [attr.aria-current]="face() === 'text' ? 'page' : null"
          >Text</a
        >
      </nav>
      <ui-button variant="ghost" href="/hub" label="Exit to Hub" />
    </section>
    <section class="book-stacks" aria-labelledby="book-stacks-heading">
      <h2 id="book-stacks-heading" tabindex="-1">Book spines</h2>
      @if (items().length) {
    @for (shelf of shelves(); track shelf.id) {
      <section class="book-stack" [attr.data-shelf]="shelf.id">
        <h2 [id]="'book-shelf-' + shelf.id">{{ shelf.label }}</h2>
        @if (!shelf.books.length) {
          <p>{{ shelf.empty }}</p>
        } @else {
          @for (block of shelf.blocks; track block.id) {
            @if (block.type === "book") {
              <ng-container
                *ngTemplateOutlet="volume; context: { item: block.books[0], grouped: false, inSeries: false }"
              />
            } @else {
              <section
                class="book-group"
                [attr.data-series]="block.type === 'series' ? block.id : null"
                [attr.data-author]="block.type === 'author' ? block.id : null"
              >
                <h3>{{ block.label }}</h3>
                <p class="book-group-note">
                  {{ block.type === "series" ? "Same series" : "Same author" }}
                </p>
                @for (item of block.books; track item.id) {
                  <ng-container
                    *ngTemplateOutlet="
                      volume;
                      context: { item: item, grouped: true, inSeries: block.type === 'series' }
                    "
                  />
                }
              </section>
            }
          }
        }
      </section>
    }
      } @else {
        <ui-empty-state [title]="emptyTitle()" [message]="emptyMessage()">
          @if (filtered()) {
            <ui-button variant="ghost" (click)="clearFilters.emit()">Clear filters</ui-button>
          } @else {
            <ui-button variant="ghost" href="/media/library" label="All items" />
          }
          <ui-button variant="primary" href="/media/search" [queryParams]="searchParams()" label="Search Media" />
        </ui-empty-state>
      }
    </section>
    <section class="reading-desk-room" aria-labelledby="reading-desk-heading">
      <h2 id="reading-desk-heading" tabindex="-1">Reading desk</h2>
      <p>Update progress opens the desk on that book. Save progress writes the book entry, which has the same progress and note.</p>
    </section>
    <section class="completion-keepsakes" aria-labelledby="completion-keepsakes-heading">
      <h2 id="completion-keepsakes-heading" tabindex="-1">Completion keepsakes</h2>
      <p>These are the derived completion keepsakes for saved books. A watched episode is not one of them.</p>
      @if (undoMessage()) {
        <p role="status">{{ undoMessage() }}</p>
      }
      @if (keepsakeError()) {
        <p class="book-desk-error" role="alert">{{ keepsakeError() }}</p>
        <ui-button variant="secondary" (click)="loadKeepsakes()">Retry completion keepsakes</ui-button>
      }
      @if (keepsakeLoading()) {
        <p role="status">Loading completion keepsakes…</p>
      }
      @if (keepsakeView().status === "ok") {
        @if (keepsakeView().truncated) {
          <p>
            The derived list includes {{ keepsakeView().included }} of {{ keepsakeView().total }}. This hall
            shows the books in that list.
          </p>
        }
        @if (keepsakeView().episode) {
          <p>{{ keepsakeView().episode }}</p>
        }
        @for (row of keepsakeView().books; track row.id) {
          <article class="book-keepsake" [attr.data-keepsake]="row.id" [attr.data-entry]="row.entryId">
            <h3>{{ row.title }}</h3>
            <p>{{ dayLabel(row.on) }}</p>
            @if (row.note) {
              <p>{{ row.note }}</p>
            }
            @if (row.dateSource === "finished_on") {
              <p>This date is an experience finish. Changing the shelf does not remove it.</p>
            }
            @if (row.route) {
              <a [routerLink]="row.route" [state]="linkState()">Open {{ row.title }}</a>
            }
            @if (undoError(row.entryId); as message) {
              <p class="book-desk-error" role="alert">{{ message }}</p>
            }
            @if (row.dateSource === "completed_on") {
              <ui-button
                variant="secondary"
                [ariaLabel]="'Undo completion for ' + row.title"
                [disabled]="busy(row.entryId)"
                (click)="undoCompletion(row)"
                >Undo completion</ui-button
              >
            }
          </article>
        } @empty {
          <p>No completed books on the derived shelf.</p>
        }
      } @else if (keepsakeView().status === "absent" || keepsakeView().status === "unavailable") {
        <p>Completion keepsakes are unavailable.</p>
      }
    </section>
    <ng-template #volume let-item="item" let-grouped="grouped" let-inSeries="inSeries">
      <article
        class="book-volume"
        [attr.data-book]="item.id"
        [attr.data-cover]="covered(item) ? 'present' : 'missing'"
        [attr.data-author]="author(item).linked ? 'linked' : 'unlinked'"
        [attr.aria-busy]="busy(item.id) ? 'true' : null"
      >
        <div class="book-body">
          @if (grouped) {
            <h4 class="book-title">
              <ng-container *ngTemplateOutlet="spineLink; context: { item: item }" />
            </h4>
          } @else {
            <h3 class="book-title">
              <ng-container *ngTemplateOutlet="spineLink; context: { item: item }" />
            </h3>
          }
          <p class="book-author">{{ author(item).text }}</p>
          @if (!inSeries && seriesName(item); as series) {
            <p class="book-series">{{ series }}</p>
          }
          <p class="book-progress">{{ progress(item) }}</p>
          @if (item.favorite || (item.rating !== null && item.rating !== undefined)) {
            <p class="book-marks">
              @if (item.favorite) {
                <span>Favorite</span>
              }
              @if (item.rating !== null && item.rating !== undefined) {
                <span>{{ item.rating }} / 10</span>
              }
            </p>
          }
          <p class="book-note">
            @if (item.note) {
              Note: {{ item.note }}
            } @else {
              No note yet
            }
          </p>
          @if (failure(item.id); as message) {
            <p class="book-desk-error" role="alert">{{ message }}</p>
          }
        </div>
        <div class="book-actions">
          @for (action of moves(item); track action.status) {
            <ui-button
              variant="secondary"
              [ariaLabel]="action.name"
              [disabled]="busy(item.id)"
              (click)="move(item, action.status)"
              >{{ action.label }}</ui-button
            >
          }
          <ui-button
            variant="primary"
            [ariaLabel]="'Update progress for ' + item.title"
            [ariaExpanded]="desk?.entryId === item.id"
            [ariaControls]="desk?.entryId === item.id ? 'book-desk-' + item.id : undefined"
            [disabled]="busy(item.id) && desk?.entryId !== item.id"
            (click)="openFrom(item, $event)"
            >Update progress</ui-button
          >
        </div>
        @if (desk; as open) {
          @if (open.entryId === item.id) {
          <form
            class="book-desk"
            [id]="'book-desk-' + item.id"
            (ngSubmit)="save()"
          >
            <h4>Progress and note</h4>
            <p>Saving updates this book entry.</p>
            @if (open.ready) {
              <a
                class="book-entry-link"
                [routerLink]="['/media/item', open.entryId]"
                [state]="linkState()"
                >Open the book entry for {{ open.title }}</a
              >
            }
            @if (!open.ready) {
              @if (open.error) {
                <p class="book-desk-error" role="alert">{{ open.error }}</p>
              }
              @if (open.loading) {
                <p role="status">Loading the note…</p>
              }
              <div class="book-actions">
                <ui-button variant="ghost" (click)="close()">Close</ui-button>
              </div>
            } @else {
              <div class="book-desk-progress">
                <ui-field label="Progress">
                  <input
                    uiFieldControl
                    type="text"
                    inputmode="decimal"
                    name="progress"
                    autocomplete="off"
                    [attr.aria-label]="'Progress for ' + item.title"
                    [(ngModel)]="open.progress"
                    (ngModelChange)="remember()"
                  />
                </ui-field>
                <ui-field label="Unit">
                  <select
                    uiFieldControl
                    name="unit"
                    [attr.aria-label]="'Progress unit for ' + item.title"
                    [(ngModel)]="open.unit"
                    (ngModelChange)="remember()"
                  >
                    <option value="">No unit</option>
                    <option value="page">Pages</option>
                    <option value="percent">Percent</option>
                    @if (open.unit && open.unit !== "page" && open.unit !== "percent") {
                      <option [value]="open.unit">{{ open.unit }}</option>
                    }
                  </select>
                </ui-field>
              </div>
              <ui-field label="Note">
                <textarea
                  uiFieldControl
                  name="review"
                  rows="3"
                  maxlength="20000"
                  autocomplete="off"
                  [attr.aria-label]="'Note for ' + item.title"
                  [(ngModel)]="open.review"
                  (ngModelChange)="remember()"
                ></textarea>
              </ui-field>
              @if (open.error) {
                <p class="book-desk-error" role="alert">{{ open.error }}</p>
              }
              @if (open.message) {
                <p role="status">{{ open.message }}</p>
              }
              <div class="book-actions">
                <ui-button variant="primary" type="submit" [disabled]="busy(item.id)"
                  >Save progress</ui-button
                >
                <ui-button variant="ghost" (click)="close()">Close</ui-button>
              </div>
            }
          </form>
          }
        }
      </article>
    </ng-template>
    <ng-template #spineLink let-item="item">
      <a
        [attr.data-media-item]="item.id"
        [routerLink]="['/media/item', item.id]"
        [state]="linkState()"
      >
        @if (face() === "spine") {
          <span class="book-cover">
            @if (covered(item)) {
              <img [src]="item.artwork_url" alt="" (error)="markBroken(item.id)" />
            }
            <span class="spine-title">{{ item.title }}</span>
          </span>
        } @else {
          {{ item.title }}
        }
      </a>
    </ng-template>
  </div>`,
})
export class BookShelfComponent {
  private readonly http = inject(HttpClient);
  private readonly drafts = inject(MediaDrafts);
  private readonly session = inject(SESSION_CONTEXT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly ownerId = this.session.currentUser?.id ?? null;
  private alive = true;
  private readonly tokens = new Map<number, number>();
  private returnFocus: HTMLElement | null = null;
  readonly items = input.required<MediaCard[]>();
  readonly status = input("");
  readonly face = input<"spine" | "text">("spine");
  readonly query = input("");
  readonly sort = input("activity");
  readonly favorite = input(false);
  readonly tags = input<string[]>([]);
  readonly offset = input(0);
  readonly emptyTitle = input("No books saved yet");
  readonly emptyMessage = input("");
  readonly filtered = input(false);
  readonly linkState = input<Record<string, unknown> | undefined>(undefined);
  readonly saved = output<Detail>();
  readonly clearFilters = output<void>();
  readonly broken = signal<ReadonlySet<number>>(new Set());
  private readonly busyIds = signal<ReadonlySet<number>>(new Set());
  private readonly failures = signal<ReadonlyMap<number, string>>(new Map());
  private readonly undoFailures = signal<ReadonlyMap<number, string>>(new Map());
  readonly keepsakeView = signal<BookKeepsakeView>(emptyBookKeepsakes());
  readonly keepsakeError = signal("");
  readonly keepsakeLoading = signal(false);
  readonly undoMessage = signal("");
  private keepsakeEpoch = 0;
  readonly signs = [
    { status: "", label: "All shelves" },
    { status: "in_progress", label: "Current" },
    { status: "completed", label: "Read" },
    { status: "want", label: "To read" },
  ];
  desk: Desk | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.alive = false;
    });
    this.session.cleared$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.desk = null;
      this.returnFocus = null;
      this.busyIds.set(new Set());
      this.failures.set(new Map());
      this.undoFailures.set(new Map());
      this.undoMessage.set("");
      this.keepsakeEpoch += 1;
      this.keepsakeLoading.set(false);
      this.keepsakeError.set("");
      this.keepsakeView.set(emptyBookKeepsakes());
    });
    this.loadKeepsakes();
  }

  signParams(status: string) {
    return {
      ...collectionQuery(this.filters(), "book"),
      status: status || null,
      face: this.face() === "text" ? "text" : null,
    };
  }

  faceLink(face: "spine" | "text") {
    return {
      ...collectionQuery(this.filters(), "book"),
      status: this.status() || null,
      offset: this.offset() || null,
      face: face === "text" ? "text" : null,
    };
  }

  searchParams(): { kind: string } {
    return { kind: "book" };
  }

  focusRegion(id: string): void {
    this.host.nativeElement.querySelector<HTMLElement>(`#${id}`)?.focus({ preventScroll: false });
  }

  focusDesk(): void {
    const field = this.host.nativeElement.querySelector<HTMLElement>(".book-desk input");
    if (field) {
      field.focus({ preventScroll: false });
      return;
    }
    this.focusRegion("reading-desk-heading");
  }

  dayLabel(value: string): string {
    return formatDay(value) || value;
  }

  undoError(id: number): string {
    return this.undoFailures().get(id) || "";
  }

  loadKeepsakes(): void {
    if (!this.owns()) return;
    const epoch = ++this.keepsakeEpoch;
    this.keepsakeLoading.set(true);
    this.keepsakeError.set("");
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    this.http
      .get<unknown>("/api/town/keepsakes", {
        params: zone ? { tz: zone } : undefined,
        context: silentErrorToast(),
      })
      .pipe(timeout(8000), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (body) => {
          if (!this.owns() || epoch !== this.keepsakeEpoch) return;
          this.keepsakeLoading.set(false);
          this.keepsakeView.set(bookKeepsakes(body));
        },
        error: (error) => {
          if (!this.owns() || epoch !== this.keepsakeEpoch) return;
          this.keepsakeLoading.set(false);
          this.keepsakeError.set(errorCopy(error));
        },
      });
  }

  undoCompletion(row: BookKeepsake): void {
    if (!this.owns() || row.dateSource !== "completed_on" || this.busy(row.entryId)) return;
    const token = this.begin(row.entryId);
    this.undoMessage.set("");
    this.clearUndoError(row.entryId);
    this.http
      .patch<Detail>(`/media/api/entries/${row.entryId}`, { status: "in_progress" })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detail) => {
          if (!this.accept(row.entryId, token)) return;
          this.finish(row.entryId, token);
          this.clearUndoError(row.entryId);
          this.undoMessage.set("Completion undone. The book and note stay saved.");
          this.noteStatus(detail);
          this.saved.emit(detail);
          this.loadKeepsakes();
          this.focusAfterUndo(row.entryId);
        },
        error: (error) => {
          if (!this.accept(row.entryId, token)) return;
          this.finish(row.entryId, token);
          this.setUndoError(row.entryId, errorCopy(error));
        },
      });
  }

  failure(id: number): string {
    return this.failures().get(id) || "";
  }

  shelves() {
    return visibleShelves(this.items(), this.status());
  }

  private filters(): LibraryFilters {
    return {
      q: this.query(),
      kind: "book",
      status: this.status(),
      sort: this.sort(),
      favorite: this.favorite(),
      tags: this.tags(),
    };
  }

  author(item: MediaCard) {
    return bookAuthorLine(item);
  }

  seriesName(item: MediaCard): string {
    return bookSeriesLine(item)?.text || "";
  }

  progress(item: MediaCard): string {
    return bookProgressFact(item);
  }

  covered(item: MediaCard): boolean {
    return Boolean(item.artwork_url) && !this.broken().has(item.id);
  }

  busy(id: number): boolean {
    return this.busyIds().has(id);
  }

  moves(item: MediaCard): { status: string; label: string; name: string }[] {
    return [
      { status: "in_progress", label: "Reading now", name: `Reading now. Move ${item.title} to Current` },
      { status: "completed", label: "Finished", name: `Finished. Move ${item.title} to Read` },
      { status: "want", label: "To read", name: `To read. Move ${item.title} to To read` },
    ].filter((action) => action.status !== item.status);
  }

  markBroken(id: number): void {
    this.broken.update((current) => new Set(current).add(id));
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

  open(item: MediaCard, focus: HTMLElement | null): void {
    if (!this.owns() || this.busy(item.id)) return;
    if (this.desk?.entryId === item.id) {
      this.close();
      return;
    }
    this.returnFocus = focus;
    const token = this.begin(item.id);
    this.desk = this.emptyDesk(item);
    this.http
      .get<Detail>(`/media/api/entries/${item.id}`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detail) => {
          if (!this.accept(item.id, token)) return;
          this.finish(item.id, token);
          if (this.desk?.entryId !== item.id) return;
          this.fill(detail);
        },
        error: (error) => {
          if (!this.accept(item.id, token)) return;
          this.finish(item.id, token);
          if (this.desk?.entryId !== item.id) return;
          this.desk.loading = false;
          this.desk.ready = false;
          this.desk.error = errorCopy(error);
        },
      });
  }

  close(): void {
    const id = this.desk?.entryId;
    if (id != null && this.desk?.ready === true && this.busy(id)) return;
    if (id != null && this.desk?.ready !== true) {
      this.bump(id);
      this.clearBusy(id);
    }
    this.desk = null;
    const focus = this.returnFocus;
    this.returnFocus = null;
    focus?.focus({ preventScroll: true });
  }

  move(item: MediaCard, status: string): void {
    if (!this.owns() || this.busy(item.id) || item.status === status) return;
    const token = this.begin(item.id);
    this.http
      .patch<Detail>(`/media/api/entries/${item.id}`, { status })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detail) => {
          if (!this.accept(item.id, token)) return;
          this.finish(item.id, token);
          this.clearFailure(item.id);
          this.noteStatus(detail);
          this.saved.emit(detail);
          this.loadKeepsakes();
          this.focusTitle(item.id);
        },
        error: (error) => {
          if (!this.accept(item.id, token)) return;
          this.finish(item.id, token);
          const message = errorCopy(error);
          if (this.desk?.entryId === item.id && !this.desk.loading) {
            this.desk.error = message;
            this.remember();
            return;
          }
          this.setFailure(item.id, message);
        },
      });
  }

  save(): void {
    const desk = this.desk;
    if (!desk || !desk.ready || desk.loading || !this.owns() || this.busy(desk.entryId)) return;
    const parsed = this.parseProgress(desk.progress, desk.unit);
    if (parsed.error) {
      desk.error = parsed.error;
      desk.message = "";
      return;
    }
    const body: Record<string, unknown> = {};
    if (parsed.value !== desk.baseProgress || desk.unit !== desk.baseUnit) {
      body["progress_value"] = parsed.value;
      body["progress_unit"] = desk.unit || null;
    }
    if (desk.review !== desk.baseReview) {
      body["review"] = desk.review;
      body["review_base"] = desk.reviewBase;
    }
    if (!Object.keys(body).length) {
      this.close();
      return;
    }
    const submitted = { progress: desk.progress, unit: desk.unit, review: desk.review };
    const token = this.begin(desk.entryId);
    desk.error = "";
    desk.message = "";
    this.http
      .patch<Detail>(`/media/api/entries/${desk.entryId}`, body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detail) => {
          if (!this.accept(desk.entryId, token)) return;
          this.finish(desk.entryId, token);
          const current = this.desk;
          if (!current || current.entryId !== desk.entryId) {
            this.saved.emit(detail);
            return;
          }
          const newer =
            current.progress !== submitted.progress ||
            current.unit !== submitted.unit ||
            current.review !== submitted.review;
          const typed = { progress: current.progress, unit: current.unit, review: current.review };
          this.saved.emit(detail);
          this.fill(detail);
          if (!this.desk) return;
          if (newer) {
            this.desk.progress = typed.progress;
            this.desk.unit = typed.unit;
            this.desk.review = typed.review;
            this.desk.message = "Submitted changes saved. Your newer edits still need saving.";
            this.remember();
            return;
          }
          this.drafts.remove(detail.id);
          this.close();
        },
        error: (error) => {
          if (!this.accept(desk.entryId, token)) return;
          this.finish(desk.entryId, token);
          if (this.desk?.entryId !== desk.entryId || !this.desk) return;
          this.desk.error = errorCopy(error);
          this.desk.message = "";
          this.remember();
        },
      });
  }

  remember(): void {
    const desk = this.desk;
    if (!desk || !desk.ready || desk.loading || !this.owns()) return;
    const parsed = this.parseProgress(desk.progress, desk.unit);
    this.drafts.write(desk.entryId, {
      base: desk.itemBase,
      fields: {
        review: desk.review,
        rating: desk.rating,
        status: desk.baseStatus,
        progress: parsed.error ? desk.baseProgress : parsed.value,
        unit: desk.unit,
        favorite: desk.favorite,
        anticipated: desk.anticipated,
        tags: desk.tags,
      },
    });
  }

  @HostListener("document:keydown.escape")
  onEscape(): void {
    if (this.desk) this.close();
  }

  private emptyDesk(item: MediaCard): Desk {
    return {
      entryId: item.id,
      title: item.title,
      loading: true,
      ready: false,
      error: "",
      message: "",
      progress: "",
      unit: "",
      review: "",
      reviewBase: "",
      itemBase: "",
      baseProgress: null,
      baseUnit: "",
      baseReview: "",
      baseStatus: item.status,
      rating: item.rating,
      favorite: item.favorite,
      anticipated: Boolean(item.anticipated),
      tags: [],
    };
  }

  private fill(detail: Detail): void {
    const progress = detail.progress_value;
    const unit = detail.progress_unit || "";
    const review = detail.review || "";
    const desk = this.desk;
    if (!desk || desk.entryId !== detail.id) return;
    desk.loading = false;
    desk.ready = true;
    desk.error = "";
    desk.reviewBase = detail.review_updated_at || "";
    desk.itemBase = detail.updated_at;
    desk.baseProgress = progress;
    desk.baseUnit = unit;
    desk.baseReview = review;
    desk.baseStatus = detail.status;
    desk.rating = detail.rating;
    desk.favorite = detail.favorite;
    desk.anticipated = Boolean(detail.anticipated);
    desk.tags = [...(detail.tags || [])];
    desk.progress = progress == null ? "" : String(progress);
    desk.unit = unit;
    desk.review = review;
    const draft = this.drafts.read(detail.id);
    if (draft && draft.base === detail.updated_at) {
      desk.progress = draft.fields.progress == null ? "" : String(draft.fields.progress);
      desk.unit = draft.fields.unit;
      desk.review = draft.fields.review;
      desk.baseStatus = draft.fields.status;
    }
    requestAnimationFrame(() => {
      if (!this.alive || this.desk?.entryId !== detail.id) return;
      this.host.nativeElement
        .querySelector<HTMLElement>(`#book-desk-${detail.id} input`)
        ?.focus({ preventScroll: true });
    });
  }

  private noteStatus(detail: Detail): void {
    const desk = this.desk;
    if (!desk || desk.entryId !== detail.id || desk.loading) return;
    desk.baseStatus = detail.status;
    desk.itemBase = detail.updated_at;
    desk.reviewBase = detail.review_updated_at || "";
    this.remember();
  }

  private setFailure(id: number, message: string): void {
    this.failures.update((current) => new Map(current).set(id, message));
  }

  private clearFailure(id: number): void {
    this.failures.update((current) => {
      const next = new Map(current);
      next.delete(id);
      return next;
    });
  }

  private parseProgress(text: string, unit: string): { value: number | null; error: string } {
    const trimmed = text.trim();
    if (!trimmed) return { value: null, error: "" };
    if (!/^\d+(\.\d+)?$/.test(trimmed)) {
      return { value: null, error: "Progress must be zero or more." };
    }
    const value = Number(trimmed);
    if (!Number.isFinite(value)) return { value: null, error: "Progress must be zero or more." };
    if (unit === "percent" && value > 100) {
      return { value: null, error: "Percent progress is between 0 and 100." };
    }
    return { value, error: "" };
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
    const token = this.bump(id);
    this.busyIds.update((current) => new Set(current).add(id));
    return token;
  }

  private finish(id: number, token: number): void {
    if (this.tokens.get(id) === token) this.clearBusy(id);
  }

  private clearBusy(id: number): void {
    this.busyIds.update((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  private accept(id: number, token: number): boolean {
    return this.owns() && this.tokens.get(id) === token;
  }

  private focusTitle(id: number): void {
    requestAnimationFrame(() => {
      if (!this.alive) return;
      this.host.nativeElement
        .querySelector<HTMLElement>(`a[data-media-item="${id}"]`)
        ?.focus({ preventScroll: true });
    });
  }

  private focusAfterUndo(id: number): void {
    requestAnimationFrame(() => {
      if (!this.alive) return;
      const link = this.host.nativeElement.querySelector<HTMLElement>(`a[data-media-item="${id}"]`);
      if (link) {
        link.focus({ preventScroll: true });
        return;
      }
      this.host.nativeElement
        .querySelector<HTMLElement>("#completion-keepsakes-heading")
        ?.focus({ preventScroll: true });
    });
  }

  private setUndoError(id: number, message: string): void {
    this.undoFailures.update((current) => new Map(current).set(id, message));
  }

  private clearUndoError(id: number): void {
    this.undoFailures.update((current) => {
      const next = new Map(current);
      next.delete(id);
      return next;
    });
  }
}
