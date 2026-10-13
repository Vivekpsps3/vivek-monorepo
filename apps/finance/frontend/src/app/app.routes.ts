import { Routes } from '@angular/router';
import { MainLayoutComponent } from './core/layout/main-layout.component';
import { adminGuard, authGuard } from './auth/auth.guard';
import { vaultGuard } from './crypto/vault.guard';

export const routes: Routes = [
  {
    path: 'login',
    title: 'Sign in · Finance',
    loadComponent: () => import('./auth/login.component').then(m => m.LoginComponent),
  },
  {
    path: 'signup',
    title: 'Sign up · Finance',
    loadComponent: () => import('./auth/signup.component').then(m => m.SignupComponent),
  },
  {
    path: 'enroll',
    redirectTo: 'signup',
    pathMatch: 'full',
  },
  {
    path: 'vault/setup',
    title: 'Create vault · Finance',
    canActivate: [authGuard],
    loadComponent: () => import('./vault/vault-setup.component').then(m => m.VaultSetupComponent),
  },
  {
    path: 'vault/unlock',
    title: 'Unlock vault · Finance',
    canActivate: [authGuard],
    loadComponent: () => import('./vault/vault-unlock.component').then(m => m.VaultUnlockComponent),
  },
  {
    path: 'embed',
    title: 'Net worth · Finance',
    canActivate: [authGuard, vaultGuard],
    loadComponent: () =>
      import('./embed/net-worth-embed.component').then(m => m.NetWorthEmbedComponent),
  },
  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [authGuard, vaultGuard],
    children: [
      {
        path: '',
        title: 'Home · Finance',
        loadComponent: () =>
          import('./dashboard/dashboard.component').then(m => m.DashboardComponent),
      },
      {
        path: 'have',
        title: 'What you have · Finance',
        loadComponent: () => import('./hubs/have-hub.component').then(m => m.HaveHubComponent),
      },
      {
        path: 'spending',
        title: 'Spending · Finance',
        loadComponent: () => import('./hubs/spending-hub.component').then(m => m.SpendingHubComponent),
      },
      {
        path: 'recurring',
        title: 'Recurring · Finance',
        loadComponent: () => import('./hubs/recurring-hub.component').then(m => m.RecurringHubComponent),
      },
      {
        path: 'planning',
        title: 'Planning · Finance',
        loadComponent: () => import('./hubs/planning-hub.component').then(m => m.PlanningHubComponent),
      },
      { path: 'balance-sheet', pathMatch: 'full', redirectTo: () => '/have' },
      { path: 'portfolio', pathMatch: 'full', redirectTo: () => '/have?t=holdings' },
      { path: 'transactions', pathMatch: 'full', redirectTo: () => '/spending' },
      { path: 'calendar', pathMatch: 'full', redirectTo: () => '/spending?t=calendar' },
      { path: 'income', pathMatch: 'full', redirectTo: () => '/recurring' },
      { path: 'fixed-expenses', pathMatch: 'full', redirectTo: () => '/recurring?t=spend' },
      { path: 'subscriptions', pathMatch: 'full', redirectTo: () => '/recurring?t=spend' },
      { path: 'investment-insights', pathMatch: 'full', redirectTo: () => '/planning?t=growth' },
      { path: 'stock-lab', pathMatch: 'full', redirectTo: () => '/planning?t=stocks' },
      { path: 'charts', pathMatch: 'full', redirectTo: '' },
      {
        path: 'admin/users',
        title: 'Users · Finance',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./admin/users/admin-users.component').then(m => m.AdminUsersComponent),
      },
      {
        path: '**',
        title: 'Page not found · Finance',
        loadComponent: () => import('./not-found/not-found.component').then(m => m.NotFoundComponent),
      },
    ],
  },
];
