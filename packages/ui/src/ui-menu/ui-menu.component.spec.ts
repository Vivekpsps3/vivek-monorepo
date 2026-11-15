import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { UiButtonComponent } from "../ui-button/ui-button.component";
import { UiMenuItemDirective } from "./ui-menu-item.directive";
import { UiMenuComponent } from "./ui-menu.component";

@Component({
  standalone: true,
  imports: [UiMenuComponent, UiMenuItemDirective, UiButtonComponent],
  template: `
    <button id="outside">Outside</button>
    <ui-button style="display: inline-block" [variant]="variant">Reference action</ui-button>
    <ui-menu label="Add" icon="plus" [variant]="variant" (opened)="addOpened($event)">
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
  variant: "secondary" | "ghost" = "secondary";
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
  let root: HTMLElement;
  let menus: UiMenuComponent[];
  let fixture: import("@angular/core/testing").ComponentFixture<MenuHost>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [MenuHost] }).compileComponents();
    fixture = TestBed.createComponent(MenuHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
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

});
