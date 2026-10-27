import { Component, DestroyRef, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Home, Trip, travelError } from './travel.models';
@Component({ standalone: true, imports: [RouterLink], template: `<main class="page travel-page"><header class="page-heading"><div><p class="eyebrow">Your time away</p><h1>Trips</h1><p class="muted">A little space for where you're going next.</p></div><a class="btn btn-primary" routerLink="/travel/trips/new">New trip</a></header>
@if(error()){<p class="local-error" role="alert">{{error()}}</p><button class="btn" (click)="load()">Retry trips</button>}
@if(data();as home){@if(home.pto.configured){<p class="surface">PTO balance today: <strong>{{home.pto.balance_today}} days</strong> · <a routerLink="/travel/pto">View forecast</a></p>}
@if(home.attention.length){<section><h2>Needs a look</h2>@for(item of home.attention;track $index){<p><a [routerLink]="['/travel/trips',item.trip_id]">{{item.trip_title}}</a> · {{item.text}}</p>}</section>}
@for(group of groups(home);track group.title){@if(group.trips.length){<section><h2>{{group.title}}</h2><div class="trip-grid">@for(trip of group.trips;track trip.id){<a class="trip-card surface" [routerLink]="['/travel/trips',trip.id]"><p class="eyebrow">{{trip.status}}</p><h3>{{trip.title}}</h3><p>{{trip.start_date}} – {{trip.end_date}}</p><p class="muted">{{trip.cities.join(' → ')}} · {{trip.pto_days_effective}} PTO days</p>@if(trip.pto.conflicts.length){<p>PTO overlaps</p>}</a>}</div></section>}}
@if(!home.in_progress.length&&!home.upcoming.length){<section class="empty-state"><h2>Your next trip starts with a date</h2><p>Add a destination and dates. Flights, bookings, and plans can follow.</p><a class="btn" routerLink="/travel/trips/new">Plan a trip</a></section>}
@if(home.past.length){<details><summary>Past trips ({{home.past.length}})</summary><div class="trip-grid">@for(trip of home.past;track trip.id){<a class="trip-card surface" [routerLink]="['/travel/trips',trip.id]"><h3>{{trip.title}}</h3><p>{{trip.start_date}} – {{trip.end_date}}</p></a>}</div></details>}
}@else{@if(!error()){<p role="status">Loading trips…</p>}}</main>` })
export class TravelComponent {
    private readonly http = inject(HttpClient);
    private readonly destroy = inject(DestroyRef);
    readonly data = signal<Home | null>(null);
    readonly error = signal('');
    constructor() { this.load(); }
    load(): void { this.error.set(''); this.http.get<Home>('/travel/api/home').pipe(takeUntilDestroyed(this.destroy)).subscribe({ next: d => this.data.set(d), error: e => this.error.set(travelError(e)) }); }
    groups(home: Home): {
        title: string;
        trips: Trip[];
    }[] { return [{ title: 'Away now', trips: home.in_progress }, { title: 'Coming up', trips: home.upcoming }]; }
}
