import { Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import { UiSectionNavComponent, type UiSectionNavItem } from "@vivek/ui";
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
  readonly sections: UiSectionNavItem[] = [
    { label: "Now", link: "/media", exact: true },
    { label: "Library", link: "/media/library" },
    { label: "Search", link: "/media/search" },
    { label: "Calendar", link: "/media/calendar" },
    { label: "Add manually", link: "/media/add" },
  ];
}
