import { TestBed } from "@angular/core/testing";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { provideHttpClient } from "@angular/common/http";
import { SESSION_CONTEXT } from "@vivek/ui";
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

  function setup() {
    TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: SESSION_CONTEXT,
          useValue: { currentUser: { id: 1 } },
        },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(SettingsComponent);
    fixture.detectChanges();
    httpMock.expectOne("/travel/api/settings").flush(settingsBody());
    fixture.detectChanges();
    const component = fixture.componentInstance as SettingsComponent;
    return { fixture, component };
  }

  afterEach(() => httpMock?.verify());

  it("adopts hours per day from settings and saves changes", () => {
    const { component } = setup();
    expect(component.hoursPerDay).toBe("8");
    expect(component.ptoDirty).toBeFalse();
    component.hoursPerDay = "7.5";
    expect(component.ptoDirty).toBeTrue();
    component.savePto();
    const req = httpMock.expectOne("/travel/api/settings/pto");
    expect(req.request.method).toBe("PUT");
    expect(req.request.body).toEqual({ hours_per_day: "7.5" });
    req.flush({ hours_per_day: "7.5", sick_prompt_dismissed: false });
    expect(component.ptoDirty).toBeFalse();
    expect(component.ptoMessage()).toContain("saved");
  });

  it("does not save when hours per day is unchanged", () => {
    const { component } = setup();
    component.savePto();
    httpMock.expectNone("/travel/api/settings/pto");
  });
});
