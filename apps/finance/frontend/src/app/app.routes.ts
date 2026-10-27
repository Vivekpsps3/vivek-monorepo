import { Routes } from '@angular/router';
import { MainLayoutComponent } from './core/layout/main-layout.component';
import { authGuard } from '@vivek/ui';
import { vaultGuard } from './crypto/vault.guard';

export const routes: Routes = [
  { path: 'vault/setup', title: 'Create vault · Finance', canActivate: [authGuard], loadComponent: () => import('./vault/vault-setup.component').then(m => m.VaultSetupComponent) },
  { path: 'vault/unlock', title: 'Unlock vault · Finance', canActivate: [authGuard], loadComponent: () => import('./vault/vault-unlock.component').then(m => m.VaultUnlockComponent) },
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
      { path: 'balance-sheet', pathMatch: 'full', redirectTo: () => '/finance/have' },
      { path: 'portfolio', pathMatch: 'full', redirectTo: () => '/finance/have?t=holdings' },
      { path: 'transactions', pathMatch: 'full', redirectTo: () => '/finance/spending' },
      { path: 'calendar', pathMatch: 'full', redirectTo: () => '/finance/spending?t=calendar' },
      { path: 'income', pathMatch: 'full', redirectTo: () => '/finance/recurring' },
      { path: 'fixed-expenses', pathMatch: 'full', redirectTo: () => '/finance/recurring?t=spend' },
      { path: 'subscriptions', pathMatch: 'full', redirectTo: () => '/finance/recurring?t=spend' },
      { path: 'investment-insights', pathMatch: 'full', redirectTo: () => '/finance/planning?t=growth' },
      { path: 'stock-lab', pathMatch: 'full', redirectTo: () => '/finance/planning?t=stocks' },
      { path: 'charts', pathMatch: 'full', redirectTo: '' },
      {
        path: '**',
        title: 'Page not found · Finance',
        loadComponent: () => import('./not-found/not-found.component').then(m => m.NotFoundComponent),
      },
    ],
  },
];
