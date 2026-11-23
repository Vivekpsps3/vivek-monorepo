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
import {
  SESSION_CONTEXT,
  UiButtonComponent,
  UiEmptyStateComponent,
  UiFieldComponent,
  UiFieldControlDirective,
} from "@vivek/ui";
import { MediaDrafts } from "./drafts.service";
import { collectionQuery, type LibraryFilters } from "./library-filters.mjs";
import { errorCopy, Detail, MediaCard } from "./media.models";
import { halfNote, ratingOptions } from "./rating-model.mjs";
import { filmShelf, recordedViewing } from "./theater.mjs";

interface Desk {
  entryId: number;
  title: string;
  loading: boolean;
  ready: boolean;
  error: string;
  message: string;
  status: string;
  viewedOn: string;
  review: string;
  rating: number | null;
  reviewBase: string;
  itemBase: string;
  baseViewedOn: string;
  baseReview: string;
  baseRating: number | null;
  baseStatus: string;
  baseProgress: number | null;
  baseUnit: string;
  favorite: boolean;
  anticipated: boolean;
  tags: string[];
}

const SCREENS = [
  { status: "", label: "All films" },
  { status: "want", label: "Planned" },
  { status: "completed", label: "Watched" },
];

@Component({
  selector: "media-theater",
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    UiButtonComponent,
    UiEmptyStateComponent,
    UiFieldComponent,
    UiFieldControlDirective,
  ],
  styleUrl: "./theater.component.css",
  template: `<div class="theater">
    <section class="theater-lobby" aria-labelledby="theater-lobby-heading">
      <h2 id="theater-lobby-heading">Lobby</h2>
      <p class="theater-boundary">
        This theater lists your saved films. It does not play them.
      </p>
      <div class="lobby-objects">
        <div class="lobby-object">
          <h3>Screening board</h3>
          <nav class="screening-board" aria-label="Screening board">
            @for (screen of screens; track screen.status) {
              <a
                [routerLink]="['/media/library']"
                [queryParams]="screenParams(screen.status)"
                [attr.aria-current]="status() === screen.status ? 'page' : null"
                >{{ screen.label }}</a
              >
            }
          </nav>
        </div>
        <div class="lobby-object">
          <h3>Poster corridor</h3>
          <p>Saved films hang here. A poster opens that film.</p>
          <ui-button variant="secondary" (click)="focusRegion('poster-corridor-heading')"
            >Go to poster corridor</ui-button
          >
        </div>
        <div class="lobby-object">
          <h3>Ticket desk</h3>
          <p>A ticket keeps the rating, note, and watch date you recorded.</p>
          <ui-button variant="secondary" (click)="focusRegion('ticket-desk-heading')"
            >Go to ticket desk</ui-button
          >
        </div>
      </div>
      <ui-button variant="ghost" href="/hub" label="Exit to Hub" />
    </section>

    <section class="poster-corridor" aria-labelledby="poster-corridor-heading">
      <h2 id="poster-corridor-heading" tabindex="-1">Poster corridor</h2>
      @if (items().length) {
        <div class="poster-row">
          @for (item of items(); track item.id) {
            <article
              class="theater-poster"
              [attr.data-entry]="item.id"
              [attr.data-film]="shelf(item).tone"
              [attr.data-cover]="covered(item) ? 'present' : 'missing'"
            >
              <div class="poster-face" aria-hidden="true">
                @if (covered(item)) {
                  <img [src]="item.artwork_url" alt="" (error)="markBroken(item.id)" />
                } @else {
                  <span class="poster-title-face">{{ item.title }}</span>
                }
              </div>
              <div class="poster-copy">
                <h3>
                  <a
                    [attr.data-media-item]="item.id"
                    [routerLink]="['/media/item', item.id]"
                    [state]="linkState()"
                    >{{ item.title }}</a
                  >
                </h3>
                <p class="poster-fact">{{ shelf(item).fact }}</p>
                @if (shelf(item).viewedOn) {
                  <p class="poster-date">{{ dayLabel(shelf(item).viewedOn) }}</p>
                }
                <ui-button
                  variant="secondary"
                  [ariaLabel]="'Open screening for ' + item.title"
                  [ariaExpanded]="showing(item.id)"
                  [ariaControls]="showing(item.id) ? 'movie-auditorium' : undefined"
                  [disabled]="busy(item.id) && desk?.entryId !== item.id"
                  (click)="openFrom(item, $event)"
                  >Open screening</ui-button
                >
              </div>
            </article>
          }
        </div>
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

    <section class="movie-auditorium" id="movie-auditorium" aria-labelledby="movie-auditorium-heading">
      <h2 id="movie-auditorium-heading" tabindex="-1">Movie auditorium</h2>
      @if (shown(); as open) {
        <h3>{{ open.title }}</h3>
        <p class="poster-fact">{{ auditorium(open).fact }}</p>
        @if (auditorium(open).viewedOn; as day) {
          <p class="recorded-date">Recorded watch {{ dayLabel(day) }}</p>
        } @else {
          <p class="recorded-date">No viewing date recorded</p>
        }
        <p class="theater-boundary">This screening does not play the film.</p>
        @if (!open.ready) {
          @if (open.error) {
            <p class="theater-error" role="alert">{{ open.error }}</p>
            <ui-button variant="secondary" (click)="retry()">Retry this film</ui-button>
          }
          @if (open.loading) {
            <p role="status">Loading this film…</p>
          }
          <ui-button variant="ghost" (click)="close()">Close</ui-button>
        } @else {
          <a [routerLink]="['/media/item', open.entryId]" [state]="linkState()">Open film entry</a>
        }
      } @else {
        <p>Select a poster to open that film.</p>
      }
    </section>

    <section class="ticket-desk" id="ticket-desk" aria-labelledby="ticket-desk-heading">
      <h2 id="ticket-desk-heading" tabindex="-1">Ticket desk</h2>
      <p>A ticket keeps the rating, note, and watch date you recorded.</p>
      @if (shown(); as open) {
        @if (open.ready) {
          <form [id]="'ticket-form-' + open.entryId" (ngSubmit)="save()">
            <ui-field label="Rating">
              <select
                uiFieldControl
                name="rating"
                [attr.aria-label]="'Rating for ' + open.title"
                [ngModel]="ratingText(open)"
                (ngModelChange)="setRating($event)"
              >
                <option value="">Unrated</option>
                @if (halfRating(open.rating)) {
                  <option [value]="ratingText(open)">{{ ratingText(open) }}</option>
                }
                @for (choice of ratingChoices; track choice.value) {
                  <option [value]="'' + choice.value">{{ choice.ariaLabel }}</option>
                }
              </select>
            </ui-field>
            @if (halfRating(open.rating); as note) {
              <p>{{ note }}</p>
            }
            <ui-field label="Note">
              <textarea
                uiFieldControl
                name="review"
                rows="3"
                maxlength="20000"
                autocomplete="off"
                [attr.aria-label]="'Note for ' + open.title"
                [(ngModel)]="open.review"
                (ngModelChange)="remember()"
              ></textarea>
            </ui-field>
            <ui-field
              label="Watched on"
              hint="Leave this blank unless you remember the day. Saving does not invent a date."
            >
              <input
                uiFieldControl
                type="date"
                name="viewedOn"
                [(ngModel)]="open.viewedOn"
                (ngModelChange)="remember()"
              />
            </ui-field>
            @if (open.error) {
              <p class="theater-error" role="alert">{{ open.error }}</p>
            }
            @if (open.message) {
              <p role="status">{{ open.message }}</p>
            }
            <div class="ticket-actions">
              <ui-button variant="primary" type="submit" [disabled]="busy(open.entryId)"
                >Save ticket</ui-button
              >
              <ui-button variant="ghost" (click)="close()">Close</ui-button>
            </div>
          </form>
        } @else {
          <p>The saved rating and note stay on this film. Retry the auditorium to edit them.</p>
        }
      } @else {
        <p>Select a poster to edit its rating, note, and watch date.</p>
      }
    </section>
  </div>`,
})
export class TheaterComponent {
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
  readonly query = input("");
  readonly status = input("");
  readonly sort = input("activity");
  readonly favorite = input(false);
  readonly tags = input<string[]>([]);
  readonly linkState = input<Record<string, unknown> | undefined>(undefined);
  readonly emptyTitle = input("");
  readonly emptyMessage = input("");
  readonly filtered = input(false);
  readonly saved = output<Detail>();
  readonly clearFilters = output<void>();
  readonly screens = SCREENS;
  readonly ratingChoices = ratingOptions();
  private readonly broken = signal<ReadonlySet<number>>(new Set());
  private readonly busyIds = signal<ReadonlySet<number>>(new Set());
  desk: Desk | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.alive = false;
    });
    this.session.cleared$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.desk = null;
      this.returnFocus = null;
      this.busyIds.set(new Set());
    });
  }

  shelf(item: MediaCard) {
    return filmShelf(item.status, item.viewed_on);
  }

  auditorium(desk: Desk) {
    return filmShelf(desk.status, desk.viewedOn);
  }

  dayLabel(day: string | null): string {
    return day ? formatDay(day) : "";
  }

  covered(item: MediaCard): boolean {
    return Boolean(item.artwork_url) && !this.broken().has(item.id);
  }

  showing(id: number): boolean {
    return this.shown()?.entryId === id;
  }

  shown(): Desk | null {
    const desk = this.desk;
    if (!desk) return null;
    return this.items().some((item) => item.id === desk.entryId) ? desk : null;
  }

  busy(id: number): boolean {
    return this.busyIds().has(id);
  }

  halfRating(rating: number | null): string {
    return halfNote(rating);
  }

  ratingText(desk: Desk): string {
    return desk.rating == null ? "" : String(desk.rating);
  }

  screenParams(status: string) {
    const filters: LibraryFilters = {
      q: this.query(),
      kind: "movie",
      status,
      sort: this.sort(),
      favorite: this.favorite(),
      tags: this.tags(),
    };
    return collectionQuery(filters, "movie");
  }

  searchParams(): { kind: string } {
    return { kind: "movie" };
  }

  markBroken(id: number): void {
    this.broken.update((current) => new Set(current).add(id));
  }

  focusRegion(id: string): void {
    this.host.nativeElement
      .querySelector<HTMLElement>(`#${id}`)
      ?.focus({ preventScroll: false });
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
    if (this.busy(item.id) && this.desk?.entryId === item.id && !force) return;
    if (!force && this.desk?.entryId === item.id) {
      this.close();
      return;
    }
    const previous = this.desk;
    if (previous && previous.entryId !== item.id && !previous.ready) {
      this.bump(previous.entryId);
      this.clearBusy(previous.entryId);
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
          this.focusAuditorium(item.id);
        },
      });
  }

  retry(): void {
    const id = this.desk?.entryId;
    const item = this.items().find((row) => row.id === id);
    if (!item) return;
    this.open(item, this.returnFocus, true);
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

  setRating(value: string): void {
    const desk = this.desk;
    if (!desk || !desk.ready) return;
    if (value === "") desk.rating = null;
    else {
      const rating = Number(value);
      if (!Number.isFinite(rating)) return;
      desk.rating = rating;
    }
    this.remember();
  }

  save(): void {
    const desk = this.desk;
    if (!desk || !desk.ready || desk.loading || !this.owns() || this.busy(desk.entryId)) return;
    const viewed = this.dateField(desk.viewedOn);
    if (viewed.error) {
      desk.error = viewed.error;
      desk.message = "";
      return;
    }
    desk.viewedOn = viewed.value;
    const body: Record<string, unknown> = {};
    if (desk.rating !== desk.baseRating) body["rating"] = desk.rating;
    if (desk.review !== desk.baseReview) {
      body["review"] = desk.review;
      body["review_base"] = desk.reviewBase;
    }
    if (desk.viewedOn !== desk.baseViewedOn) body["viewed_on"] = desk.viewedOn || null;
    if (!Object.keys(body).length) {
      this.drafts.remove(desk.entryId);
      this.close();
      return;
    }
    const submitted = {
      review: desk.review,
      rating: desk.rating,
      viewedOn: desk.viewedOn,
    };
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
            current.review !== submitted.review ||
            current.rating !== submitted.rating ||
            current.viewedOn !== submitted.viewedOn;
          const typed = {
            review: current.review,
            rating: current.rating,
            viewedOn: current.viewedOn,
          };
          this.saved.emit(detail);
          this.fill(detail);
          if (!this.desk) return;
          if (newer) {
            this.desk.review = typed.review;
            this.desk.rating = typed.rating;
            this.desk.viewedOn = typed.viewedOn;
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
    const viewed = this.dateField(desk.viewedOn);
    this.drafts.write(desk.entryId, {
      base: desk.itemBase,
      fields: {
        review: desk.review,
        rating: desk.rating,
        status: desk.baseStatus,
        progress: desk.baseProgress,
        unit: desk.baseUnit,
        favorite: desk.favorite,
        anticipated: desk.anticipated,
        tags: desk.tags,
        viewedOn: viewed.error ? desk.baseViewedOn : viewed.value,
      },
    });
  }

  @HostListener("document:keydown.escape")
  onEscape(): void {
    if (this.desk) this.close();
  }

  private emptyDesk(item: MediaCard): Desk {
    const viewed = recordedViewing(item.viewed_on);
    return {
      entryId: item.id,
      title: item.title,
      loading: true,
      ready: false,
      error: "",
      message: "",
      status: item.status,
      viewedOn: viewed || "",
      review: "",
      rating: item.rating,
      reviewBase: "",
      itemBase: "",
      baseViewedOn: viewed || "",
      baseReview: "",
      baseRating: item.rating,
      baseStatus: item.status,
      baseProgress: item.progress_value ?? null,
      baseUnit: item.progress_unit || "",
      favorite: item.favorite,
      anticipated: Boolean(item.anticipated),
      tags: [],
    };
  }

  private fill(detail: Detail): void {
    const review = detail.review || "";
    const viewed = recordedViewing(detail.viewed_on) || "";
    const desk = this.desk;
    if (!desk || desk.entryId !== detail.id) return;
    desk.loading = false;
    desk.ready = true;
    desk.error = "";
    desk.title = detail.title;
    desk.status = detail.status;
    desk.reviewBase = detail.review_updated_at || "";
    desk.itemBase = detail.updated_at;
    desk.baseViewedOn = viewed;
    desk.baseReview = review;
    desk.baseRating = detail.rating;
    desk.baseStatus = detail.status;
    desk.baseProgress = detail.progress_value;
    desk.baseUnit = detail.progress_unit || "";
    desk.favorite = detail.favorite;
    desk.anticipated = Boolean(detail.anticipated);
    desk.tags = [...(detail.tags || [])];
    desk.viewedOn = viewed;
    desk.review = review;
    desk.rating = detail.rating;
    const draft = this.drafts.read(detail.id);
    if (draft && draft.base === detail.updated_at) {
      desk.review = draft.fields.review;
      desk.rating = draft.fields.rating;
      if (draft.fields.viewedOn !== undefined) desk.viewedOn = draft.fields.viewedOn;
    }
    this.focusAuditorium(detail.id);
  }

  private focusAuditorium(id: number): void {
    requestAnimationFrame(() => {
      if (!this.alive || this.desk?.entryId !== id) return;
      this.host.nativeElement
        .querySelector<HTMLElement>("#movie-auditorium-heading")
        ?.focus({ preventScroll: true });
    });
  }

  private dateField(value: string): { value: string; error: string } {
    const recorded = recordedViewing(value);
    if (recorded === null) return { value: "", error: "Watched on must be a real date." };
    return { value: recorded, error: "" };
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
}
