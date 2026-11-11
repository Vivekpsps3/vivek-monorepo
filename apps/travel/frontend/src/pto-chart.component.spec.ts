import { TestBed } from "@angular/core/testing";
import { PtoChartComponent } from "./pto-chart.component";
import type { PtoChartSeries } from "./pto-chart.mjs";

function point(
  on: string,
  days: string,
  hours: string,
  kinds: string[] = [],
  projected = false,
) {
  return { on, days, hours, kinds, projected };
}

function body() {
  return {
    today: "2026-06-15",
    horizon_end: "2026-12-31",
    policy_year_end: "2026-12-31",
    rolled_over: false,
    days_left_in_policy_year: 199,
    pto: {
      balance_horizon_days: "12",
      balance_horizon_hours: "96",
      first_negative: { on: "2026-11-02", days: "-1.5", hours: "-12" },
      points: [
        point("2026-01-01", "10", "80", ["as_of", "month"]),
        point("2026-06-15", "11", "88", ["today"]),
        point("2026-12-31", "-1.5", "-12", ["horizon"], true),
      ],
    },
    sick: {
      balance_horizon_days: "4",
      balance_horizon_hours: "32",
      first_negative: null,
      points: [
        point("2026-01-01", "2", "16", ["as_of", "month"]),
        point("2026-06-15", "3", "24", ["today"]),
        point("2026-12-31", "4", "32", ["horizon"], true),
      ],
    },
  };
}

describe("PtoChartComponent combined forecast", () => {
  function render(series: PtoChartSeries | null, wide = false) {
    TestBed.configureTestingModule({ imports: [PtoChartComponent] });
    const fixture = TestBed.createComponent(PtoChartComponent);
    fixture.componentRef.setInput("series", series);
    fixture.componentInstance.wide.set(wide);
    fixture.detectChanges();
    return fixture;
  }

  it("draws one plot with both symbols, a dashed projection, and the equivalent table", () => {
    const fixture = render(body(), false);
    const root = fixture.nativeElement as HTMLElement;
    const svg = root.querySelector("svg.pto-forecast");
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("aria-hidden")).toBe("true");
    expect(svg!.querySelector("[tabindex]")).toBeNull();
    expect(root.querySelector("circle.pto-marker-pto")).not.toBeNull();
    expect(root.querySelector("rect.pto-marker-sick")).not.toBeNull();
    expect(root.querySelector("path.pto-line-pto:not(.pto-future)")).not.toBeNull();
    expect(root.querySelector("path.pto-future")).not.toBeNull();
    expect(root.querySelector("line.pto-today")).not.toBeNull();
    expect(root.querySelector("line.pto-zero")).not.toBeNull();
    expect(root.querySelector("rect.pto-band")).not.toBeNull();
    expect(root.textContent).toContain("● PTO");
    expect(root.textContent).toContain("■ Sick");
    expect(root.textContent).toContain("Today");
    expect(root.textContent).toContain("PTO drops below zero on Nov 2, 2026");
    expect(root.textContent).toContain("end of your policy year");
    const table = root.querySelector("table");
    expect(table?.querySelector("caption")?.textContent).toBe("Balance by month");
    expect(table?.textContent).toContain("11 days");
    expect(table?.textContent).toContain("88 h");
    expect(table?.textContent).not.toContain("999");
    expect((svg as SVGElement).style.height).toBe("220px");
    fixture.componentInstance.wide.set(true);
    fixture.detectChanges();
    expect((root.querySelector("svg.pto-forecast") as SVGElement).style.height).toBe("300px");
  });

  it("renders nothing when neither bucket has points", () => {
    const fixture = render({ ...body(), pto: null, sick: null });
    expect((fixture.nativeElement as HTMLElement).querySelector("svg")).toBeNull();
  });

  it("keeps a single point visible", () => {
    const root = render({
      ...body(),
      sick: null,
      pto: {
        balance_horizon_days: "2",
        balance_horizon_hours: "16",
        first_negative: null,
        points: [point("2026-06-15", "2", "16", ["as_of", "today"])],
      },
    }).nativeElement as HTMLElement;
    expect(root.querySelectorAll("circle.pto-marker-pto").length).toBe(1);
    expect(root.querySelector("path")).toBeNull();
    expect(root.querySelector("table")?.textContent).toContain("2 days");
  });
});
