import { Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import { UiSectionNavComponent } from "@vivek/ui";
import { mediaSections } from "./media-navigation";
@Component({
  selector: "media-layout",
  standalone: true,
  imports: [RouterOutlet, UiSectionNavComponent],
  template: `<div class="media-workspace">
    <ui-section-nav label="Media sections" [items]="sections" />
    <router-outlet />
  </div>`,
})
export class MediaComponent {
  readonly sections = mediaSections;
}
