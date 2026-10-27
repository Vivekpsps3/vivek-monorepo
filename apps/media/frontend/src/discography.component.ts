import { Component, DestroyRef, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { errorCopy } from './media.models';
interface Track {
    source_id: string;
    title: string;
    saved: boolean;
    saved_id?: number;
}
interface Album extends Track {
    year: number;
    tracks: Track[];
}
interface Discography {
    partial: boolean;
    group_offset: number;
    release_offset: number;
    albums: Album[];
}
@Component({ standalone: true, imports: [FormsModule, RouterLink], template: `
<main class="page media-page"><a [routerLink]="['/media/item',id]">← Artist</a><header class="page-heading"><div><p class="eyebrow">Explore, then choose</p><h1>Browse discography</h1><p class="muted">Browsing does not save albums or songs.</p></div><label>Release type<select [(ngModel)]="release" (ngModelChange)="load(true)">@for(type of types;track type){<option [value]="type">{{type}}</option>}</select></label></header>
@if(error()){<p role="alert" class="local-error">{{error()}}</p><button class="btn" (click)="load()">Retry discography</button>}
@if(loading()){<p role="status">Loading releases…</p>}
@if(data();as discography){@if(discography.partial){<p class="local-error" role="status">More releases may be available. This page is incomplete.</p>}
@for(album of discography.albums;track album.source_id){<section class="surface"><div class="episode-row"><div><h2>{{album.title}}</h2><p>{{album.year}}</p></div>@if(album.saved){<a class="btn" [routerLink]="['/media/item',album.saved_id]">Open saved album</a>}@else{<button class="btn" [disabled]="busy()" (click)="save(album,null)">Add album</button>}</div><details><summary>Songs ({{album.tracks.length}})</summary>@for(track of album.tracks;track track.source_id){<div class="episode-row"><span>{{track.title}}</span>@if(track.saved){<a class="btn" [routerLink]="['/media/item',track.saved_id]">Open saved song</a>}@else{<button class="btn" [disabled]="busy()" (click)="save(album,track)">Add song</button>}</div>}</details></section>}@empty{@if(!loading()){<p>No releases found for this filter. Try another release type.</p>}}
@if(discography.partial){<button class="btn" [disabled]="loading()" (click)="more()">Next releases</button>}}
</main>` })
export class DiscographyComponent {
    private readonly http = inject(HttpClient);
    private readonly destroy = inject(DestroyRef);
    readonly id = Number(inject(ActivatedRoute).snapshot.paramMap.get('id'));
    readonly types = ['studio', 'single', 'ep', 'live', 'remix', 'compilation'];
    release = 'studio';
    readonly data = signal<Discography | null>(null);
    readonly loading = signal(false);
    readonly busy = signal(false);
    readonly error = signal('');
    private group = 0;
    private offset = 0;
    constructor() { this.load(); }
    load(reset = false): void {
        if (reset) {
            this.group = 0;
            this.offset = 0;
        }
        this.loading.set(true);
        this.error.set('');
        this.http.get<Discography>('/media/api/entries/' + this.id + '/discography', { params: { release: this.release, group_offset: this.group, release_offset: this.offset } }).pipe(takeUntilDestroyed(this.destroy)).subscribe({ next: d => { this.data.set(d); this.loading.set(false); }, error: e => { this.error.set(errorCopy(e)); this.loading.set(false); } });
    }
    more(): void { this.group = this.data()?.group_offset || 0; this.offset = this.data()?.release_offset || 0; this.load(); }
    save(album: Album, track: Track | null): void {
        this.busy.set(true);
        this.error.set('');
        this.http.post<{
            id: number;
        }>('/media/api/entries/' + this.id + '/discography', { kind: track ? 'track' : 'album', source_id: track?.source_id || album.source_id, album_source_id: album.source_id, album_title: album.title, year: album.year, title: track?.title || album.title }).pipe(takeUntilDestroyed(this.destroy)).subscribe({ next: d => { const target = track || album; target.saved = true; target.saved_id = d.id; this.data.update(value => value ? { ...value } : value); this.busy.set(false); }, error: e => { this.error.set(errorCopy(e)); this.busy.set(false); } });
    }
}
