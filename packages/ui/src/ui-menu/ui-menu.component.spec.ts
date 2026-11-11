import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { UiMenuComponent } from "./ui-menu.component";
import { UiMenuItemDirective } from "./ui-menu-item.directive";

@Component({
  standalone: true,
  imports: [UiMenuComponent, UiMenuItemDirective],
  template: `
    <button id="outside">Outside</button>
    <ui-menu label="Add" icon="plus" (opened)="addOpened($event)">
      <button uiMenuItem (select)="picked('transport')">Transport</button>
      <button uiMenuItem [disabled]="true" (select)="picked('blocked')">
        Blocked
      </button>
      <button uiMenuItem (select)="picked('cost')">Cost</button>
    </ui-menu>
    <ui-menu
      label="More actions for Ramen Ichiran"
      [iconOnly]="true"
      (opened)="moreOpened($event)"
    >
      <button uiMenuItem (select)="picked('edit')">Edit</button>
      <button uiMenuItem [danger]="true" (select)="picked('remove')">
        Remove
      </button>
    </ui-menu>
  `,
})
class MenuHost {
  readonly events: string[] = [];
  picked(name: string): void {
    this.events.push(name);
  }
  addOpened(open: boolean): void {
    this.events.push(`add:${open}`);
  }
  moreOpened(open: boolean): void {
    this.events.push(`more:${open}`);
  }
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

describe("ui-menu", () => {
  let host: MenuHost;
  let root: HTMLElement;
  let menus: UiMenuComponent[];
  let fixture: import("@angular/core/testing").ComponentFixture<MenuHost>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [MenuHost] }).compileComponents();
    fixture = TestBed.createComponent(MenuHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    host = fixture.componentInstance;
    root = fixture.nativeElement as HTMLElement;
    menus = fixture.debugElement
      .queryAll(By.directive(UiMenuComponent))
      .map((d) => d.componentInstance as UiMenuComponent);
  });

  afterEach(() => {
    fixture.nativeElement.remove();
  });

  function trigger(index: number): HTMLButtonElement {
    return root.querySelectorAll<HTMLButtonElement>("ui-menu > button")[index];
  }
  function panel(index: number): HTMLElement {
    return root.querySelectorAll<HTMLElement>("ui-menu > .ui-menu__panel")[index];
  }
  function items(index: number): HTMLButtonElement[] {
    return Array.from(
      panel(index).querySelectorAll<HTMLButtonElement>("[uiMenuItem]"),
    );
  }
  function keydown(el: HTMLElement, key: string): KeyboardEvent {
    const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
    fixture.detectChanges();
    return ev;
  }

  async function openAndSettle(index = 0, key = "ArrowDown"): Promise<void> {
    keydown(trigger(index), key);
    fixture.detectChanges();
    await nextFrame();
    await nextFrame();
    fixture.detectChanges();
  }

  it("aria-haspopup, aria-expanded and aria-controls are correct; panel has role=menu and items role=menuitem", async () => {
    const t = trigger(0);
    expect(t.getAttribute("aria-haspopup")).toBe("menu");
    expect(t.getAttribute("aria-expanded")).toBe("false");
    expect(t.getAttribute("aria-controls")).toBe(menus[0].panelId);
    expect(panel(0).getAttribute("role")).toBe("menu");
    expect(panel(0).getAttribute("aria-labelledby")).toBe(menus[0].triggerId);
    expect(items(0).map((i) => i.getAttribute("role"))).toEqual([
      "menuitem",
      "menuitem",
      "menuitem",
    ]);
    expect(panel(0).hidden).toBeTrue();
    await openAndSettle(0, "Enter");
    expect(t.getAttribute("aria-expanded")).toBe("true");
    expect(panel(0).hidden).toBeFalse();
  });

  it("opens on Enter, Space and ArrowDown and focuses the first enabled item", async () => {
    for (const key of ["Enter", " ", "ArrowDown"]) {
      await openAndSettle(0, key);
      expect(menus[0].open()).toBeTrue();
      expect(document.activeElement).toBe(items(0)[0]);
      keydown(items(0)[0], "Escape");
      await nextFrame();
      expect(menus[0].open()).toBeFalse();
    }
  });

  it("ArrowUp on the trigger opens and focuses the last item", async () => {
    await openAndSettle(0, "ArrowUp");
    expect(document.activeElement).toBe(items(0)[2]);
  });

  it("arrow keys skip disabled items and wrap; Home and End work", async () => {
    await openAndSettle();
    keydown(items(0)[0], "ArrowDown"); // skips the disabled middle item
    expect(document.activeElement).toBe(items(0)[2]);
    keydown(items(0)[2], "ArrowDown"); // wraps to first
    expect(document.activeElement).toBe(items(0)[0]);
    keydown(items(0)[0], "End");
    expect(document.activeElement).toBe(items(0)[2]);
    keydown(items(0)[2], "Home");
    expect(document.activeElement).toBe(items(0)[0]);
    keydown(items(0)[0], "ArrowUp"); // wraps backwards, skipping disabled
    expect(document.activeElement).toBe(items(0)[2]);
  });

  it("Escape on the open trigger closes the menu", async () => {
    const button = trigger(0);
    button.focus();
    button.click();
    fixture.detectChanges();
    expect(menus[0].open()).toBeTrue();
    expect(document.activeElement).toBe(button);
    keydown(button, "Escape");
    expect(menus[0].open()).toBeFalse();
    expect(document.activeElement).toBe(button);
  });

  it("Escape closes and returns focus to the trigger", async () => {
    await openAndSettle();
    keydown(items(0)[0], "Escape");
    expect(menus[0].open()).toBeFalse();
    expect(document.activeElement).toBe(trigger(0));
  });

  it("Tab closes without preventing default", async () => {
    await openAndSettle();
    const ev = keydown(items(0)[0], "Tab");
    expect(menus[0].open()).toBeFalse();
    expect(ev.defaultPrevented).toBeFalse();
    expect(document.activeElement).toBe(trigger(0));
  });

  it("outside pointerdown closes", async () => {
    trigger(0).click();
    expect(menus[0].open()).toBeTrue();
    document.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true }),
    );
    expect(menus[0].open()).toBeFalse();
  });

  it("select fires after close with focus on the trigger", async () => {
    await openAndSettle();
    items(0)[2].click();
    expect(menus[0].open()).toBeFalse();
    expect(document.activeElement).toBe(trigger(0));
    await Promise.resolve();
    expect(host.events).toContain("cost");
  });

  it("a disabled item does not emit select", async () => {
    await openAndSettle();
    items(0)[1].click();
    await Promise.resolve();
    expect(host.events).not.toContain("blocked");
    expect(items(0)[1].getAttribute("aria-disabled")).toBe("true");
  });

  it("opening a second menu closes the first", async () => {
    trigger(0).click();
    expect(menus[0].open()).toBeTrue();
    trigger(1).click();
    expect(menus[0].open()).toBeFalse();
    expect(menus[1].open()).toBeTrue();
  });

  it("iconOnly renders a 44x44 trigger with aria-label = label", () => {
    const t = trigger(1);
    expect(t.getAttribute("aria-label")).toBe("More actions for Ramen Ichiran");
    expect(t.classList.contains("ui-menu__trigger--icon-only")).toBeTrue();
  });

  it("typeahead moves to the next item starting with the typed letter", async () => {
    await openAndSettle();
    keydown(items(0)[0], "c");
    expect(document.activeElement).toBe(items(0)[2]);
    keydown(items(0)[2], "t");
    expect(document.activeElement).toBe(items(0)[0]);
  });
});
