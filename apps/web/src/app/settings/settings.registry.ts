import { Type } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';

export interface SettingsSection {
  /** Child path under `/settings`. A new section is one entry plus its component. */
  path: string;
  label: string;
  loadComponent: () => Promise<Type<unknown>>;
  data?: Record<string, unknown>;
  canDeactivate?: CanDeactivateFn<{ canLeave?: () => boolean | Promise<boolean> }>[];
}

const leaveTravelSettings: CanDeactivateFn<{ canLeave?: () => boolean | Promise<boolean> }> = component =>
  component.canLeave ? component.canLeave() : true;

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  {
    path: 'account',
    label: 'Account',
    loadComponent: () => import('./account-section.component').then(m => m.AccountSectionComponent),
  },
  {
    path: 'appearance',
    label: 'Appearance',
    loadComponent: () => import('./appearance-section.component').then(m => m.AppearanceSectionComponent),
  },
  {
    path: 'travel',
    label: 'Travel',
    loadComponent: () => import('../../../../travel/frontend/src/public-api').then(m => m.loadTravelSettings()),
    data: { embedded: true },
    canDeactivate: [leaveTravelSettings],
  },
  {
    path: 'finance',
    label: 'Finance',
    loadComponent: () => import('./finance-section.component').then(m => m.FinanceSectionComponent),
  },
  {
    path: 'about',
    label: 'About',
    loadComponent: () => import('./about-section.component').then(m => m.AboutSectionComponent),
  },
];
