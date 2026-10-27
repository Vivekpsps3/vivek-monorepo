import { Component, inject, signal, DestroyRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, of, switchMap, tap, Subject, debounceTime } from 'rxjs';
import { kinds, errorCopy, SearchResponse, SearchHit, Detail } from './media.models';
@Component({ standalone: true, imports: [FormsModule, RouterLink], template: `
<main class="page media-page"><header class="page-heading"><div><p class="eyebrow">A little discovery</p><h1>Search Media</h1><p class="muted">Find a title or artist. Choose the work you mean.</p></div><a class="btn" routerLink="/media/add" [queryParams]="{title:q}">Add manually</a></header>
<form class="media-filters" (ngSubmit)="search()"><label>Title or artist<input type="search" name="query" [(ngModel)]="q" (ngModelChange)="typed.next()" placeholder="Try The Gentlemen" autocomplete="off"></label><label>Type<select name="kind" [(ngModel)]="kind" (ngModelChange)="search()"><option value="all">All types</option>@for(k of kinds;track k.value){<option [value]="k.value">{{k.label}}</option>}</select></label><button class="btn btn-primary" type="submit" [disabled]="q.trim().length < 2">Search</button></form>
@if(loading()){<p role="status">Searching sources…</p>}
@if(error()){<div class="local-error" role="alert">{{error()}} <button class="btn" (click)="search(true)">Retry search</button></div>}
@if(result();as response){
@if(response.partial){<div class="local-error" role="status"><strong>Search is incomplete.</strong> Some sources could not finish. Available matches are still shown. <button class="btn" (click)="search(true)">Retry unavailable sources</button></div>}
<details class="source-details"><summary>Source coverage · {{kind === 'all' ? 'all types' : kind}}</summary>@for(source of response.sources;track source.id){<p>{{source.id}} · {{source.kinds.join(', ')}} · {{source.coverage}} · {{source.state}} @if(source.reason){ — {{source.reason}}} @if(source.cached){ · Cached}</p>}</details>
<p class="muted">{{response.total}} matches in this source window. @if(response.total){Showing {{response.offset+1}}–{{response.offset+response.results.length}}.}</p>
<div class="search-results">@for(item of response.results;track item.source+':'+item.source_id){
<article class="media-card"><div class="media-art">@if(item.artwork_url){<img [src]="item.artwork_url" alt="" loading="lazy" (error)="item.artwork_url=null">}@else{<span>{{item.title.slice(0,2).toUpperCase()}}</span>}</div>
<div class="media-card-copy"><p class="eyebrow">{{item.kind === 'tv' ? 'Series' : item.kind}} @if(item.year){ · {{item.year}}}</p><h2>{{item.title}}</h2><p class="muted">{{item.creator}} · {{item.source}} #{{item.source_id}}</p>@if(item.extra?.lifecycle){<p>{{item.extra?.lifecycle}}</p>}
@if(item.already_saved){<a class="btn" [routerLink]="['/media/item',item.saved_id]">Open saved {{item.kind === 'artist' ? 'artist' : 'item'}}</a>}
@else{<button class="btn" [disabled]="saving()===item.source+item.source_id" (click)="save(item)">{{saving()===item.source+item.source_id ? 'Saving…' : item.kind === 'artist' ? 'Follow artist' : 'Add to library'}}</button>}
@if(saveErrors()[item.source+item.source_id]){<p role="alert">{{saveErrors()[item.source+item.source_id]}}</p>}</div></article>}
@empty {@if(!loading()){<section class="empty-state"><h2>{{response.partial ? 'Available sources returned no matches' : 'No matching titles'}}</h2><p>{{response.partial ? 'Retry the unavailable sources or add this title manually.' : 'Try another spelling, a broader title, or another type.'}}</p><a class="btn" routerLink="/media/add" [queryParams]="{title:q}">Add manually</a></section>}}</div>
<div class="pagination">@if(response.offset > 0){<button class="btn" (click)="page(-20)">Previous</button>}@if(response.has_more){<button class="btn" (click)="page(20)">More results</button>}</div>}
@if(!q.trim()){<section class="empty-state"><h2>What are you curious about?</h2><p>Search movies, series, books, games, artists, albums, and songs.</p></section>}
</main>` })
export class SearchComponent {
    private readonly http = inject(HttpClient);
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly destroy = inject(DestroyRef);
    readonly kinds = kinds;
    readonly typed = new Subject<void>();
    q = '';
    kind = 'all';
    private offset = 0;
    readonly result = signal<SearchResponse | null>(null);
    readonly loading = signal(false);
    readonly error = signal('');
    readonly saving = signal('');
    readonly saveErrors = signal<Record<string, string>>({});
    constructor() {
        this.typed.pipe(debounceTime(350), takeUntilDestroyed()).subscribe(() => this.search());
        this.route.queryParamMap.pipe(tap(p => {
            const next = p.get('q') || '';
            if (next !== this.q || p.get('kind') !== this.kind)
                this.result.set(null);
            this.q = next;
            this.kind = p.get('kind') || 'all';
            this.offset = Number(p.get('offset') || 0);
            this.error.set('');
            this.loading.set(this.q.trim().length >= 2);
        }), switchMap(p => this.q.trim().length < 2 ? of(null) : this.http.get<SearchResponse>('/media/api/search', { params: { q: this.q, kind: this.kind, offset: this.offset, limit: 20, retry: p.get('retry') ? 'true' : 'false' } }).pipe(catchError(e => { this.error.set(errorCopy(e)); return of(null); }))), takeUntilDestroyed()).subscribe(response => {
            if (response)
                this.result.set(response);
            this.loading.set(false);
        });
    }
    search(retry = false): void { this.router.navigate([], { relativeTo: this.route, queryParams: { q: this.q.trim() || null, kind: this.kind, offset: 0, retry: retry ? Date.now() : null }, onSameUrlNavigation: 'reload' }); }
    page(delta: number): void { this.router.navigate([], { relativeTo: this.route, queryParamsHandling: 'merge', queryParams: { offset: Math.max(0, this.offset + delta), retry: null } }); }
    save(item: SearchHit): void { const key = item.source + item.source_id; this.saving.set(key); this.saveErrors.update(e => ({ ...e, [key]: '' })); this.http.post<Detail>('/media/api/library/from-provider', { source: item.source, source_id: item.source_id, kind: item.kind, title: item.title }).pipe(takeUntilDestroyed(this.destroy)).subscribe({ next: detail => { item.already_saved = true; item.saved_id = detail.id; this.result.update(r => r ? { ...r } : r); this.saving.set(''); }, error: e => { this.saveErrors.update(errors => ({ ...errors, [key]: errorCopy(e) })); this.saving.set(''); } }); }
}
