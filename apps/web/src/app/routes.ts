import { Routes } from '@angular/router';
import { authGuard, adminGuard } from '@vivek/ui';
import { PrivateLayoutComponent } from './private-layout.component';
import type { WeeklyReviewComponent } from './town/health/review-editor.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', loadChildren: () => import('../../../site/src/public-api').then(m => m.routes) },
  { path: 'auth/login', title: 'Sign in', loadComponent: () => import('./platform/auth/login.component').then(m => m.LoginComponent) },
  { path: 'auth/signup', title: 'Create account', loadComponent: () => import('./platform/auth/signup.component').then(m => m.SignupComponent) },
  { path: 'login', redirectTo: 'auth/login', pathMatch: 'full' },
  { path: 'signup', redirectTo: 'auth/signup', pathMatch: 'full' },
  { path: 'enroll', redirectTo: 'auth/signup', pathMatch: 'full' },
  { path: '', component: PrivateLayoutComponent, canActivateChild: [authGuard], children: [
    { path: 'account', redirectTo: () => '/settings/account', pathMatch: 'full' },
    { path: 'settings', loadChildren: () => import('./settings/settings.routes').then(m => m.SETTINGS_ROUTES) },
  { path: 'hub/admin', title: 'Account administration', canActivate: [authGuard, adminGuard], loadComponent: () => import('./account/suite-admin.component').then(m => m.SuiteAdminComponent) },
  { path: 'hub', title: 'Workspace', canActivate: [authGuard], loadComponent: () => import('./hub/hub.component').then(m => m.HubComponent), children: [
    { path: '', pathMatch: 'full', children: [] },
    { path: 'agenda', title: 'Hub agenda', children: [] },
  ] },
    { path: 'town', title: 'Town', children: [
      { path: '', loadComponent: () => import('./town/town.component').then(m => m.TownComponent) },
      { path: 'home', pathMatch: 'full', redirectTo: '/town/home/living' },
      { path: 'home/:room', title: 'Town · Home', loadComponent: () => import('./town/home-room.component').then(m => m.HomeRoomComponent) },
      { path: 'library', title: 'Town · Reading Hall', loadComponent: () => import('./town/library-room.component').then(m => m.LibraryRoomComponent) },
      { path: 'hall', title: 'Town · Hall', loadComponent: () => import('./town/hall-room.component').then(m => m.HallRoomComponent) },
      { path: 'quests', title: 'Town · Optional quests', loadComponent: () => import('./town/quests.component').then(m => m.QuestsComponent) },
      { path: 'residents', title: 'Town · Residents', loadComponent: () => import('./town/residents.component').then(m => m.ResidentsComponent) },
      { path: 'cosmetics', pathMatch: 'full', redirectTo: ({ queryParams }) => {
        const item = queryParams?.['item'];
        if (typeof item !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(item)) return '/town/home/living';
        return import('./town/cosmetic-catalog').then(m => m.catalogItemDestination(item, queryParams['part']));
      } },
      { path: 'workshop', title: 'Town · Workshop', loadComponent: () => import('./town/workshop.component').then(m => m.WorkshopComponent) },
      { path: 'keepsakes', title: 'Town · Keepsakes', loadComponent: () => import('./town/keepsake-page.component').then(m => m.KeepsakePageComponent) },
      { path: 'memory', title: 'Town · Memory Shelves', loadComponent: () => import('./town/memory-shelves.component').then(m => m.MemoryShelvesComponent) },
      { path: 'clinic', title: 'Town · Clinic', data: { healthRoom: 'clinic' }, loadComponent: () => import('./town/health/health-room.component').then(m => m.HealthRoomComponent) },
      { path: 'gym', title: 'Town · Gym', data: { healthRoom: 'gym' }, loadComponent: () => import('./town/health/health-room.component').then(m => m.HealthRoomComponent) },
      {
        path: 'review',
        title: 'Town · Weekly review',
        loadComponent: () => import('./town/health/review-editor.component').then(m => m.WeeklyReviewComponent),
        canDeactivate: [(editor: WeeklyReviewComponent | null) => editor?.canLeave() ?? true],
        runGuardsAndResolvers: (from, to) => from.queryParamMap.get('week') !== to.queryParamMap.get('week'),
      },
      { path: 'world', title: 'World', loadComponent: () => import('./world/ui/world.component').then(m => m.WorldComponent) },
    ] },
    { path: 'pixels', loadChildren: () => import('./pixels/pixels.routes').then(m => m.PIXELS_ROUTES) },
  { path: 'finance', loadChildren: () => import('../../../finance/frontend/src/public-api').then(m => m.loadFinanceRoutes()) },
  { path: 'travel', canActivate: [authGuard], loadChildren: () => import('../../../travel/frontend/src/public-api').then(m => m.routes) },
  { path: 'media', canActivate: [authGuard], loadChildren: () => import('../../../media/frontend/src/public-api').then(m => m.routes) },
  ] },
  { path: '', loadChildren: () => import('../../../site/src/public-api').then(m => m.routes) },
];
