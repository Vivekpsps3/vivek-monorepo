import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { RouterLink } from "@angular/router";

@Component({
  selector: "ui-page-header",
  standalone: true,
  imports: [RouterLink],
  templateUrl: "./ui-page-header.component.html",
  styleUrl: "./ui-page-header.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiPageHeaderComponent {
  title = input.required<string>();
  subtitle = input<string | undefined>(undefined);
  eyebrow = input<string | undefined>(undefined);
  /** Link shown above the eyebrow. Label keeps the existing back copy. */
  backLabel = input<string | undefined>(undefined);
  backLink = input<string | undefined>(undefined);
  /** Keeps an existing programmatic focus target, such as the library heading. */
  titleId = input<string | undefined>(undefined);
  titleTabIndex = input<number | undefined>(undefined);
  embedded = input(false);
}
