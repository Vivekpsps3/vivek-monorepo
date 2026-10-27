import { Component, DestroyRef, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, NavigationStart, Scroll, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BehaviorSubject, combineLatest, catchError, of, switchMap, tap } from 'rxjs';
import { MediaCardComponent } from './media-card.component';
import { errorCopy, kinds, LibraryResponse, Detail, MediaCard } from './media.models';
@Component({ standalone: true, imports: [FormsModule, RouterLink, MediaCardComponent], template: `
<main class="page media-page"><header class="page-heading"><div><p class="eyebrow">Your collection</p><h1 id="library-heading" tabindex="-1">Library</h1><p class="muted">Only what you saved. Every story, sound, and favorite.</p></div><a class="btn btn-primary" routerLink="/media/search">Find something new</a></header>
<form class="media-filters" (ngSubmit)="filter()"><label>In your library<input name="q" [(ngModel)]="q" type="search" placeholder="Filter titles or creators"></label>
<label>Type<select name="kind" [(ngModel)]="kind" (ngModelChange)="filter()"><option value="">All types</option>@for(k of kinds;track k.value){<option [value]="k.value">{{k.label}}</option>}</select></label>
<label>State<select name="status" [(ngModel)]="status" (ngModelChange)="filter()"><option value="">All states</option>@for(s of states;track s){<option [value]="s">{{s.replace('_',' ')}}</option>}</select></label>
<label>Sort<select name="sort" [(ngModel)]="sort" (ngModelChange)="filter()"><option value="activity">Recent activity</option><option value="title">Title</option><option value="added">Recently added</option><option value="rating">Rating</option><option value="release">Release</option></select></label><label class="check-label"><input type="checkbox" name="favorite" [(ngModel)]="favorite" (ngModelChange)="filter()">Favorites only</label><button class="btn" type="submit">Apply</button></form>
@if(error()){<div class="local-error" role="alert">{{error()}} <button class="btn" (click)="retry()">Retry library</button></div>}
@if(loading()){<p role="status">Loading your library…</p>}
@if(data();as library){<p class="muted">{{library.total}} saved {{library.total === 1 ? 'item' : 'items'}}</p>
<div class="media-grid">@for(item of library.items;track item.id){<section><media-card [item]="item"/>
@if(item.kind === 'artist'){<button class="btn btn-sm" [attr.aria-expanded]="expanded() === item.id" [attr.aria-controls]="'saved-'+item.id" (click)="expand(item)">{{expanded() === item.id ? 'Hide' : 'Show'}} saved albums and songs ({{item.saved_count || 0}})</button>
@if(expanded() === item.id){<div [id]="'saved-'+item.id" class="saved-children">
@if(childrenLoading()){<p role="status">Loading saved music…</p>}
@if(childrenError()){<p role="alert">{{childrenError()}}</p><button class="btn" (click)="expand(item,true)">Retry saved music</button>}
@for(child of children();track child.id){<media-card [item]="child"/>}@empty { @if(!childrenLoading() && !childrenError()){<p>No saved albums or songs for this artist.</p>} }
<a [routerLink]="['/media/item',item.id,'discography']">Browse discography</a></div>}}</section>}
@empty {<section class="empty-state"><h2>{{q || kind || status || favorite ? 'No saved items match these filters' : 'Your next favorite starts here'}}</h2><p>{{q || kind || status || favorite ? 'Try clearing a filter.' : 'Search for a title, follow an artist, or add something of your own.'}}</p><a class="btn" routerLink="/media/search">Search Media</a></section>}</div><nav class="button-row" aria-label="Library pages"><button class="btn" [disabled]="!offset || loading()" (click)="page(-1)">Previous items</button><span>{{library.total ? library.offset+1 : 0}}–{{library.offset+library.items.length}} of {{library.total}}</span><button class="btn" [disabled]="!library.has_more || loading()" (click)="page(1)">Next items</button></nav>}
</main>` })
export class LibraryComponent {
    private readonly http = inject(HttpClient);
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly destroy = inject(DestroyRef);
    readonly reload = new BehaviorSubject(0);
    private restoredScroll = typeof history === 'undefined' ? 0 : Number(history.state?.mediaLibraryScroll) || 0;
    private scrollerReady = false;
    private restoring = false;
    private active = true;
    readonly kinds = kinds;
    readonly states = ['want', 'anticipating', 'in_progress', 'completed', 'paused', 'dropped', 'following', 'unfollowed'];
    q = '';
    kind = '';
    status = '';
    favorite = false;
    sort = 'activity';
    offset = 0;
    readonly data = signal<LibraryResponse | null>(null);
    readonly error = signal('');
    readonly loading = signal(true);
    readonly expanded = signal<number | null>(null);
    readonly children = signal<MediaCard[]>([]);
    readonly childrenError = signal('');
    readonly childrenLoading = signal(false);
    constructor() {
        this.destroy.onDestroy(() => this.active = false);
        this.router.events.pipe(takeUntilDestroyed()).subscribe(event => {
            if (event instanceof NavigationStart && event.navigationTrigger === 'imperative')
                history.replaceState({ ...history.state, mediaLibraryScroll: this.restoredScroll || window.scrollY }, '');
            if (event instanceof Scroll) {
                this.scrollerReady = true;
                this.restoreScroll();
            }
        });
        combineLatest([this.route.queryParamMap, this.reload]).pipe(tap(([p]) => { this.q = p.get('q') || ''; this.kind = p.get('kind') || ''; this.status = p.get('status') || ''; this.sort = p.get('sort') || 'activity'; this.favorite = p.get('fav') === '1'; this.offset = Math.max(0, Number(p.get('offset')) || 0); this.expanded.set(Number(p.get('expanded')) || null); this.loading.set(true); this.error.set(''); }), switchMap(() => this.http.get<LibraryResponse>('/media/api/library', { params: { q: this.q, kind: this.kind, status: this.status, sort: this.sort, offset: this.offset, limit: 24, favorite: this.favorite } }).pipe(catchError(e => { this.error.set(errorCopy(e)); return of(null); }))), takeUntilDestroyed()).subscribe(data => {
            this.data.set(data);
            this.loading.set(false);
            const expanded = data?.items.find(item => item.id === this.expanded());
            if (expanded)
                this.loadChildren(expanded);
            else
                this.restoreScroll();
        });
    }
    retry(): void {
        document.getElementById('library-heading')?.focus();
        this.reload.next(this.reload.value + 1);
    }
    filter(): void { this.router.navigate([], { relativeTo: this.route, queryParams: { q: this.q || null, kind: this.kind || null, status: this.status || null, sort: this.sort, fav: this.favorite ? 1 : null, offset: null, expanded: null }, onSameUrlNavigation: 'reload' }); }
    page(direction: number): void { this.router.navigate([], { relativeTo: this.route, queryParams: { offset: Math.max(0, this.offset + direction * 24) }, queryParamsHandling: 'merge' }); }
    expand(item: MediaCard, retry = false): void {
        if (retry) {
            this.loadChildren(item);
            return;
        }
        this.router.navigate([], { relativeTo: this.route, queryParams: { expanded: this.expanded() === item.id ? null : item.id }, queryParamsHandling: 'merge', replaceUrl: true });
    }
    private restoreScroll(): void {
        const top = this.restoredScroll;
        if (!top || !this.scrollerReady || this.loading() || this.childrenLoading() || this.restoring || typeof window === 'undefined')
            return;
        this.restoring = true;
        const started = performance.now();
        const apply = () => {
            if (!this.active)
                return;
            const room = document.documentElement.scrollHeight - window.innerHeight;
            if (room + 1 < top && performance.now() - started < 1000) {
                requestAnimationFrame(apply);
                return;
            }
            this.restoredScroll = 0;
            this.restoring = false;
            window.scrollTo({ left: 0, top, behavior: 'instant' });
        };
        requestAnimationFrame(apply);
    }
    private loadChildren(item: MediaCard): void {
        this.children.set([]);
        this.childrenError.set('');
        this.childrenLoading.set(true);
        this.http.get<Detail>('/media/api/entries/' + item.id).pipe(takeUntilDestroyed(this.destroy)).subscribe({ next: d => {
                if (this.expanded() !== item.id)
                    return;
                this.children.set(d.music?.saved_children || []);
                this.childrenLoading.set(false);
                this.restoreScroll();
            }, error: e => {
                if (this.expanded() !== item.id)
                    return;
                this.childrenError.set(errorCopy(e));
                this.childrenLoading.set(false);
                this.restoreScroll();
            } });
    }
}
