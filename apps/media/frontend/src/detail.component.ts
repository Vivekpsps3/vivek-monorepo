import { Subscription } from 'rxjs';
import { MediaDrafts, ItemDraft, ItemFields } from './drafts.service';
import { Component, DestroyRef, HostListener, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SESSION_CONTEXT, ConfirmService, UiDialogComponent } from '@vivek/ui';
import { Detail, Episode, Photo, SearchHit, errorCopy, statusLabel } from './media.models';
import { MediaCardComponent } from './media-card.component';
@Component({ standalone: true, imports: [FormsModule, RouterLink, UiDialogComponent, MediaCardComponent], templateUrl: './detail.component.html' })
export class DetailComponent {
    private readonly session = inject(SESSION_CONTEXT);
    private readonly ownerId = this.session.currentUser?.id;
    private get ownsSession(): boolean { return !!this.ownerId && this.ownerId === this.session.currentUser?.id; }
    private readonly http = inject(HttpClient);
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly destroy = inject(DestroyRef);
    private readonly confirm = inject(ConfirmService);
    private readonly drafts = inject(MediaDrafts);
    private loadingRequest?: Subscription;
    private photoRequest?: Subscription;
    private linkRequest?: Subscription;
    private generation = 0;
    private baseFields: ItemFields | null = null;
    private baseVersion = '';
    private reviewBase = '';
    readonly loading = signal(false);
    private skeletonTimer: ReturnType<typeof setTimeout> | undefined;
    readonly item = signal<Detail | null>(null);
    readonly error = signal('');
    readonly busy = signal(false);
    readonly message = signal('');
    readonly broken = signal(false);
    readonly photos = signal<Photo[]>([]);
    readonly photoError = signal('');
    readonly photoLoading = signal(false);
    readonly preview = signal<Photo | null>(null);
    readonly linking = signal(false);
    readonly linkResults = signal<SearchHit[]>([]);
    readonly linkError = signal('');
    childOpen = false;
    childTitle = '';
    childYear: number | null = null;
    photoOpen = false;
    photoQuery = '';
    linkQuery = '';
    includeSpecials = false;
    undoToken = '';
    episodeOpen = false;
    review = '';
    rating: number | null = null;
    status = '';
    progress: number | null = null;
    unit = '';
    favorite = false;
    anticipated = false;
    episode = { season_number: 1, episode_number: 1, title: '', air_date: '' };
    readonly recovery = signal<ItemDraft | null>(null);
    private saved = '';
    readonly statusLabel = statusLabel;
    constructor() { this.destroy.onDestroy(() => clearTimeout(this.skeletonTimer)); this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(p => { this.load(Number(p.get('id'))); }); }
    private endpoint(): string { return '/media/api/entries/' + this.item()!.id; }
    routeId(): string { return this.route.snapshot.paramMap.get('id') || '0'; }
    load(id: number): void {
        this.loadingRequest?.unsubscribe();
        this.photoRequest?.unsubscribe();
        this.linkRequest?.unsubscribe();
        this.photoLoading.set(false);
        this.linking.set(false);
        this.photos.set([]);
        this.preview.set(null);
        this.linkResults.set([]);
        clearTimeout(this.skeletonTimer);
        this.loading.set(false);
        this.skeletonTimer = setTimeout(() => this.loading.set(true), 150);
        const generation = ++this.generation;
        this.photoOpen = false;
        this.childOpen = false;
        this.episodeOpen = false;
        this.undoToken = '';
        this.broken.set(false);
        this.busy.set(false);
        this.error.set('');
        this.message.set('');
        this.recovery.set(null);
        this.item.set(null);
        this.loadingRequest = this.http.get<Detail>('/media/api/entries/' + id).pipe(takeUntilDestroyed(this.destroy)).subscribe({ next: d => {
                if (generation !== this.generation)
                    return;
                clearTimeout(this.skeletonTimer);
                this.loading.set(false);
                this.adopt(d);
                this.photoQuery = d.title;
                const draft = this.drafts.read(d.id);
                if (draft) {
                    if (draft.base === d.updated_at) {
                        Object.assign(this, draft.fields);
                    }
                    else
                        this.recovery.set(draft);
                }
            }, error: e => {
                if (generation === this.generation) {
                    clearTimeout(this.skeletonTimer);
                    this.loading.set(false);
                    this.error.set(errorCopy(e));
                }
            } });
    }
    private fields(): ItemFields { return { review: this.review, rating: this.rating, status: this.status, progress: this.progress, unit: this.unit, favorite: this.favorite, anticipated: this.anticipated }; }
    @HostListener('input')
    @HostListener('change')
    remember(): void { queueMicrotask(() => this.rememberDraft()); }
    private rememberDraft(): void {
        const item = this.item();
        if (!item || !this.ownsSession)
            return;
        if (this.dirty)
            this.drafts.write(item.id, { base: this.baseVersion, fields: this.fields() });
        else
            this.drafts.remove(item.id);
    }
    restoreDraft(): void {
        const draft = this.recovery();
        if (draft) {
            Object.assign(this, draft.fields);
            this.recovery.set(null);
            this.rememberDraft();
        }
    }
    discardRecovery(): void { this.drafts.remove(this.item()!.id); this.recovery.set(null); }
    reloadSaved(): void { this.rememberDraft(); this.load(Number(this.routeId())); }
    private snapshot(): string { return JSON.stringify([this.review, this.rating, this.status, this.progress, this.unit, this.favorite, this.anticipated]); }
    get dirty(): boolean { return !!this.item() && this.saved !== this.snapshot(); }
    canLeave(): boolean | Promise<boolean> { this.rememberDraft(); return !this.ownsSession || !this.dirty || this.confirm.ask('Leave unsaved changes?', 'Your changes have not been saved. A recovery copy stays in this tab until you save or discard it.', 'Leave item', 'Keep editing'); }
    @HostListener('window:beforeunload', ['$event'])
    unload(event: BeforeUnloadEvent): void {
        this.rememberDraft();
        if (this.ownsSession && this.dirty) {
            event.preventDefault();
            event.returnValue = '';
        }
    }
    private adopt(d: Detail): void { this.item.set(d); this.review = d.review || ''; this.rating = d.rating; this.status = d.status; this.progress = d.progress_value; this.unit = d.progress_unit || ''; this.favorite = d.favorite; this.anticipated = d.anticipated; this.saved = this.snapshot(); this.baseFields = this.fields(); this.baseVersion = d.updated_at; this.reviewBase = d.review_updated_at || ''; }
    save(): void {
        if (this.busy() || !this.item())
            return;
        const generation = this.generation;
        const submitted = this.snapshot();
        const fields = this.fields();
        const base = this.baseFields!;
        const body: Record<string, unknown> = {};
        for (const key of ['review', 'rating', 'status', 'favorite', 'anticipated'] as const)
            if (fields[key] !== base[key])
                body[key] = fields[key];
        if ('review' in body)
            body['review_base'] = this.reviewBase;
        if (fields.progress !== base.progress || fields.unit !== base.unit) {
            body['progress_value'] = fields.progress;
            body['progress_unit'] = fields.unit || null;
        }
        if (!Object.keys(body).length)
            return;
        this.busy.set(true);
        this.error.set('');
        this.http.patch<Detail>(this.endpoint(), body).pipe(takeUntilDestroyed(this.destroy)).subscribe({ next: d => {
                if (generation !== this.generation)
                    return;
                if (this.snapshot() === submitted) {
                    this.adopt(d);
                    this.drafts.remove(d.id);
                }
                else {
                    const current = this.fields();
                    this.adopt(d);
                    Object.assign(this, current);
                    this.rememberDraft();
                }
                this.busy.set(false);
                this.message.set(this.dirty ? 'Submitted changes saved. Your newer edits still need saving.' : 'Changes saved.');
            }, error: e => {
                if (generation !== this.generation)
                    return;
                this.error.set(errorCopy(e));
                this.busy.set(false);
                this.rememberDraft();
            } });
    }
    action(path: string, body: object = {}, method: 'post' | 'delete' = 'post'): void {
        if (this.busy())
            return;
        const generation = this.generation;
        this.busy.set(true);
        this.error.set('');
        this.http.request<Detail>(method, this.endpoint() + path, { body }).pipe(takeUntilDestroyed(this.destroy)).subscribe({ next: d => {
                if (generation !== this.generation)
                    return;
                this.item.set(d);
                if (this.childOpen)
                    this.childOpen = false;
                if (d.operation) {
                    if (d.operation.operation_token)
                        this.undoToken = d.operation.operation_token;
                    this.message.set(d.operation.changed_ids.length + ' episodes marked through ' + d.operation.cutoff + '.');
                }
                else if (d.undo) {
                    this.undoToken = '';
                    this.message.set(d.undo.undone_ids.length + ' marks undone.' + (d.undo.conflict_ids.length ? ' Later changes were kept on ' + d.undo.conflict_ids.length + ' episodes.' : ''));
                }
                else {
                    this.message.set('Saved.');
                }
                this.busy.set(false);
            }, error: e => {
                if (generation !== this.generation)
                    return;
                this.error.set(errorCopy(e));
                this.busy.set(false);
            } });
    }
    mark(episode: Episode): void { this.action('/episodes/' + episode.id + '/watched', { watched: !episode.watched }); }
    addChild(): void {
        const entry = this.item()!;
        if (!this.childTitle.trim() || this.busy())
            return;
        this.action(entry.kind === 'artist' ? '/albums' : '/albums/' + entry.id + '/tracks', { title: this.childTitle.trim(), year: this.childYear });
    }
    eligible(): number { return this.item()?.show?.episodes.filter(e => !e.watched && e.released && (this.includeSpecials || e.season_number > 0)).length || 0; }
    seasonRate(number: number, rating: string): void { this.action('/seasons', { season_number: number, rating: rating === '' ? null : Number(rating) }); }
    openPhotos(): void { this.photoOpen = true; this.preview.set(null); this.photoError.set(''); this.findPhotos(); }
    findPhotos(): void {
        this.photoRequest?.unsubscribe();
        const generation = this.generation;
        this.preview.set(null);
        this.photoLoading.set(true);
        this.photoError.set('');
        this.photos.set([]);
        this.photoRequest = this.http.get<{
            results: Photo[];
        }>(this.endpoint() + '/portraits', { params: { q: this.photoQuery } }).pipe(takeUntilDestroyed(this.destroy)).subscribe({ next: r => { if (generation !== this.generation) return; this.photos.set(r.results); this.photoLoading.set(false); }, error: e => { if (generation !== this.generation) return; this.photoError.set(errorCopy(e)); this.photoLoading.set(false); } });
    }
    selectPhoto(): void {
        const photo = this.preview();
        if (!photo)
            return;
        this.photoLoading.set(true);
        this.photoRequest?.unsubscribe();
        const generation = this.generation;
        this.photoRequest = this.http.put<Detail>(this.endpoint() + '/portrait', { source_id: photo.source_id }).pipe(takeUntilDestroyed(this.destroy)).subscribe({ next: d => { if (generation !== this.generation) return; this.item.set(d); this.broken.set(false); this.photoOpen = false; this.photoLoading.set(false); this.message.set('Photo saved.'); }, error: e => { if (generation !== this.generation) return; this.photoError.set(errorCopy(e)); this.photoLoading.set(false); } });
    }
    resetPhoto(): void { this.action('/portrait', {}, 'delete'); this.broken.set(false); }
    findLink(): void {
        this.linkRequest?.unsubscribe();
        const generation = this.generation;
        this.linking.set(true);
        this.linkError.set('');
        this.linkRequest = this.http.get<{
            results: SearchHit[];
        }>('/media/api/search', { params: { q: this.linkQuery, kind: 'tv' } }).pipe(takeUntilDestroyed(this.destroy)).subscribe({ next: r => { if (generation !== this.generation) return; this.linkResults.set(r.results); this.linking.set(false); }, error: e => { if (generation !== this.generation) return; this.linkError.set(errorCopy(e)); this.linking.set(false); } });
    }
    async link(hit: SearchHit): Promise<void> {
        const generation = this.generation;
        if (await this.confirm.ask('Link ' + hit.title + '?', 'Use ' + hit.source + ' #' + hit.source_id + ' for future metadata refreshes. Your review and episode marks stay here.', 'Link show', 'Cancel') && generation === this.generation && this.ownsSession)
            this.action('/link-metadata', { source: hit.source, source_id: hit.source_id });
    }
    async remove(): Promise<void> {
        const generation = this.generation;
        const item = this.item();
        if (!item) return;
        if (!await this.confirm.ask('Remove ' + item.title + '?', 'This removes this saved item and its personal progress. Independently saved music stays in your library.', 'Remove item') || generation !== this.generation || !this.ownsSession)
            return;
        this.http.delete(this.endpoint()).pipe(takeUntilDestroyed(this.destroy)).subscribe({ next: () => { if (generation !== this.generation || !this.ownsSession) return; this.drafts.remove(item.id); this.saved = this.snapshot(); this.router.navigateByUrl('/media/library'); }, error: e => { if (generation === this.generation) this.error.set(errorCopy(e)); } });
    }
}
