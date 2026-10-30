import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from "@angular/core";
import { Params, RouterLink } from "@angular/router";

export type UiButtonVariant =
  "primary" | "secondary" | "ghost" | "danger" | "danger-ghost";
export type UiButtonSize = "sm" | "md";

@Component({
  selector: "ui-button",
  standalone: true,
  imports: [RouterLink],
  templateUrl: "./ui-button.component.html",
  styleUrl: "./ui-button.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiButtonComponent {
  variant = input<UiButtonVariant>("primary");
  size = input<UiButtonSize>("md");
  disabled = input(false);
  /** Stays in the tab order. Native disabled is only for an in-flight busy state. */
  ariaDisabled = input(false);
  describedBy = input<string | undefined>(undefined);
  /** Selected preset. Undefined leaves aria-pressed unset. */
  pressed = input<boolean | null>(null);
  busy = input(false);
  type = input<"button" | "submit" | "reset">("button");
  ariaLabel = input<string | undefined>(undefined);
  /** Passed through to the inner button so the state stays on the control. */
  ariaExpanded = input<boolean | null>(null);
  ariaControls = input<string | undefined>(undefined);
  tooltip = input<string | undefined>(undefined);
  /** In-app path. Renders a link instead of a button. */
  href = input<string | undefined>(undefined);
  /** Visible text when `href` is set. Content projection stays on the button. */
  label = input<string | undefined>(undefined);
  queryParams = input<Params | undefined>(undefined);

  clicked = output<MouseEvent>();

  hostClass = computed(() => {
    const v = this.variant();
    const s = this.size();
    return `ui-btn ui-btn--${v} ui-btn--${s}`;
  });

  onClick(event: MouseEvent): void {
    if (this.disabled() || this.ariaDisabled()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (this.type() === "button") {
      event.preventDefault();
    }
    this.clicked.emit(event);
  }
}
