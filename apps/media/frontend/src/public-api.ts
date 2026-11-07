import { Routes } from "@angular/router";
import { MediaComponent } from "./media.component";
const leave = (component: { canLeave(): boolean | Promise<boolean> }) =>
  component.canLeave();
export const routes: Routes = [
  {
    path: "",
    component: MediaComponent,
    children: [
      {
        path: "",
        pathMatch: "full",
        title: "Media · Now",
        loadComponent: () =>
          import("./now.component").then((m) => m.NowComponent),
      },
      {
        path: "library",
        title: "Media · Library",
        loadComponent: () =>
          import("./library.component").then((m) => m.LibraryComponent),
      },
      {
        path: "search",
        title: "Media · Search",
        loadComponent: () =>
          import("./search.component").then((m) => m.SearchComponent),
      },
      {
        path: "calendar",
        title: "Media · Calendar",
        loadComponent: () =>
          import("./calendar.component").then((m) => m.CalendarComponent),
      },
      { path: "new", redirectTo: "add", pathMatch: "full" },
      {
        path: "add",
        title: "Media · Add",
        canDeactivate: [leave],
        loadComponent: () =>
          import("./add.component").then((m) => m.AddComponent),
      },
      {
        path: "item/:id/discography",
        title: "Media · Discography",
        loadComponent: () =>
          import("./discography.component").then((m) => m.DiscographyComponent),
      },
      {
        path: "item/:id/season/:season",
        redirectTo: "item/:id",
        pathMatch: "full",
      },
      {
        path: "item/:id",
        title: "Media · Item",
        canDeactivate: [leave],
        loadComponent: () =>
          import("./detail.component").then((m) => m.DetailComponent),
      },
    ],
  },
];
