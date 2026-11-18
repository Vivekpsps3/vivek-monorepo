import { Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import { UiSectionNavComponent } from "@vivek/ui";
import { travelSections } from "./travel-navigation";
@Component({
  standalone: true,
  imports: [RouterOutlet, UiSectionNavComponent],
  template: `<div class="travel-workspace">
    <ui-section-nav label="Travel sections" [items]="sections" />
    <router-outlet />
  </div>`,
})
export class TravelLayoutComponent {
  readonly sections = travelSections;
}
