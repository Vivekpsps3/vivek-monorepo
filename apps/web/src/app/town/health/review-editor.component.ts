import { ChangeDetectionStrategy, Component, DestroyRef, InjectionToken, Injector, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { localTodayIso } from '@vivek/browser';
import {
  UiButtonComponent,
  UiDialogComponent,
  UiPageHeaderComponent,
  UiSkeletonComponent,
  vaultReturnQuery,
} from '@vivek/ui';
import { bindLockSnapshots, financeVaultExists, financeVaultPresent } from '../../../../../finance/frontend/src/public-api';
import { SessionService } from '../../platform/session.service';
import {
  draftFromReview,
  emptyDraft,
  isIsoMonday,
  isoMonday,
  obsidianReference,
  shiftIsoWeek,
  sundayPrompt,
  type ReviewDraft,
} from './review';
import {
  REVIEW_CONFLICT_MESSAGE,
  ReviewConflictError,
  ReviewRejectedError,
  ReviewStoreService,
} from './review-store.service';

/** Tests pin the civil date. Production reads the browser's local today. */
export const REVIEW_TODAY = new InjectionToken<() => string>('REVIEW_TODAY', {
  providedIn: 'root',
  factory: () => localTodayIso,
});

/** Tests pin whether a vault exists. Production asks Finance. */
export const REVIEW_VAULT_EXISTS = new InjectionToken<() => Promise<boolean | null>>('REVIEW_VAULT_EXISTS', {
  providedIn: 'root',
  factory: () => {
    const injector = inject(Injector);
    return () => financeVaultExists(injector);
  },
});

type ReviewPhase = 'loading' | 'locked' | 'setup' | 'unavailable' | 'ready';

function cloneDraft(draft: ReviewDraft): ReviewDraft {
  return { focus: [draft.focus[0], draft.focus[1], draft.focus[2]], note: draft.note, obsidian: draft.obsidian };
}

function sameDraft(left: ReviewDraft, right: ReviewDraft): boolean {
  return left.note === right.note
    && left.obsidian === right.obsidian
    && left.focus[0] === right.focus[0]
    && left.focus[1] === right.focus[1]
    && left.focus[2] === right.focus[2];
}

@Component({
  selector: 'app-weekly-review',
  imports: [UiButtonComponent, UiDialogComponent, UiPageHeaderComponent, UiSkeletonComponent],
  templateUrl: './review-editor.component.html',
  styleUrl: './review-editor.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-review-state]': 'phase()',
    '[attr.aria-busy]': 'phase() === "loading" ? "true" : null',
  },
})
export class WeeklyReviewComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);
  private readonly store = inject(ReviewStoreService);
  private readonly todayToken = inject(REVIEW_TODAY);
  private readonly vaultExists = inject(REVIEW_VAULT_EXISTS);
  private readonly destroyRef = inject(DestroyRef);
  private generation = 0;
  private dead = false;
  private seenOwner: number | null | undefined;
  private readonly life = new AbortController();
  private baseline: ReviewDraft = emptyDraft();
  private clientId: string | null = null;
  private revision: number | null = null;
  private keyVersion = 1;
  private requested: string | null = null;
  /** A newer open or an invalidation drops a response from an older open. */
  private view = 0;

  protected readonly phase = signal<ReviewPhase>('loading');
  protected readonly draft = signal<ReviewDraft>(emptyDraft());
  protected readonly week = signal('');
  protected readonly savedWeeks = signal<readonly string[]>([]);
  protected readonly unreadable = signal(0);
  protected readonly message = signal('');
  protected readonly saved = signal(false);
  protected readonly busy = signal(false);
  protected readonly confirmDelete = signal(false);

  constructor() {
    const releaseLock = bindLockSnapshots(() => this.invalidate());
    this.destroyRef.onDestroy(() => {
      this.dead = true;
      this.generation += 1;
      this.life.abort();
      this.dropPrivate();
      releaseLock();
    });
    this.session.user$.pipe(takeUntilDestroyed()).subscribe(user => this.noteOwner(user?.id));
    this.session.cleared$.pipe(takeUntilDestroyed()).subscribe(() => this.invalidate());
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params => {
      this.requested = params.get('week');
      void this.follow(this.requested);
    });
  }

  protected today(): string {
    return this.todayToken();
  }

  protected showSunday(): boolean {
    return sundayPrompt(this.today(), this.week());
  }

  protected dirty(): boolean {
    return !sameDraft(this.draft(), this.baseline);
  }

  protected canShift(delta: number): boolean {
    return shiftIsoWeek(this.week(), delta) !== null;
  }

  protected linkHref(): string | null {
    const link = obsidianReference(this.draft().obsidian);
    return typeof link === 'string' ? link : null;
  }

  protected returnQuery(): { next?: string } {
    const week = this.week();
    return vaultReturnQuery(week ? `/town/review?week=${week}` : '/town/review');
  }

  protected unreadableText(): string {
    const count = this.unreadable();
    return count === 1
      ? '1 saved week could not be read. It stays in the vault.'
      : `${count} saved weeks could not be read. They stay in the vault.`;
  }

  protected retry(): void {
    void this.follow(this.requested);
  }

  protected setFocus(index: number, event: Event): void {
    if (index !== 0 && index !== 1 && index !== 2) return;
    const value = event.target instanceof HTMLInputElement ? event.target.value : '';
    const focus: [string, string, string] = [this.draft().focus[0], this.draft().focus[1], this.draft().focus[2]];
    focus[index] = value;
    this.draft.set({ ...this.draft(), focus });
  }

  protected setNote(event: Event): void {
    const value = event.target instanceof HTMLTextAreaElement ? event.target.value : '';
    this.draft.set({ ...this.draft(), note: value });
  }

  protected setLink(event: Event): void {
    const value = event.target instanceof HTMLInputElement ? event.target.value : '';
    this.draft.set({ ...this.draft(), obsidian: value });
  }

  protected discard(): void {
    this.draft.set(cloneDraft(this.baseline));
    this.message.set('');
  }

  protected shift(delta: number): void {
    if (this.dirty()) {
      this.message.set('Save or discard this week before opening another.');
      return;
    }
    const next = shiftIsoWeek(this.week(), delta);
    if (!next) return;
    void this.router.navigate([], { relativeTo: this.route, queryParams: { week: next } });
  }

  protected openSaved(day: string): void {
    if (!isIsoMonday(day) || day === this.week()) return;
    if (this.dirty()) {
      this.message.set('Save or discard this week before opening another.');
      return;
    }
    void this.router.navigate([], { relativeTo: this.route, queryParams: { week: day } });
  }

  protected async save(): Promise<void> {
    const generation = this.generation;
    const submitted = cloneDraft(this.draft());
    const week = this.week();
    this.busy.set(true);
    this.message.set('');
    try {
      const saved = await this.store.save(week, submitted, {
        clientId: this.clientId,
        revision: this.revision,
        keyVersion: this.keyVersion,
      }, this.life.signal);
      if (!this.current(generation)) return;
      this.clientId = saved.clientId;
      this.revision = saved.revision;
      this.keyVersion = saved.keyVersion;
      this.baseline = cloneDraft(submitted);
      this.saved.set(true);
      if (!this.savedWeeks().includes(week)) {
        this.savedWeeks.set([week, ...this.savedWeeks()].sort((a, b) => b.localeCompare(a)));
      }
      this.message.set('Saved.');
    } catch (error) {
      if (!this.current(generation)) return;
      if (error instanceof ReviewConflictError) {
        this.applyConflict(error);
        return;
      }
      this.message.set(error instanceof ReviewRejectedError ? error.message : 'Could not save this week. Try again.');
    } finally {
      if (this.current(generation)) this.busy.set(false);
    }
  }

  protected askDelete(): void {
    if (!this.clientId || this.revision == null || this.busy()) return;
    this.confirmDelete.set(true);
  }

  protected async confirmRemove(): Promise<void> {
    const generation = this.generation;
    const clientId = this.clientId;
    const revision = this.revision;
    const week = this.week();
    if (!clientId || revision == null) {
      this.confirmDelete.set(false);
      return;
    }
    this.busy.set(true);
    try {
      await this.store.remove({ clientId, revision, week }, this.life.signal);
      if (!this.current(generation)) return;
      this.confirmDelete.set(false);
      this.message.set('');
      await this.open(week);
    } catch (error) {
      if (!this.current(generation)) return;
      this.confirmDelete.set(false);
      if (error instanceof ReviewConflictError) {
        this.applyConflict(error);
        return;
      }
      this.message.set('Could not delete this week. Try again.');
    } finally {
      if (this.current(generation)) this.busy.set(false);
    }
  }

  private applyConflict(error: ReviewConflictError): void {
    const latest = error.latest;
    if (latest && latest.value.week === this.week()) {
      this.clientId = latest.clientId;
      this.revision = latest.revision;
      this.keyVersion = latest.keyVersion;
      this.saved.set(true);
    } else {
      this.clientId = null;
      this.revision = null;
      this.saved.set(false);
    }
    this.message.set(REVIEW_CONFLICT_MESSAGE);
  }

  private noteOwner(id: unknown): void {
    const owner = typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : null;
    if (this.seenOwner === undefined) {
      this.seenOwner = owner;
      return;
    }
    if (this.seenOwner === owner) return;
    this.seenOwner = owner;
    this.invalidate();
  }

  private ownerId(): number | null {
    const id = this.session.currentUser?.id;
    return typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : null;
  }

  private invalidate(): void {
    if (this.dead) return;
    this.generation += 1;
    this.view += 1;
    this.phase.set('loading');
    this.dropPrivate();
    void this.follow(this.requested);
  }

  private dropPrivate(): void {
    this.draft.set(emptyDraft());
    this.baseline = emptyDraft();
    this.clientId = null;
    this.revision = null;
    this.keyVersion = 1;
    this.savedWeeks.set([]);
    this.unreadable.set(0);
    this.saved.set(false);
    this.busy.set(false);
    this.confirmDelete.set(false);
    this.message.set('');
  }

  private current(generation: number): boolean {
    return !this.dead && generation === this.generation;
  }

  private async follow(requested: string | null): Promise<void> {
    const monday = requested && isIsoMonday(requested) ? requested : isoMonday(this.today());
    if (!monday) {
      this.phase.set('unavailable');
      return;
    }
    if (requested !== monday) {
      await this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { week: monday },
        replaceUrl: true,
      });
      return;
    }
    if (this.phase() === 'ready' && this.dirty() && this.week() && this.week() !== monday) {
      this.message.set('Save or discard this week before opening another.');
      await this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { week: this.week() },
        replaceUrl: true,
      });
      return;
    }
    if (this.phase() === 'ready' && this.week() === monday) return;
    await this.open(monday);
  }

  private async open(week: string): Promise<void> {
    const generation = this.generation;
    const view = ++this.view;
    const signal = this.life.signal;
    const live = (): boolean => this.current(generation) && view === this.view && !signal.aborted;
    this.week.set(week);
    if (!live()) return;
    if (!financeVaultPresent()) {
      this.dropPrivate();
      this.week.set(week);
      this.phase.set('loading');
      const exists = await this.vaultExists();
      if (!live()) return;
      if (exists === true) {
        this.phase.set('locked');
        return;
      }
      this.phase.set(exists === false && this.ownerId() ? 'setup' : 'unavailable');
      return;
    }
    this.phase.set('loading');
    let result;
    try {
      result = await this.store.load({ signal });
    } catch {
      if (live()) this.phase.set('unavailable');
      return;
    }
    if (!live()) return;
    if (!financeVaultPresent() || result.state === 'locked') {
      this.dropPrivate();
      this.week.set(week);
      this.phase.set('locked');
      return;
    }
    if (result.state !== 'ready') {
      this.phase.set('unavailable');
      return;
    }
    const entry = result.weeks.find(item => item.value.week === week) ?? null;
    const next = entry ? draftFromReview(entry.value) : emptyDraft();
    this.draft.set(cloneDraft(next));
    this.baseline = cloneDraft(next);
    this.clientId = entry?.clientId ?? null;
    this.revision = entry?.revision ?? null;
    this.keyVersion = entry?.keyVersion ?? 1;
    this.saved.set(entry !== null);
    this.savedWeeks.set(result.weeks.map(item => item.value.week));
    this.unreadable.set(result.unreadable);
    this.phase.set('ready');
  }
}
