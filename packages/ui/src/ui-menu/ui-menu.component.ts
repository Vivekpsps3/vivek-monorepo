import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  contentChildren,
  inject,
  input,
  output,
  signal,
  viewChild,
  type OnDestroy,
} from "@angular/core";
import { UiIconComponent, type UiIconName } from "../ui-icon/ui-icon.component";
import { UiMenuItemDirective } from "./ui-menu-item.directive";

let uiMenuSeq = 0;

/** The one menu open at a time; opening a menu closes any other. */
const openMenuSlot: { current: UiMenuComponent | null } = { current: null };

function claimOpenMenu(menu: UiMenuComponent): void {
  if (openMenuSlot.current && openMenuSlot.current !== menu) {
    openMenuSlot.current.close();
  }
  openMenuSlot.current = menu;
}

function releaseOpenMenu(menu: UiMenuComponent): void {
  if (openMenuSlot.current === menu) openMenuSlot.current = null;
}

/**
 * A menu button: a `ui-button`-styled trigger plus a panel of `uiMenuItem`
 * buttons.
 *
 * The panel renders inside the host (no portal), and the host is
 * `position: relative`. Callers must not place a menu inside an
 * `overflow: hidden` ancestor that would clip the panel; feature code places
 * menus where nothing clips.
 */
@Component({
  selector: "ui-menu",
  standalone: true,
  imports: [UiIconComponent],
  templateUrl: "./ui-menu.component.html",
  styleUrl: "./ui-menu.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiMenuComponent implements OnDestroy {
  label = input.required<string>();
  icon = input<UiIconName | undefined>(undefined);
  iconOnly = input(false);
  variant = input<"secondary" | "ghost">("secondary");
  align = input<"start" | "end">("end");

  opened = output<boolean>();

  private readonly items = contentChildren(UiMenuItemDirective);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly trigger =
    viewChild.required<ElementRef<HTMLButtonElement>>("trigger");
  private readonly panel =
    viewChild.required<ElementRef<HTMLElement>>("panel");

  private readonly seq = ++uiMenuSeq;
  readonly triggerId = `ui-menu-trigger-${this.seq}`;
  readonly panelId = `ui-menu-${this.seq}`;

  readonly open = signal(false);
  readonly openUp = signal(false);

  triggerClasses(): string {
    const base = `ui-btn ui-btn--${this.variant()} ui-btn--md`;
    return this.iconOnly() ? `${base} ui-menu__trigger--icon-only` : base;
  }

  onTriggerClick(): void {
    if (this.open()) {
      this.close();
    } else {
      this.openMenu("none");
    }
  }

  onTriggerKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case "Enter":
      case " ":
      case "ArrowDown":
        event.preventDefault();
        if (!this.open()) this.openMenu("first");
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!this.open()) this.openMenu("last");
        break;
    }
  }

  onPanelClick(event: MouseEvent): void {
    const target = (event.target as HTMLElement).closest("[uiMenuItem]");
    if (!target) return;
    const item = this.items().find((candidate) => candidate.element === target);
    if (!item || item.isDisabled) return;
    this.activate(item);
  }

  onPanelKeydown(event: KeyboardEvent): void {
    const enabled = this.enabledItems();
    const active = document.activeElement as HTMLElement | null;
    const currentIndex = enabled.findIndex((item) => item.element === active);
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (enabled.length) enabled[(currentIndex + 1) % enabled.length].focus();
        break;
      case "ArrowUp":
        event.preventDefault();
        if (enabled.length) {
          enabled[
            (currentIndex - 1 + enabled.length) % enabled.length
          ].focus();
        }
        break;
      case "Home":
        event.preventDefault();
        enabled[0]?.focus();
        break;
      case "End":
        event.preventDefault();
        enabled[enabled.length - 1]?.focus();
        break;
      case "Escape":
        event.preventDefault();
        this.close();
        this.trigger().nativeElement.focus();
        break;
      case "Tab":
        // Close and refocus the trigger, but let the Tab proceed.
        this.close();
        this.trigger().nativeElement.focus();
        break;
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          this.typeahead(event.key, currentIndex, enabled);
        }
    }
  }

  @HostListener("document:pointerdown", ["$event"])
  onDocumentPointerDown(event: PointerEvent): void {
    if (!this.open()) return;
    if (!(this.host.nativeElement as HTMLElement).contains(event.target as Node)) {
      this.close();
    }
  }

  ngOnDestroy(): void {
    releaseOpenMenu(this);
  }

  close(): void {
    if (!this.open()) return;
    this.open.set(false);
    releaseOpenMenu(this);
    this.opened.emit(false);
  }

  private openMenu(focus: "first" | "last" | "none"): void {
    claimOpenMenu(this);
    this.openUp.set(false);
    this.open.set(true);
    this.opened.emit(true);
    requestAnimationFrame(() => {
      if (!this.open()) return;
      this.measureFlip();
      if (focus === "none") return;
      const enabled = this.enabledItems();
      if (!enabled.length) {
        this.panel().nativeElement.focus();
        return;
      }
      (focus === "last" ? enabled[enabled.length - 1] : enabled[0]).focus();
    });
  }

  private measureFlip(): void {
    const panel = this.panel().nativeElement;
    const rect = panel.getBoundingClientRect();
    if (rect.bottom > window.innerHeight) {
      this.openUp.set(true);
    }
  }

  private activate(item: UiMenuItemDirective): void {
    this.close();
    this.trigger().nativeElement.focus();
    queueMicrotask(() => item.fireSelect());
  }

  private typeahead(
    char: string,
    currentIndex: number,
    enabled: UiMenuItemDirective[],
  ): void {
    if (!enabled.length) return;
    const needle = char.toLowerCase();
    for (let step = 1; step <= enabled.length; step++) {
      const candidate = enabled[(currentIndex + step) % enabled.length];
      if (candidate.text.toLowerCase().startsWith(needle)) {
        candidate.focus();
        return;
      }
    }
  }

  private enabledItems(): UiMenuItemDirective[] {
    return this.items().filter((item) => !item.isDisabled);
  }
}
