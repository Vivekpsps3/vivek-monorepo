import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { FormControl,ReactiveFormsModule } from "@angular/forms";
import {
UiSegmentedComponent,
type UiSegmentedOption,
} from "./ui-segmented.component";

const OPTIONS: UiSegmentedOption[] = [
  { value: "g", label: "G" },
  { value: "pg", label: "PG" },
  { value: "r", label: "R" },
];

@Component({
  standalone: true,
  imports: [UiSegmentedComponent, ReactiveFormsModule],
  template: `
    <ui-segmented
      label="Rating"
      [options]="options"
      [value]="value"
      (valueChange)="value = $event"
    />
    <ui-segmented label="Form rating" [options]="options" [formControl]="control" />
  `,
})
class SegmentedHost {
  options = OPTIONS;
  value: string | number | null = "pg";
  control = new FormControl<string | number | null>("g");
}

describe("ui-segmented", () => {
  let host: SegmentedHost;
  let root: HTMLElement;
  let fixture: import("@angular/core/testing").ComponentFixture<SegmentedHost>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SegmentedHost] }).compileComponents();
    fixture = TestBed.createComponent(SegmentedHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    host = fixture.componentInstance;
    root = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    fixture.nativeElement.remove();
  });

  function group(index: number): HTMLElement {
    return root.querySelectorAll<HTMLElement>('[role="radiogroup"]')[index];
  }
  function options(index: number): HTMLButtonElement[] {
    return Array.from(
      group(index).querySelectorAll<HTMLButtonElement>('[role="radio"]'),
    );
  }

  it("works with a reactive FormControl (writeValue, onChange, onTouched, setDisabledState)", () => {
    // writeValue: the form control's initial value is shown checked.
    expect(options(1).map((o) => o.getAttribute("aria-checked"))).toEqual([
      "true",
      "false",
      "false",
    ]);
    // onChange: selecting in the UI writes back to the control.
    options(1)[1].click();
    expect(host.control.value).toBe("pg");
    // onTouched: blurring the group marks the control touched.
    options(1)[1].focus();
    options(1)[1].blur();
    expect(host.control.touched).toBeTrue();
    // setDisabledState: disabling the control blocks selection.
    host.control.disable();
    fixture.detectChanges();
    options(1)[0].click();
    expect(host.control.value).toBe("pg");
    expect(options(1)[0].getAttribute("aria-disabled")).toBe("true");
  });

});
