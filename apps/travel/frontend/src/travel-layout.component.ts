import { Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import { UiSectionNavComponent, type UiSectionNavItem } from "@vivek/ui";
@Component({
  standalone: true,
  imports: [RouterOutlet, UiSectionNavComponent],
  template: `<div class="travel-workspace">
    <ui-section-nav label="Travel sections" [items]="sections" />
    <router-outlet />
  </div>`,
})
export class TravelLayoutComponent {
  readonly sections: UiSectionNavItem[] = [
    { label: "Trips", link: "/travel", exact: true, also: ["/travel/trips"] },
    { label: "Calendar", link: "/travel/calendar" },
    { label: "PTO", link: "/travel/pto" },
  ];
}
