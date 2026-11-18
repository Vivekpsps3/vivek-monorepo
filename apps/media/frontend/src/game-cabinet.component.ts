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
import {
  UiButtonComponent,
  UiFieldComponent,
  UiFieldControlDirective,
  SESSION_CONTEXT,
} from "@vivek/ui";
import { MediaDrafts } from "./drafts.service";
import { gameStateOptions, gameStatusWords, visibleBays } from "./games.mjs";
import { MediaCardComponent } from "./media-card.component";
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
  status: string;
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
  selector: "media-game-cabinet",
  standalone: true,
  imports: [
    FormsModule,
    MediaCardComponent,
    UiButtonComponent,
    UiFieldComponent,
    UiFieldControlDirective,
  ],
  styleUrl: "./game-cabinet.component.css",
  template: `<div class="game-cabinet">
    <p class="game-boundary">This cabinet is your Media library, not a Town minigame.</p>
    @for (bay of bays(); track bay.id) {
      <section class="game-bay" [attr.data-bay]="bay.id">
        <h2 [id]="'game-bay-' + bay.id">{{ bay.label }}</h2>
        @if (!bay.games.length) {
          <p>{{ bay.empty }}</p>
        } @else {
          <div class="game-row">
            @for (item of bay.games; track item.id) {
              <media-card
                [item]="item"
                [source]="linkState()"
                layout="box"
                [busy]="busy(item.id)"
              >
                <div mediaCardActions class="game-actions">
                  @if (failure(item.id); as message) {
                    <p class="game-desk-error" role="alert">{{ message }}</p>
                  }
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
                    [ariaControls]="desk?.entryId === item.id ? 'game-desk-' + item.id : undefined"
                    [disabled]="busy(item.id) && desk?.entryId !== item.id"
                    (click)="openFrom(item, $event)"
                    >Update progress</ui-button
                  >
                  @if (desk; as open) {
                    @if (open.entryId === item.id) {
                      <form
                        class="game-desk"
                        [id]="'game-desk-' + item.id"
                        (ngSubmit)="save()"
                      >
                        <h3>Recorded progress</h3>
                        @if (!open.ready) {
                          @if (open.error) {
                            <p class="game-desk-error" role="alert">{{ open.error }}</p>
                          }
                          @if (open.loading) {
                            <p role="status">Loading this game…</p>
                          }
                          <ui-button variant="ghost" (click)="close()">Close</ui-button>
                        } @else {
                          <div class="game-desk-progress">
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
                                <option value="percent">Percent</option>
                                <option value="hour">Hours</option>
                                @if (open.unit && open.unit !== "percent" && open.unit !== "hour") {
                                  <option [value]="open.unit">{{ open.unit }}</option>
                                }
                              </select>
                            </ui-field>
                          </div>
                          <ui-field label="State">
                            <select
                              uiFieldControl
                              name="status"
                              [attr.aria-label]="'State for ' + item.title"
                              [(ngModel)]="open.status"
                              (ngModelChange)="remember()"
                            >
                              @for (option of states; track option.value) {
                                <option [value]="option.value">{{ option.label }}</option>
                              }
                              @if (open.status && !known(open.status)) {
                                <option [value]="open.status">{{ words(open.status) }}</option>
                              }
                            </select>
                          </ui-field>
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
                            <p class="game-desk-error" role="alert">{{ open.error }}</p>
                          }
                          @if (open.message) {
                            <p role="status">{{ open.message }}</p>
                          }
                          <ui-button variant="primary" type="submit" [disabled]="busy(item.id)"
                            >Save progress</ui-button
                          >
                          <ui-button variant="ghost" (click)="close()">Close</ui-button>
                        }
                      </form>
                    }
                  }
                </div>
              </media-card>
            }
          </div>
        }
      </section>
    }
  </div>`,
})
export class GameCabinetComponent {
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
  readonly linkState = input<Record<string, unknown> | undefined>(undefined);
  readonly saved = output<Detail>();
  readonly states = gameStateOptions();
  private readonly busyIds = signal<ReadonlySet<number>>(new Set());
  private readonly failures = signal<ReadonlyMap<number, string>>(new Map());
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
    });
  }

  bays() {
    return visibleBays(this.items(), this.status());
  }

  words(status: string): string {
    return gameStatusWords(status);
  }

  known(status: string): boolean {
    return this.states.some((option) => option.value === status);
  }

  failure(id: number): string {
    return this.failures().get(id) || "";
  }

  busy(id: number): boolean {
    return this.busyIds().has(id);
  }

  moves(item: MediaCard): { status: string; label: string; name: string }[] {
    return [
      { status: "in_progress", label: "Playing now", name: `Playing now. Move ${item.title} to Playing` },
      { status: "completed", label: "Played", name: `Played. Move ${item.title} to Played` },
      { status: "want", label: "Want to play", name: `Want to play. Move ${item.title} to Want to play` },
    ].filter((action) => action.status !== item.status);
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
      body["progress_unit"] = parsed.value == null ? null : desk.unit || null;
    }
    if (desk.status !== desk.baseStatus) body["status"] = desk.status;
    if (desk.review !== desk.baseReview) {
      body["review"] = desk.review;
      body["review_base"] = desk.reviewBase;
    }
    if (!Object.keys(body).length) {
      this.close();
      return;
    }
    const submitted = {
      progress: desk.progress,
      unit: desk.unit,
      status: desk.status,
      review: desk.review,
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
            current.progress !== submitted.progress ||
            current.unit !== submitted.unit ||
            current.status !== submitted.status ||
            current.review !== submitted.review;
          const typed = {
            progress: current.progress,
            unit: current.unit,
            status: current.status,
            review: current.review,
          };
          this.saved.emit(detail);
          this.fill(detail);
          if (!this.desk) return;
          if (newer) {
            this.desk.progress = typed.progress;
            this.desk.unit = typed.unit;
            this.desk.status = typed.status;
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
        status: desk.status,
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
      status: item.status,
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
    desk.status = detail.status;
    desk.review = review;
    const draft = this.drafts.read(detail.id);
    if (draft && draft.base === detail.updated_at) {
      desk.progress = draft.fields.progress == null ? "" : String(draft.fields.progress);
      desk.unit = draft.fields.unit;
      desk.status = draft.fields.status;
      desk.review = draft.fields.review;
    }
    requestAnimationFrame(() => {
      if (!this.alive || this.desk?.entryId !== detail.id) return;
      this.host.nativeElement
        .querySelector<HTMLElement>(`#game-desk-${detail.id} input`)
        ?.focus({ preventScroll: true });
    });
  }

  private noteStatus(detail: Detail): void {
    const desk = this.desk;
    if (!desk || desk.entryId !== detail.id || desk.loading) return;
    desk.baseStatus = detail.status;
    desk.status = detail.status;
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
}
