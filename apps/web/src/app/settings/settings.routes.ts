import { Routes } from '@angular/router';
import { SettingsShellComponent } from './settings-shell.component';
import { SETTINGS_SECTIONS } from './settings.registry';

export const SETTINGS_ROUTES: Routes = [
  {
    path: '',
    component: SettingsShellComponent,
    title: 'Settings',
    children: [
      { path: '', pathMatch: 'full', children: [] },
      ...SETTINGS_SECTIONS.map(section => ({
        path: section.path,
        title: `${section.label} · Settings`,
        loadComponent: section.loadComponent,
        ...(section.data ? { data: section.data } : {}),
        ...(section.canDeactivate ? { canDeactivate: section.canDeactivate } : {}),
      })),
    ],
  },
];
