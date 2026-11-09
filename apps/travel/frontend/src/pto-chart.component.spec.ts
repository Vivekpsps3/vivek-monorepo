import { TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { PtoChartComponent, type PtoSeriesPoint } from "./pto-chart.component";

const point = (
  on: string,
  days: string,
  kinds: string[] = [],
  projected = false,
): PtoSeriesPoint => ({ on, days, hours: days, kinds, projected });

describe("PtoChartComponent (TPTO2B)", () => {
  it("renders a step path, today marker, and caption from series points", async () => {
    TestBed.configureTestingModule({ imports: [PtoChartComponent] });
    const fixture = TestBed.createComponent(PtoChartComponent);
    fixture.componentRef.setInput("points", [
      point("2026-01-01", "5.00", ["as_of"]),
      point("2026-01-15", "5.00", ["today"]),
      point("2026-02-01", "3.50", ["charge", "horizon"], true),
    ]);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const path = root.querySelector("path.pto-chart-line");
    expect(path).not.toBeNull();
    expect(path!.getAttribute("d")).toContain(" H ");
    expect(path!.getAttribute("d")).toContain(" V ");
    expect(root.querySelector("circle.pto-chart-today")).not.toBeNull();
    // All balances stay positive, so no zero line.
    expect(root.querySelector("line.pto-chart-zero")).toBeNull();
    expect(root.textContent).toContain("Today: 5 days");
    const svg = root.querySelector("svg");
    expect(svg!.getAttribute("aria-label")).toContain("Time off balance");
  });

  it("draws the zero line when the balance goes negative", async () => {
    TestBed.configureTestingModule({ imports: [PtoChartComponent] });
    const fixture = TestBed.createComponent(PtoChartComponent);
    fixture.componentRef.setInput("points", [
      point("2026-01-01", "2.00", ["as_of"]),
      point("2026-02-01", "-1.00", ["zero", "horizon"], true),
    ]);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector("line.pto-chart-zero")).not.toBeNull();
  });

  it("draws a y-axis label and a point target that shows the date and days", async () => {
    TestBed.configureTestingModule({ imports: [PtoChartComponent] });
    const fixture = TestBed.createComponent(PtoChartComponent);
    fixture.componentRef.setInput("points", [
      point("2026-01-01", "5.00", ["as_of"]),
      point("2026-01-15", "5.00", ["today"]),
      point("2026-02-01", "3.50", ["horizon"], true),
    ]);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const tick = root.querySelector(".pto-chart-tick");
    expect(tick).not.toBeNull();
    expect(tick!.textContent?.trim()).toMatch(/^-?\d+(\.\d+)?$/);
    const target = fixture.debugElement.query(By.css(".pto-chart-point"));
    expect(target).not.toBeNull();
    expect(target.nativeElement.getAttribute("tabindex")).toBe("0");
    target.triggerEventHandler("focus", {});
    fixture.detectChanges();
    const tip = root.querySelector(".pto-chart-tip")?.textContent ?? "";
    expect(tip).toContain("Jan 1");
    expect(tip).toContain("5.00 days");
    expect(tip).toContain("5.00 hours");
    expect(root.querySelector("path.pto-chart-line")).not.toBeNull();
    expect(root.textContent).toContain("Today: 5 days");
  });

  it("renders nothing for fewer than two points", async () => {
    TestBed.configureTestingModule({ imports: [PtoChartComponent] });
    const fixture = TestBed.createComponent(PtoChartComponent);
    fixture.componentRef.setInput("points", [point("2026-01-01", "2.00")]);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector("svg")).toBeNull();
  });
});
