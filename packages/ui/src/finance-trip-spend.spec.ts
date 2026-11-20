import { TestBed } from "@angular/core/testing";
import {
FinanceTripSpendRegistry,
type TripSpendLookup,
} from "./finance-trip-spend";

describe("FinanceTripSpendRegistry", () => {
  let registry: FinanceTripSpendRegistry;

  beforeEach(() => {
    registry = TestBed.inject(FinanceTripSpendRegistry);
  });

  it("a stale unregister does not clear a newer registration", () => {
    const first: TripSpendLookup = () => [];
    const second: TripSpendLookup = () => [
      { currency: "EUR", cents: 500, count: 1 },
    ];
    const unregisterFirst = registry.register(first);
    registry.register(second);
    unregisterFirst();
    expect(registry.lookup()).toBe(second);
  });

  it("confirm fails until Finance registers, and a stale release keeps the newer confirmer", async () => {
    await expectAsync(registry.confirm(7, 4)).toBeResolvedTo({ status: "failed" });
    const first = jasmine.createSpy("first").and.resolveTo({ status: "missing" as const });
    const releaseFirst = registry.registerConfirmer(first);
    const second = jasmine.createSpy("second").and.resolveTo({
      status: "posted" as const,
      posting: { id: 4, cents: 42000, label: "2026-11-02 · Travel" },
    });
    registry.registerConfirmer(second);
    releaseFirst();
    await expectAsync(registry.confirm(7, 4)).toBeResolvedTo({
      status: "posted",
      posting: { id: 4, cents: 42000, label: "2026-11-02 · Travel" },
    });
    expect(first).not.toHaveBeenCalled();
    const broken = jasmine.createSpy("broken").and.rejectWith(new Error("offline"));
    registry.registerConfirmer(broken);
    await expectAsync(registry.confirm(7, 4)).toBeResolvedTo({ status: "failed" });
  });
});
