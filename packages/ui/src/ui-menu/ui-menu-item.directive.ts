import {
  Directive,
  ElementRef,
  HostListener,
  inject,
  input,
  output,
} from "@angular/core";

/**
 * One item inside a `ui-menu`. Put it on a native `<button>`:
 *
 * ```html
 * <button uiMenuItem [danger]="true" (select)="remove()">Remove</button>
 * ```
 *
 * The directive owns the menuitem semantics; the enclosing `UiMenuComponent`
 * owns open/close. An enabled click bubbles to the menu, which closes,
 * returns focus to its trigger and only then asks the directive to emit
 * `select` (in a microtask), so a dialog opened from `select` restores focus
 * to the trigger.
 */
@Directive({
  selector: "[uiMenuItem]",
  standalone: true,
  host: {
    role: "menuitem",
    type: "button",
    tabindex: "-1",
    "[attr.aria-disabled]": 'disabled() ? "true" : null',
    "[class.ui-menu-item--danger]": "danger()",
  },
})
export class UiMenuItemDirective {
  danger = input(false);
  disabled = input(false);

  select = output<void>();

  private readonly el = inject(ElementRef<HTMLElement>);

  get element(): HTMLElement {
    return this.el.nativeElement as HTMLElement;
  }

  get isDisabled(): boolean {
    return this.disabled();
  }

  get text(): string {
    return (this.element.textContent ?? "").trim();
  }

  focus(): void {
    this.element.focus();
  }

  /** Called by the menu after it has closed and refocused its trigger. */
  fireSelect(): void {
    this.select.emit();
  }

  @HostListener("click", ["$event"])
  onClick(event: MouseEvent): void {
    if (this.disabled()) {
      event.preventDefault();
      event.stopPropagation();
    }
    // Enabled clicks bubble to the menu panel, which activates the item.
  }
}
