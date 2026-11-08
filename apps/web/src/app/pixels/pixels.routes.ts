import { Routes } from '@angular/router';
import { PixelsShellComponent } from './pixels-shell.component';

export const PIXELS_ROUTES: Routes = [
  {
    path: '',
    component: PixelsShellComponent,
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'Pixels',
        loadComponent: () => import('./year-page.component').then(m => m.YearPageComponent),
      },
      {
        path: 'life',
        title: 'Life in Pixels',
        loadComponent: () => import('./life-page.component').then(m => m.LifePageComponent),
      },
    ],
  },
];
