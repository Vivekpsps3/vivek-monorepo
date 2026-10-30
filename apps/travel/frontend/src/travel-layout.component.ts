import { Component } from "@angular/core";
import { RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
@Component({
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `<div class="travel-workspace">
    <nav class="feature-nav" aria-label="Travel">
      <a
        routerLink="/travel"
        routerLinkActive="active"
        [routerLinkActiveOptions]="{ exact: true }"
        >Trips</a
      ><a routerLink="/travel/calendar" routerLinkActive="active">Calendar</a
      ><a routerLink="/travel/pto" routerLinkActive="active">PTO</a>
    </nav>
    <router-outlet />
  </div>`,
})
export class TravelLayoutComponent {}
