import { TestBed } from "@angular/core/testing";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { provideHttpClient } from "@angular/common/http";
import { provideRouter } from "@angular/router";
import { SESSION_CONTEXT, ToastService } from "@vivek/ui";
import { SettingsComponent } from "./settings.component";

function settingsBody(hoursPerDay = "8") {
  return {
    flightaware: { configured: false, source: "none", last4: null },
    google_maps_key_configured: false,
    google_maps_key_source: "none",
    google_maps_key_last4: null,
    pto: { hours_per_day: hoursPerDay, sick_prompt_dismissed: false },
  };
}

describe("SettingsComponent PTO settings (TPTO2A)", () => {
  let httpMock: HttpTestingController;

  function setup(hoursPerDay = "8") {
    TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: SESSION_CONTEXT,
          useValue: { currentUser: { id: 1 } },
        },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(SettingsComponent);
    fixture.detectChanges();
    httpMock.expectOne("/travel/api/settings").flush(settingsBody(hoursPerDay));
    fixture.detectChanges();
    const component = fixture.componentInstance as SettingsComponent;
    return { fixture, component };
  }

  afterEach(() => httpMock?.verify());

  it("adopts hours per day from settings and saves changes", () => {
    const { component } = setup();
    const toast = TestBed.inject(ToastService);
    spyOn(toast, "success");
    expect(component.hours).toBe("8");
    expect(component.hoursDirty()).toBeFalse();
    component.editHours("7.5");
    expect(component.hoursDirty()).toBeTrue();
    component.saveHours();
    const req = httpMock.expectOne("/travel/api/settings/pto");
    expect(req.request.method).toBe("PUT");
    expect(req.request.body).toEqual({ hours_per_day: "7.5" });
    req.flush({ hours_per_day: "7.5", sick_prompt_dismissed: false });
    expect(component.hoursDirty()).toBeFalse();
    expect(toast.success).toHaveBeenCalledWith("Hours in a workday saved.");
  });

  it("canonicalizes a comma and keeps a grandfathered workday", () => {
    const { component } = setup();
    component.editHours("7,5");
    component.checkHours();
    expect(component.hours).toBe("7.5");
    expect(component.hoursError()).toBe("");
    component.saveHours();
    const saved = httpMock.expectOne("/travel/api/settings/pto");
    expect(saved.request.body).toEqual({ hours_per_day: "7.5" });
    saved.flush({ hours_per_day: "7.5", sick_prompt_dismissed: false });
    expect(component.hours).toBe("7.5");
  });

  it("keeps a stored workday that a new edit would reject", () => {
    const { component } = setup("7.125");
    component.editHours("7,125");
    component.saveHours();
    httpMock.expectNone("/travel/api/settings/pto");
    expect(component.hours).toBe("7.125");
    expect(component.hoursError()).toBe("");
  });

  it("does not save when hours per day is unchanged", () => {
    const { component } = setup();
    component.saveHours();
    httpMock.expectNone("/travel/api/settings/pto");
  });
});
