import { Component, DestroyRef, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MediaCardComponent } from './media-card.component';
import { MediaCard, NextEpisode, errorCopy } from './media.models';
interface Summary {
    currently: MediaCard[];
    next_episodes: NextEpisode[];
    recent_reviews: {
        id: number;
        title: string;
        review_excerpt: string;
        rating: number | null;
    }[];
    upcoming: {
        id: number;
        title: string;
        when: string;
        release_on: string | null;
    }[];
    counts: {
        library: number;
    };
}
@Component({ standalone: true, imports: [RouterLink, MediaCardComponent], template: `
<main class="page media-page"><header class="page-heading"><div><p class="eyebrow">Your media, at your pace</p><h1>Now</h1><p class="muted">Pick up where you left off.</p></div><a class="btn btn-primary" routerLink="/media/search">Find something new</a></header>
@if(error()){<p class="local-error" role="alert">{{error()}}</p><button class="btn" (click)="load()">Retry Now</button>}
@if(data();as summary){
@if(summary.next_episodes.length){<section class="surface"><h2>Next episodes</h2>@for(episode of summary.next_episodes;track episode.episode_id){<article class="episode-row"><div><a [routerLink]="['/media/item',episode.entry_id]"><strong>{{episode.show_title}}</strong></a><p>S{{episode.season}} E{{episode.episode}} · {{episode.title}} · {{episode.air_date}} @if(episode.state==='upcoming'){ · Upcoming}</p></div><a class="btn" [routerLink]="['/media/item',episode.entry_id]">Open series</a></article>}</section>}
<section><h2>In progress</h2><div class="media-grid">@for(item of summary.currently;track item.id){<media-card [item]="item"/>}@empty{<p class="muted">Nothing in progress. Choose something from your library when you're ready.</p>}</div></section>
@if(summary.upcoming.length){<section class="surface"><h2>Looking forward to</h2>@for(item of summary.upcoming;track item.id){<p><a [routerLink]="['/media/item',item.id]">{{item.title}}</a> · {{item.release_on || 'Date unknown'}}</p>}</section>}
@if(summary.recent_reviews.length){<section class="surface"><h2>Recent notes</h2>@for(review of summary.recent_reviews;track review.id){<article><h3><a [routerLink]="['/media/item',review.id]">{{review.title}}</a></h3><p>{{review.review_excerpt}}</p></article>}</section>}
@if(!summary.counts.library){<section class="empty-state"><h2>A place for your favorites</h2><p>Add a book, film, album, or anything you'd like to return to.</p><a class="btn" routerLink="/media/search">Start your library</a></section>}
}@else{@if(!error()){<p role="status">Loading your media…</p>}}</main>` })
export class NowComponent {
    private readonly http = inject(HttpClient);
    private readonly destroy = inject(DestroyRef);
    readonly data = signal<Summary | null>(null);
    readonly error = signal('');
    constructor() { this.load(); }
    load(): void { this.error.set(''); this.http.get<Summary>('/media/api/summary').pipe(takeUntilDestroyed(this.destroy)).subscribe({ next: d => this.data.set(d), error: e => this.error.set(errorCopy(e)) }); }
}
