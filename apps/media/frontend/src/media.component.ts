import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
@Component({ selector: 'media-layout', standalone: true, imports: [RouterLink, RouterLinkActive, RouterOutlet],
    template: `<div class="media-workspace"><nav class="feature-nav" aria-label="Media"><a routerLink="/media" [routerLinkActiveOptions]="{exact:true}" routerLinkActive="active">Now</a><a routerLink="/media/library" routerLinkActive="active">Library</a><a routerLink="/media/search" routerLinkActive="active">Search</a><a routerLink="/media/calendar" routerLinkActive="active">Calendar</a><a routerLink="/media/add" routerLinkActive="active">Add manually</a></nav><router-outlet /></div>` })
export class MediaComponent {
}
