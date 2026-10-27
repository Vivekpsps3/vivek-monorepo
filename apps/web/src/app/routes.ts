import { Routes } from '@angular/router';
import { authGuard, adminGuard } from '@vivek/ui';
import { PrivateLayoutComponent } from './private-layout.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', loadChildren: () => import('../../../site/src/public-api').then(m => m.routes) },
  { path: 'auth/login', title: 'Sign in', loadComponent: () => import('./platform/auth/login.component').then(m => m.LoginComponent) },
  { path: 'auth/signup', title: 'Create account', loadComponent: () => import('./platform/auth/signup.component').then(m => m.SignupComponent) },
  { path: 'login', redirectTo: 'auth/login', pathMatch: 'full' },
  { path: 'signup', redirectTo: 'auth/signup', pathMatch: 'full' },
  { path: 'enroll', redirectTo: 'auth/signup', pathMatch: 'full' },
  { path: '', component: PrivateLayoutComponent, canActivateChild: [authGuard], children: [
    { path: 'account', redirectTo: () => '/hub?settings=account', pathMatch: 'full' },
  { path: 'hub/admin', title: 'Account administration', canActivate: [authGuard, adminGuard], loadComponent: () => import('./account/suite-admin.component').then(m => m.SuiteAdminComponent) },
  { path: 'hub', title: 'Workspace', pathMatch: 'full', canActivate: [authGuard], loadComponent: () => import('./hub/hub.component').then(m => m.HubComponent) },
  { path: 'finance', loadChildren: () => import('../../../finance/frontend/src/public-api').then(m => m.loadFinanceRoutes()) },
  { path: 'travel', canActivate: [authGuard], loadChildren: () => import('../../../travel/frontend/src/public-api').then(m => m.routes) },
  { path: 'media', canActivate: [authGuard], loadChildren: () => import('../../../media/frontend/src/public-api').then(m => m.routes) },
  ] },
  { path: '', loadChildren: () => import('../../../site/src/public-api').then(m => m.routes) },
];
