import { Component, inject } from "@angular/core";
import { Router, RouterOutlet } from "@angular/router";
import { UiSectionNavComponent } from "@vivek/ui";
import { mediaSectionLinks } from "./library-filters.mjs";
import { mediaSections } from "./media-navigation";
@Component({
  selector: "media-layout",
  standalone: true,
  imports: [RouterOutlet, UiSectionNavComponent],
  template: `<div class="media-workspace">
    <ui-section-nav label="Media sections" [items]="sectionLinks()" />
    <router-outlet />
  </div>`,
})
export class MediaComponent {
  readonly sections = mediaSections;
  private readonly router = inject(Router);

  /** Collection links keep the open library's compatible query. All items stays clean. */
  sectionLinks() {
    return mediaSectionLinks(this.router.url, this.sections);
  }
}
