import { Type } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';

export const SETTINGS_GROUPS = ['Account and security', 'Preferences', 'Connections', null] as const;

export interface SettingsSection {
  group: (typeof SETTINGS_GROUPS)[number];
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
    group: 'Account and security',
    label: 'Account',
    loadComponent: () => import('./account-section.component').then(m => m.AccountSectionComponent),
  },
  {
    path: 'profile',
    group: 'Account and security',
    label: 'Profile',
    loadComponent: () => import('./profile/profile-settings.component').then(m => m.ProfileSettingsComponent),
  },
  {
    path: 'appearance',
    group: 'Preferences',
    label: 'Appearance',
    loadComponent: () => import('./appearance-section.component').then(m => m.AppearanceSectionComponent),
  },
  {
    path: 'game',
    group: 'Preferences',
    label: 'Game',
    loadComponent: () => import('./game-section.component').then(m => m.GameSectionComponent),
  },
  {
    path: 'connections',
    group: 'Connections',
    label: 'Flight schedules',
    loadComponent: () => import('../../../../travel/frontend/src/public-api').then(m => m.loadTravelSettings()),
    data: { presentation: 'connection' },
    canDeactivate: [leaveTravelSettings],
  },
  {
    path: 'travel',
    group: 'Connections',
    label: 'Travel',
    loadComponent: () => import('../../../../travel/frontend/src/public-api').then(m => m.loadTravelSettings()),
    data: { presentation: 'embedded' },
    canDeactivate: [leaveTravelSettings],
  },
  {
    path: 'finance',
    group: 'Account and security',
    label: 'Finance',
    loadComponent: () => import('./finance-section.component').then(m => m.FinanceSectionComponent),
  },
  {
    path: 'calendars',
    group: 'Connections',
    label: 'Calendar subscriptions',
    loadComponent: () => import('./calendar-section.component').then(m => m.CalendarSectionComponent),
  },
  {
    path: 'about',
    group: null,
    label: 'About',
    loadComponent: () => import('./about-section.component').then(m => m.AboutSectionComponent),
  },
];
