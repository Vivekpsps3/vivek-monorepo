import { Routes } from "@angular/router";
import { TravelLayoutComponent } from "./travel-layout.component";
const leave = (component: { canLeave(): boolean | Promise<boolean> }) =>
  component.canLeave();
export const routes: Routes = [
  {
    path: "",
    component: TravelLayoutComponent,
    children: [
      {
        path: "",
        pathMatch: "full",
        title: "Travel · Trips",
        loadComponent: () =>
          import("./travel.component").then((m) => m.TravelComponent),
      },
      {
        path: "terminal",
        title: "Travel · Terminal",
        canDeactivate: [leave],
        loadComponent: () =>
          import("./terminal-hall.component").then((m) => m.TerminalHallComponent),
      },
      {
        path: "trips/new",
        title: "Travel · New trip",
        canDeactivate: [leave],
        loadComponent: () =>
          import("./new-trip.component").then((m) => m.NewTripComponent),
      },
      {
        path: "trips/:id",
        title: "Travel · Trip",
        canDeactivate: [leave],
        loadComponent: () =>
          import("./trip.component").then((m) => m.TripComponent),
      },
      {
        path: "memories",
        title: "Travel · Trip memories",
        canDeactivate: [leave],
        loadComponent: () =>
          import("./memories.component").then((m) => m.MemoriesComponent),
      },
      {
        path: "pto",
        title: "Travel · PTO",
        canDeactivate: [leave],
        loadComponent: () =>
          import("./pto.component").then((m) => m.PtoComponent),
      },
      {
        path: "calendar",
        title: "Travel · Calendar",
        loadComponent: () =>
          import("./calendar.component").then((m) => m.CalendarComponent),
      },
      {
        path: "settings",
        title: "Travel · Settings",
        data: { presentation: "page" },
        canDeactivate: [leave],
        loadComponent: () =>
          import("./settings.component").then((m) => m.SettingsComponent),
      },
    ],
  },
];

export function loadTravelSettings() {
  return import("./settings.component").then((m) => m.SettingsComponent);
}

export { travelSections } from "./travel-navigation";
