import { Subscription } from "rxjs";
import { MediaDrafts, ItemDraft, ItemFields } from "./drafts.service";
import { NgTemplateOutlet } from "@angular/common";
import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  ViewChild,
  inject,
  signal,
} from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  SESSION_CONTEXT,
  ReturnContext,
  ReturnLinkDirective,
  ConfirmService,
  UiBadgeComponent,
  UiButtonComponent,
  UiCardComponent,
  UiDialogComponent,
  UiFieldComponent,
  UiFieldControlDirective,
  UiIconComponent,
  UiPageHeaderComponent,
  UiSegmentedComponent,
  type UiIconName,
} from "@vivek/ui";
import {
  Detail,
  Episode,
  Photo,
  SearchHit,
  errorCopy,
  statusLabel,
} from "./media.models";
import { showDay } from "./display";
import {
  aboutSummary,
  artRatio,
  dateOnly,
  episodeCode,
  episodeDateLine,
  experienceTitle,
  kindIcon,
  metaChips,
  moreSummary,
  needsMoreOpen,
  placeholderLetter,
  progressPrimary,
  showsAnticipated,
  showsGenericProgress,
  statusChoices,
  statusFieldLabel,
} from "./detail-meta.mjs";
import { MediaCardComponent } from "./media-card.component";
import { nextEpisodeError } from "./next-episode.mjs";
import { NextEpisodeUndoService } from "./next-episode-undo.service";
import { NextEpisodeService } from "./next-episode.service";
import { collectionHref } from "./library-filters.mjs";

/** One explicit save. Undo keeps fields the person changed after it started. */
interface SaveFlight {
  generation: number;
  entryId: number;
  before: ItemFields;
  submitted: ItemFields;
  undone: boolean;
  /** Set once the server has accepted this save, so Undo can compensate. */
  landed: boolean;
  revertEpoch: number | null;
}
import { halfNote, ratingOptions, segmentValue } from "./rating-model.mjs";
import {
  RELATED_ATTEMPT_LIMIT,
  RELATED_KINDS,
  cleanNodes,
  relatedHref,
  relationLabel,
  type RelatedNode,
} from "./related.mjs";
import { addTag, normaliseTags, removeTag } from "./tag-model.mjs";
@Component({
  standalone: true,
  imports: [
    FormsModule,
    NgTemplateOutlet,
    ReturnLinkDirective,
    UiBadgeComponent,
    UiButtonComponent,
    UiCardComponent,
    UiDialogComponent,
    UiFieldComponent,
    UiFieldControlDirective,
    UiIconComponent,
    UiPageHeaderComponent,
    UiSegmentedComponent,
    MediaCardComponent,
  ],
  templateUrl: "./detail.component.html",
})
export class DetailComponent {
  readonly showDay = showDay;
  readonly ratio = artRatio;
  readonly chips = metaChips;
  readonly letter = placeholderLetter;
  readonly dayOnly = dateOnly;
  readonly code = episodeCode;
  readonly choices = statusChoices;
  readonly stateField = statusFieldLabel;
  readonly heading = experienceTitle;
  readonly about = aboutSummary;
  readonly primaryProgress = progressPrimary;
  readonly fallbackLibrary = collectionHref;
  readonly showMore = showsGenericProgress;
  readonly anticipatedFor = showsAnticipated;
  readonly moreLabel = moreSummary;
  private readonly session = inject(SESSION_CONTEXT);
  private readonly ownerId = this.session.currentUser?.id;
  private get ownsSession(): boolean {
    return !!this.ownerId && this.ownerId === this.session.currentUser?.id;
  }
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly source = inject(ReturnContext);
  private readonly destroy = inject(DestroyRef);
  private readonly confirm = inject(ConfirmService);
  private readonly drafts = inject(MediaDrafts);
  private readonly undo = inject(NextEpisodeUndoService);
  private readonly nextEpisodes = inject(NextEpisodeService);
  private loadingRequest?: Subscription;
  private photoRequest?: Subscription;
  private linkRequest?: Subscription;
  private mutation?: Subscription;
  private progressRequest?: Subscription;
  private generation = 0;
  /** Episode progress ignores a response from an older attempt. */
  private progressEpoch = 0;
  private activeSave: SaveFlight | null = null;
  private revertSub?: Subscription;
  /** Explicit metadata retries for a pending item. Opening the page does not spend one. */
  metadataRetries = 0;
  readonly metadataRetryLimit = 3;
  private pendingId: number | null = null;
  private baseFields: ItemFields | null = null;
  private baseVersion = "";
  private reviewBase = "";
  readonly loading = signal(false);
  private skeletonTimer: ReturnType<typeof setTimeout> | undefined;
  readonly item = signal<Detail | null>(null);
  readonly error = signal("");
  readonly busy = signal(false);
  readonly message = signal("");
  readonly broken = signal(false);
  readonly photos = signal<Photo[]>([]);
  readonly photoError = signal("");
  readonly photoLoading = signal(false);
  readonly preview = signal<Photo | null>(null);
  readonly linking = signal(false);
  readonly linkResults = signal<SearchHit[]>([]);
  readonly linkError = signal("");
  childOpen = false;
  childTitle = "";
  childYear: number | null = null;
  photoOpen = false;
  photoQuery = "";
  linkQuery = "";
  includeSpecials = false;
  undoToken = "";
  episodeOpen = false;
  review = "";
  rating: number | null = null;
  readonly ratingChoices = ratingOptions();
  status = "";
  progress: number | null = null;
  unit = "";
  favorite = false;
  anticipated = false;
  tags: string[] = [];
  tagText = "";
  tagError = "";
  viewedOn = "";
  episode = { season_number: 1, episode_number: 1, title: "", air_date: "" };
  moreOpen = false;
  @ViewChild("tagInput") private tagInput?: ElementRef<HTMLInputElement>;
  @ViewChild("relatedSentinel")
  private relatedSentinel?: ElementRef<HTMLElement>;
  private tagFocusTimer: ReturnType<typeof setTimeout> | undefined;
  private relatedTimer: ReturnType<typeof setTimeout> | undefined;
  private relatedRequest?: Subscription;
  private relatedObserver?: IntersectionObserver;
  private relatedStarted = false;
  private relatedAttempts = 0;
  private relatedAlive = true;
  readonly relatedWatch = signal(false);
  readonly relatedNodes = signal<RelatedNode[]>([]);
  readonly relatedError = signal("");
  readonly relatedLoading = signal(false);
  private suppressSubmit = false;
  readonly recovery = signal<ItemDraft | null>(null);
  private saved = "";
  readonly statusLabel = statusLabel;
  constructor() {
    this.destroy.onDestroy(() => {
      this.relatedAlive = false;
      clearTimeout(this.skeletonTimer);
      clearTimeout(this.tagFocusTimer);
      this.releaseRelated();
    });
    this.undo.restored$
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe((entryId) => this.refreshEpisodeProgress(entryId));
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      this.load(Number(p.get("id")));
    });
  }
  private refreshEpisodeProgress(entryId: number): void {
    if (this.item()?.id !== entryId) return;
    const generation = this.generation;
    const epoch = ++this.progressEpoch;
    this.progressRequest?.unsubscribe();
    this.progressRequest = this.http.get<Detail>(`/media/api/entries/${entryId}`)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (detail) => {
          if (generation !== this.generation || !this.ownsSession || epoch !== this.progressEpoch) return;
          this.keepDrafts(detail);
        },
        error: (error) => {
          if (generation === this.generation && this.ownsSession && epoch === this.progressEpoch) {
            this.error.set(errorCopy(error));
          }
        },
      });
  }
  private endpoint(): string {
    return "/media/api/entries/" + this.item()!.id;
  }
  routeId(): string {
    return this.route.snapshot.paramMap.get("id") || "0";
  }
  libraryReturn(): Record<string, unknown> {
    return this.source.link("/media/library");
  }
  load(id: number, force = false): void {
    // A second param emission for the item already on screen used to cancel
    // the form and drop a save that had just been edited.
    if (!force && (this.pendingId === id || this.item()?.id === id)) return;
    this.pendingId = id;
    const generation = ++this.generation;
    this.releaseRelated();
    this.loadingRequest?.unsubscribe();
    this.photoRequest?.unsubscribe();
    this.linkRequest?.unsubscribe();
    this.mutation?.unsubscribe();
    this.progressRequest?.unsubscribe();
    this.revertSub?.unsubscribe();
    this.activeSave = null;
    this.progressEpoch += 1;
    this.photoLoading.set(false);
    this.linking.set(false);
    this.photos.set([]);
    this.preview.set(null);
    this.linkResults.set([]);
    clearTimeout(this.skeletonTimer);
    this.loading.set(false);
    this.skeletonTimer = setTimeout(() => this.loading.set(true), 150);
    this.photoOpen = false;
    this.childOpen = false;
    this.episodeOpen = false;
    this.undoToken = "";
    this.broken.set(false);
    this.busy.set(false);
    this.error.set("");
    this.message.set("");
    this.metadataRetries = 0;
    this.recovery.set(null);
    this.item.set(null);
    this.loadingRequest = this.http
      .get<Detail>("/media/api/entries/" + id)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (d) => {
          if (generation !== this.generation) return;
          this.pendingId = null;
          clearTimeout(this.skeletonTimer);
          this.loading.set(false);
          this.adopt(d);
          this.photoQuery = d.title;
          const draft = this.drafts.read(d.id);
          if (draft) {
            if (draft.base === d.updated_at) {
              Object.assign(this, draft.fields);
              this.moreOpen = needsMoreOpen(d.kind, this.fields());
            } else this.recovery.set(draft);
          }
        },
        error: (e) => {
          if (generation === this.generation) {
            this.pendingId = null;
            clearTimeout(this.skeletonTimer);
            this.loading.set(false);
            this.error.set(errorCopy(e));
          }
        },
      });
  }
  private fields(): ItemFields {
    return {
      review: this.review,
      rating: this.rating,
      status: this.status,
      progress: this.progress,
      unit: this.unit,
      favorite: this.favorite,
      anticipated: this.anticipated,
      tags: this.tags,
      tagText: this.tagText,
      viewedOn: this.viewedOn,
    };
  }
  @HostListener("input")
  @HostListener("change")
  remember(): void {
    queueMicrotask(() => this.rememberDraft());
  }
  private rememberDraft(): void {
    const item = this.item();
    if (!item || !this.ownsSession) return;
    if (this.dirty)
      this.drafts.write(item.id, {
        base: this.baseVersion,
        fields: this.fields(),
      });
    else this.drafts.remove(item.id);
  }
  restoreDraft(): void {
    const draft = this.recovery();
    if (draft) {
      Object.assign(this, draft.fields);
      this.tagError = "";
      this.recovery.set(null);
      this.rememberDraft();
    }
  }
  discardRecovery(): void {
    this.drafts.remove(this.item()!.id);
    this.recovery.set(null);
  }
  reloadSaved(): void {
    this.rememberDraft();
    this.load(Number(this.routeId()), true);
  }
  private snapshot(): string {
    return this.fieldSnapshot(this.fields());
  }
  private fieldSnapshot(fields: ItemFields): string {
    return JSON.stringify([
      fields.review,
      fields.rating,
      fields.status,
      fields.progress,
      fields.unit,
      fields.favorite,
      fields.anticipated,
      fields.tags,
      fields.tagText,
      fields.viewedOn,
    ]);
  }
  private sameTags(left: string[] | undefined, right: string[] | undefined): boolean {
    const a = left ?? [];
    const b = right ?? [];
    return a.length === b.length && a.every((tag, index) => tag === b[index]);
  }
  get dirty(): boolean {
    return !!this.item() && this.saved !== this.snapshot();
  }
  /** Integers 0–10 select a segment. A saved half rating stays exact until an explicit choice. */
  get ratingChoice(): number | null {
    return segmentValue(this.rating);
  }
  get ratingNote(): string {
    return halfNote(this.rating);
  }
  chooseRating(value: string | number | null): void {
    if (typeof value !== "number") return;
    const next = segmentValue(value);
    if (next === null || next === this.rating) return;
    this.rating = next;
    this.rememberDraft();
  }
  clearRating(): void {
    if (this.rating === null) return;
    this.rating = null;
    this.rememberDraft();
  }
  canLeave(): boolean | Promise<boolean> {
    this.rememberDraft();
    return (
      !this.ownsSession ||
      !this.dirty ||
      this.confirm.ask(
        "Leave unsaved changes?",
        "Your changes have not been saved. A recovery copy stays in this tab until you save or discard it.",
        "Leave item",
        "Keep editing",
      )
    );
  }
  @HostListener("window:beforeunload", ["$event"])
  unload(event: BeforeUnloadEvent): void {
    this.rememberDraft();
    if (this.ownsSession && this.dirty) {
      event.preventDefault();
      event.returnValue = "";
    }
  }
  private adopt(d: Detail): void {
    const composer = this.tagText;
    const keepComposer = this.item()?.id === d.id;
    this.metadataRetries = this.pendingRetries(d);
    this.item.set(d);
    this.review = d.review || "";
    this.rating = d.rating;
    this.status = d.status;
    this.progress = d.progress_value;
    this.unit = d.progress_unit || "";
    this.favorite = d.favorite;
    this.anticipated = d.anticipated;
    this.tags = normaliseTags(d.tags);
    this.viewedOn = this.dayOnly(d.viewed_on);
    this.tagText = keepComposer ? composer : "";
    this.tagError = "";
    this.saved = this.snapshot();
    this.baseFields = this.fields();
    this.baseVersion = d.updated_at;
    this.reviewBase = d.review_updated_at || "";
    this.moreOpen = needsMoreOpen(d.kind, this.fields());
    this.armRelated(d);
  }
  /** Progress responses change the item clock. Rebase the draft onto that clock and keep the form. */
  private keepDrafts(detail: Detail): void {
    const fields = this.fields();
    this.metadataRetries = this.pendingRetries(detail);
    this.item.set(detail);
    this.applyFields(fields);
    this.baseVersion = detail.updated_at;
    this.rememberDraft();
  }
  private applyFields(fields: ItemFields): void {
    this.review = fields.review;
    this.rating = fields.rating;
    this.status = fields.status;
    this.progress = fields.progress;
    this.unit = fields.unit;
    this.favorite = fields.favorite;
    this.anticipated = fields.anticipated;
    if (fields.tags) this.tags = [...fields.tags];
    if (fields.tagText !== undefined) this.tagText = fields.tagText;
    if (fields.viewedOn !== undefined) this.viewedOn = fields.viewedOn;
  }
  artIcon(kind: string): UiIconName {
    return kindIcon(kind) as UiIconName;
  }
  episodeWhen(episode: Episode): string {
    return episodeDateLine(
      this.showDay(episode.air_date),
      episode.watched_on ? this.showDay(episode.watched_on) : "",
    );
  }
  syncMore(event: Event): void {
    const details = event.target;
    if (
      details instanceof HTMLDetailsElement &&
      details.classList.contains("detail-more")
    ) {
      this.moreOpen = details.open;
    }
  }
  private releaseRelated(): void {
    clearTimeout(this.relatedTimer);
    this.relatedTimer = undefined;
    this.relatedObserver?.disconnect();
    this.relatedObserver = undefined;
    this.relatedRequest?.unsubscribe();
    this.relatedRequest = undefined;
    this.relatedStarted = false;
    this.relatedAttempts = 0;
    this.relatedWatch.set(false);
    this.relatedNodes.set([]);
    this.relatedError.set("");
    this.relatedLoading.set(false);
  }
  private armRelated(detail: Detail): void {
    if (!(RELATED_KINDS as readonly string[]).includes(detail.kind)) return;
    this.relatedWatch.set(true);
    const generation = this.generation;
    const id = detail.id;
    clearTimeout(this.relatedTimer);
    this.relatedTimer = setTimeout(() => this.attachRelated(id, generation, 0));
  }
  private attachRelated(id: number, generation: number, waits: number): void {
    if (!this.relatedAlive || generation !== this.generation || this.relatedStarted) return;
    const element = this.relatedSentinel?.nativeElement;
    if (!element) {
      if (waits < 3) {
        this.relatedTimer = setTimeout(() => this.attachRelated(id, generation, waits + 1));
      }
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      if (this.relatedObserver === observer) this.relatedObserver = undefined;
      if (!this.relatedAlive || generation !== this.generation || this.item()?.id !== id) return;
      if (this.relatedStarted) return;
      this.relatedStarted = true;
      this.fetchRelated(id, generation);
    });
    this.relatedObserver = observer;
    observer.observe(element);
  }
  private fetchRelated(id: number, generation: number): void {
    if (!this.relatedAlive || generation !== this.generation || this.item()?.id !== id) return;
    if (this.relatedAttempts >= RELATED_ATTEMPT_LIMIT) return;
    this.relatedAttempts += 1;
    this.relatedRequest?.unsubscribe();
    this.relatedError.set("");
    this.relatedLoading.set(true);
    this.relatedRequest = this.http
      .get<{ nodes?: unknown }>("/media/api/entries/" + id + "/web")
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (body) => {
          if (!this.relatedAlive || generation !== this.generation || this.item()?.id !== id) return;
          this.relatedNodes.set(cleanNodes(body?.nodes));
          this.relatedLoading.set(false);
          this.relatedError.set("");
        },
        error: (error) => {
          if (!this.relatedAlive || generation !== this.generation || this.item()?.id !== id) return;
          this.relatedNodes.set([]);
          this.relatedLoading.set(false);
          this.relatedError.set(errorCopy(error));
        },
      });
  }
  get relatedCanRetry(): boolean {
    return (
      !!this.relatedError() &&
      !this.relatedLoading() &&
      this.relatedAttempts < RELATED_ATTEMPT_LIMIT
    );
  }
  retryRelated(): void {
    const item = this.item();
    if (!item || !this.relatedCanRetry) return;
    this.fetchRelated(item.id, this.generation);
  }
  relatedLink(node: { title: string }): string {
    return relatedHref(node, this.item()?.kind);
  }
  relatedMeta(node: RelatedNode): string {
    const label = relationLabel(node.relation);
    if (label && node.year !== null) return label + " · " + node.year;
    return label || (node.year !== null ? String(node.year) : "");
  }
  openRelated(event: MouseEvent, node: { title: string }): void {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    void this.router.navigateByUrl(relatedHref(node, this.item()?.kind));
  }
  onTagText(value: string): void {
    this.tagText = value;
    if (this.tagError) this.tagError = "";
  }
  onTagKey(event: KeyboardEvent): void {
    if (event.isComposing) return;
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (event.key === "Enter") {
      // Enter adds a chip. It must not submit notes, ratings, or the rest of the form.
      event.preventDefault();
      event.stopPropagation();
      this.tagText = input.value;
      this.suppressSubmit = true;
      queueMicrotask(() => {
        this.suppressSubmit = false;
      });
      this.commitTag();
      return;
    }
    if (event.key === "Backspace" && input.value === "" && this.tags.length) {
      event.preventDefault();
      this.removeTagAt(this.tags.length - 1, false);
    }
  }
  removeTagAt(index: number, fromButton: boolean): void {
    if (index < 0 || index >= this.tags.length) return;
    const focusIndex = fromButton && index < this.tags.length - 1 ? index : -1;
    this.tags = removeTag(this.tags, index);
    this.tagError = "";
    this.rememberDraft();
    clearTimeout(this.tagFocusTimer);
    this.tagFocusTimer = setTimeout(() => this.focusTagRemoval(focusIndex));
  }
  private commitTag(): void {
    const result = addTag(this.tags, this.tagText);
    if (result.error) {
      this.tagError = result.error;
      this.tagInput?.nativeElement.focus();
      return;
    }
    this.tags = result.tags;
    this.tagText = "";
    this.tagError = "";
    const input = this.tagInput?.nativeElement;
    if (input) input.value = "";
    this.rememberDraft();
  }
  private focusTagRemoval(index: number): void {
    const input = this.tagInput?.nativeElement;
    if (!input) return;
    if (index < 0) {
      input.focus();
      return;
    }
    const button = input
      .closest(".tag-editor")
      ?.querySelectorAll<HTMLButtonElement>("button.tag-chip-remove")[index];
    (button ?? input).focus();
  }
  save(): void {
    if (this.suppressSubmit || this.busy() || !this.item() || !this.ownsSession) return;
    const generation = this.generation;
    const submitted = this.snapshot();
    const fields = this.cloneFields(this.fields());
    const base = this.cloneFields(this.baseFields!);
    const body = this.changedBody(base, fields);
    if (!Object.keys(body).length) return;
    const flight: SaveFlight = {
      generation,
      entryId: this.item()!.id,
      before: base,
      submitted: fields,
      undone: false,
      landed: false,
      revertEpoch: null,
    };
    this.activeSave = flight;
    this.busy.set(true);
    this.error.set("");
    this.mutation?.unsubscribe();
    this.mutation = this.http
      .patch<Detail>(this.endpoint(), body)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (d) => {
          if (!this.flightLive(flight, generation)) return;
          flight.landed = true;
          if (flight.undone) {
            this.revertSave(flight, d);
            return;
          }
          if (this.snapshot() === submitted) {
            this.adopt(d);
            if (this.tagText) this.rememberDraft();
            else this.drafts.remove(d.id);
          } else {
            const current = this.fields();
            this.adopt(d);
            Object.assign(this, current);
            this.rememberDraft();
          }
          this.busy.set(false);
          this.message.set(
            this.dirty
              ? "Submitted changes saved. Your newer edits still need saving."
              : "Changes saved.",
          );
        },
        error: (e) => {
          if (!this.flightLive(flight, generation)) return;
          this.busy.set(false);
          if (flight.undone) {
            this.rememberDraft();
            this.activeSave = null;
            this.error.set(errorCopy(e));
            return;
          }
          this.error.set(errorCopy(e));
          this.rememberDraft();
        },
      });
  }
  get canUndo(): boolean {
    const flight = this.activeSave;
    return !!flight && !flight.undone && flight.entryId === this.item()?.id && this.ownsSession;
  }
  /** Drop the in-flight or just-saved edit. A note typed after it started stays. */
  undoSave(): void {
    const flight = this.activeSave;
    if (!flight || flight.undone || !this.ownsSession || this.item()?.id !== flight.entryId) return;
    flight.undone = true;
    const current = this.fields();
    const kept = this.cloneFields(current);
    const before = flight.before;
    const submitted = flight.submitted;
    if (current.review === submitted.review) kept.review = before.review;
    if (current.rating === submitted.rating) kept.rating = before.rating;
    if (current.status === submitted.status) kept.status = before.status;
    if (current.progress === submitted.progress) kept.progress = before.progress;
    if (current.unit === submitted.unit) kept.unit = before.unit;
    if (current.favorite === submitted.favorite) kept.favorite = before.favorite;
    if (current.anticipated === submitted.anticipated) kept.anticipated = before.anticipated;
    if (current.viewedOn === submitted.viewedOn) kept.viewedOn = before.viewedOn;
    if (current.tagText === submitted.tagText) kept.tagText = before.tagText;
    if (this.sameTags(current.tags, submitted.tags)) {
      kept.tags = before.tags ? [...before.tags] : before.tags;
    }
    this.applyFields(kept);
    this.tagError = "";
    const keptNote = kept.review !== flight.submitted.review;
    this.message.set(keptNote ? "Undone. Your newer note stays on this version." : "Undone.");
    this.focusNote();
    this.rememberDraft();
    if (this.busy()) return;
    if (!flight.landed) {
      this.activeSave = null;
      return;
    }
    this.revertSave(flight);
  }
  showCatalog(entry: Detail): boolean {
    const extra = entry.catalog?.extra ?? {};
    return Boolean(
      entry.lifecycle ||
      entry.catalog?.overview ||
      entry.portrait ||
      entry.kind === "artist" ||
      extra["metadata_pending"] ||
      (entry.catalog?.source && entry.catalog.source !== "manual")
    );
  }
  action(
    path: string,
    body: object = {},
    method: "post" | "delete" = "post",
  ): void {
    if (this.busy()) return;
    const generation = this.generation;
    const guardsProgress = path.includes("caught-up") || path.includes("/watched");
    const epoch = guardsProgress ? ++this.progressEpoch : 0;
    this.busy.set(true);
    this.error.set("");
    this.mutation?.unsubscribe();
    this.mutation = this.http
      .request<Detail>(method, this.endpoint() + path, { body })
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (d) => {
          if (generation !== this.generation || !this.ownsSession) return;
          if (guardsProgress && epoch !== this.progressEpoch) {
            this.busy.set(false);
            this.rememberDraft();
            return;
          }
          this.keepDrafts(d);
          if (this.childOpen) this.childOpen = false;
          if (d.operation) {
            if (d.operation.operation_token)
              this.undoToken = d.operation.operation_token;
            this.message.set(
              d.operation.changed_ids.length +
                " episodes marked through " +
                d.operation.cutoff +
                ".",
            );
          } else if (d.undo) {
            this.undoToken = "";
            this.message.set(
              d.undo.undone_ids.length +
                " marks undone." +
                (d.undo.conflict_ids.length
                  ? " Later changes were kept on " +
                    d.undo.conflict_ids.length +
                    " episodes."
                  : ""),
            );
          } else {
            this.message.set("Saved.");
          }
          this.busy.set(false);
        },
        error: (e) => {
          if (generation !== this.generation || !this.ownsSession) return;
          if (guardsProgress && epoch !== this.progressEpoch) {
            this.busy.set(false);
            this.rememberDraft();
            return;
          }
          this.error.set(errorCopy(e));
          this.busy.set(false);
          this.rememberDraft();
        },
      });
  }
  get metadataRetryOpen(): boolean {
    return this.metadataRetries < this.metadataRetryLimit;
  }
  retryMetadata(): void {
    const current = this.item();
    if (!current || !this.metadataRetryOpen || this.busy() || !this.ownsSession) return;
    const generation = this.generation;
    this.busy.set(true);
    this.error.set("");
    this.mutation?.unsubscribe();
    this.mutation = this.http
      .post<Detail>(this.endpoint() + "/refresh", {})
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (detail) => {
          if (generation !== this.generation || !this.ownsSession) return;
          this.metadataRetries = 0;
          this.keepDrafts(detail);
          this.busy.set(false);
          this.message.set(
            detail.catalog.extra?.["metadata_pending"]
              ? "Metadata is still pending. Your saved item stays editable."
              : "Metadata updated.",
          );
          this.focusMetadata();
        },
        error: (error) => {
          if (generation !== this.generation || !this.ownsSession) return;
          const code = (error as { error?: { code?: string } }).error?.code;
          this.metadataRetries =
            code === "retry_limit" ? this.metadataRetryLimit : this.metadataRetries + 1;
          this.error.set(errorCopy(error));
          this.busy.set(false);
          this.rememberDraft();
          this.focusMetadata();
        },
      });
  }
  private pendingRetries(detail: Detail): number {
    const extra = detail.catalog?.extra;
    if (!extra || extra["metadata_pending"] !== true) return 0;
    const raw = extra["metadata_retries"];
    return typeof raw === "number" && Number.isInteger(raw) && raw >= 0 ? raw : 0;
  }
  private focusMetadata(): void {
    const id = this.metadataRetryOpen ? "metadata-retry" : "metadata-limit";
    queueMicrotask(() => {
      const host = document.getElementById(id);
      const button = host?.querySelector("button, a");
      (button instanceof HTMLElement ? button : host)?.focus();
    });
  }
  markNext(episode: Episode): void {
    const current = this.item();
    if (!current || this.busy()) return;
    const generation = this.generation;
    const entryId = current.id;
    const epoch = ++this.progressEpoch;
    this.busy.set(true);
    this.error.set("");
    this.message.set("");
    this.mutation?.unsubscribe();
    this.mutation = this.nextEpisodes
      .markNext(entryId, episode.id)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (result) => {
          if (generation !== this.generation || !this.ownsSession) return;
          if (epoch !== this.progressEpoch) {
            this.busy.set(false);
            this.rememberDraft();
            return;
          }
          this.keepDrafts(result.entry);
          this.busy.set(false);
          this.undo.offer(entryId, result);
        },
        error: (error: { status?: number; error?: { detail?: unknown } }) => {
          if (generation !== this.generation || !this.ownsSession) return;
          if (epoch !== this.progressEpoch) {
            this.busy.set(false);
            return;
          }
          const mapped = nextEpisodeError(error?.status ?? 0, error?.error?.detail);
          this.error.set(mapped.message);
          this.busy.set(false);
          this.rememberDraft();
          if (mapped.reload) this.refreshEpisodeProgress(entryId);
        },
      });
  }
  mark(episode: Episode): void {
    this.action("/episodes/" + episode.id + "/watched", {
      watched: !episode.watched,
    });
  }
  addChild(): void {
    const entry = this.item()!;
    if (!this.childTitle.trim() || this.busy()) return;
    this.action(
      entry.kind === "artist" ? "/albums" : "/albums/" + entry.id + "/tracks",
      { title: this.childTitle.trim(), year: this.childYear },
    );
  }
  eligible(): number {
    return (
      this.item()?.show?.episodes.filter(
        (e) =>
          !e.watched &&
          e.released &&
          (this.includeSpecials || e.season_number > 0),
      ).length || 0
    );
  }
  seasonRate(number: number, rating: string): void {
    this.action("/seasons", {
      season_number: number,
      rating: rating === "" ? null : Number(rating),
    });
  }
  openPhotos(): void {
    this.photoOpen = true;
    this.preview.set(null);
    this.photoError.set("");
    this.findPhotos();
  }
  findPhotos(): void {
    this.photoRequest?.unsubscribe();
    const generation = this.generation;
    this.preview.set(null);
    this.photoLoading.set(true);
    this.photoError.set("");
    this.photos.set([]);
    this.photoRequest = this.http
      .get<{
        results: Photo[];
      }>(this.endpoint() + "/portraits", { params: { q: this.photoQuery } })
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (r) => {
          if (generation !== this.generation) return;
          this.photos.set(r.results);
          this.photoLoading.set(false);
        },
        error: (e) => {
          if (generation !== this.generation) return;
          this.photoError.set(errorCopy(e));
          this.photoLoading.set(false);
        },
      });
  }
  selectPhoto(): void {
    const photo = this.preview();
    if (!photo) return;
    this.photoLoading.set(true);
    this.photoRequest?.unsubscribe();
    const generation = this.generation;
    this.photoRequest = this.http
      .put<Detail>(this.endpoint() + "/portrait", {
        source_id: photo.source_id,
      })
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (d) => {
          if (generation !== this.generation) return;
          this.item.set(d);
          this.broken.set(false);
          this.photoOpen = false;
          this.photoLoading.set(false);
          this.message.set("Photo saved.");
        },
        error: (e) => {
          if (generation !== this.generation) return;
          this.photoError.set(errorCopy(e));
          this.photoLoading.set(false);
        },
      });
  }
  resetPhoto(): void {
    this.action("/portrait", {}, "delete");
    this.broken.set(false);
  }
  findLink(): void {
    this.linkRequest?.unsubscribe();
    const generation = this.generation;
    this.linking.set(true);
    this.linkError.set("");
    this.linkRequest = this.http
      .get<{
        results: SearchHit[];
      }>("/media/api/search", { params: { q: this.linkQuery, kind: "tv" } })
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (r) => {
          if (generation !== this.generation) return;
          this.linkResults.set(r.results);
          this.linking.set(false);
        },
        error: (e) => {
          if (generation !== this.generation) return;
          this.linkError.set(errorCopy(e));
          this.linking.set(false);
        },
      });
  }
  async link(hit: SearchHit): Promise<void> {
    const generation = this.generation;
    if (
      (await this.confirm.ask(
        "Link " + hit.title + "?",
        "Use " +
          hit.source +
          " #" +
          hit.source_id +
          " for future metadata refreshes. Your review and episode marks stay here.",
        "Link show",
        "Cancel",
      )) &&
      generation === this.generation &&
      this.ownsSession
    )
      this.action("/link-metadata", {
        source: hit.source,
        source_id: hit.source_id,
      });
  }
  async remove(): Promise<void> {
    const generation = this.generation;
    const item = this.item();
    if (!item) return;
    if (
      !(await this.confirm.ask(
        "Remove " + item.title + "?",
        "This removes this saved item and its personal progress. Independently saved music stays in your library.",
        "Remove item",
      )) ||
      generation !== this.generation ||
      !this.ownsSession
    )
      return;
    this.mutation?.unsubscribe();
    this.mutation = this.http
      .delete(this.endpoint())
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: () => {
          if (generation !== this.generation || !this.ownsSession) return;
          this.drafts.remove(item.id);
          this.saved = this.snapshot();
          if (!this.source.back("/media/library")) {
            void this.router.navigateByUrl(collectionHref(item.kind));
          }
        },
        error: (e) => {
          if (generation === this.generation) this.error.set(errorCopy(e));
        },
      });
  }

  private cloneFields(fields: ItemFields): ItemFields {
    return { ...fields, tags: fields.tags ? [...fields.tags] : fields.tags };
  }
  private changedBody(base: ItemFields, fields: ItemFields): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    for (const key of ["review", "rating", "status", "favorite", "anticipated"] as const) {
      if (fields[key] !== base[key]) body[key] = fields[key];
    }
    if ("review" in body) body["review_base"] = this.reviewBase;
    if (fields.progress !== base.progress || fields.unit !== base.unit) {
      body["progress_value"] = fields.progress;
      body["progress_unit"] = fields.unit || null;
    }
    if (!this.sameTags(fields.tags, base.tags)) body["tags"] = fields.tags ?? [];
    if (this.item()?.kind === "movie" && fields.viewedOn !== base.viewedOn) {
      body["viewed_on"] = fields.viewedOn || null;
    }
    return body;
  }
  /** The in-flight save still belongs to this item. Undo must not drop its response. */
  private flightLive(flight: SaveFlight, generation: number): boolean {
    return (
      generation === this.generation &&
      this.ownsSession &&
      this.item()?.id === flight.entryId &&
      (this.activeSave === flight || flight.undone)
    );
  }
  private focusNote(): void {
    queueMicrotask(() => {
      document
        .querySelector<HTMLTextAreaElement>('form.media-editor textarea[name="review"]')
        ?.focus();
    });
  }
  private serverFields(detail: Detail): ItemFields {
    return {
      review: detail.review || "",
      rating: detail.rating,
      status: detail.status,
      progress: detail.progress_value,
      unit: detail.progress_unit || "",
      favorite: detail.favorite,
      anticipated: detail.anticipated,
      tags: normaliseTags(detail.tags),
      tagText: "",
      viewedOn: this.dayOnly(detail.viewed_on),
    };
  }
  /** Keep the form, and diff the next save against the server clocks just stored. */
  private anchorKept(detail: Detail, kept: ItemFields): void {
    const server = this.serverFields(detail);
    this.metadataRetries = this.pendingRetries(detail);
    this.item.set(detail);
    this.applyFields(kept);
    this.baseVersion = detail.updated_at;
    this.reviewBase = detail.review_updated_at || "";
    this.baseFields = this.cloneFields(server);
    this.saved = this.fieldSnapshot({ ...server, tagText: this.tagText });
    this.rememberDraft();
  }
  private revertBody(
    flight: SaveFlight,
    current: ItemFields,
    reviewClock: string,
  ): Record<string, unknown> {
    const before = flight.before;
    const submitted = flight.submitted;
    const body: Record<string, unknown> = {};
    if (current.review === before.review && submitted.review !== before.review) {
      body["review"] = before.review;
      body["review_base"] = reviewClock;
    }
    if (current.rating === before.rating && submitted.rating !== before.rating) {
      body["rating"] = before.rating;
    }
    if (current.status === before.status && submitted.status !== before.status) {
      body["status"] = before.status;
    }
    if (current.favorite === before.favorite && submitted.favorite !== before.favorite) {
      body["favorite"] = before.favorite;
    }
    if (
      current.anticipated === before.anticipated &&
      submitted.anticipated !== before.anticipated
    ) {
      body["anticipated"] = before.anticipated;
    }
    const progressTouched =
      submitted.progress !== before.progress || submitted.unit !== before.unit;
    const progressRestored = current.progress === before.progress && current.unit === before.unit;
    if (progressTouched && progressRestored) {
      body["progress_value"] = before.progress;
      body["progress_unit"] = before.unit || null;
    }
    if (!this.sameTags(submitted.tags, before.tags) && this.sameTags(current.tags, before.tags)) {
      body["tags"] = before.tags ?? [];
    }
    if (
      this.item()?.kind === "movie" &&
      current.viewedOn === before.viewedOn &&
      submitted.viewedOn !== before.viewedOn
    ) {
      body["viewed_on"] = before.viewedOn || null;
    }
    return body;
  }
  /**
   * The late save must not become the form. Write back only the fields Undo
   * restored, and anchor the kept note to the clock that write returns.
   */
  private revertSave(flight: SaveFlight, late?: Detail): void {
    if (flight.revertEpoch != null) return;
    if (!this.flightLive(flight, flight.generation)) return;
    const current = this.fields();
    const reviewClock = late?.review_updated_at || this.reviewBase;
    const body = this.revertBody(flight, current, reviewClock);
    const epoch = 1;
    flight.revertEpoch = epoch;
    if (!Object.keys(body).length) {
      if (late) this.anchorKept(late, current);
      else this.rememberDraft();
      this.busy.set(false);
      this.activeSave = null;
      return;
    }
    this.busy.set(true);
    this.error.set("");
    this.revertSub?.unsubscribe();
    this.revertSub = this.http
      .patch<Detail>(this.endpoint(), body)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (detail) => {
          if (flight.revertEpoch !== epoch || !this.flightLive(flight, flight.generation)) return;
          const kept = this.fields();
          this.anchorKept(detail, kept);
          this.busy.set(false);
          this.activeSave = null;
          const keptNote = kept.review !== (detail.review || "");
          this.message.set(
            keptNote ? "Undone. Your newer note stays on this version." : "Undone.",
          );
        },
        error: (error) => {
          if (flight.revertEpoch !== epoch || !this.flightLive(flight, flight.generation)) return;
          if (late) this.anchorKept(late, this.fields());
          else this.rememberDraft();
          this.busy.set(false);
          this.activeSave = null;
          this.error.set(errorCopy(error));
        },
      });
  }
}
