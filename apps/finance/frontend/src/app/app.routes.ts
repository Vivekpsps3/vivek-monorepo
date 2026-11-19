import { inject } from '@angular/core';
import type { Routes } from '@angular/router';
import { legacyPayDestination, redirectLegacyImports } from './core/layout/finance-navigation';
import { redirectLegacyPlanningQuery } from './planning/planning-destinations';
import { MainLayoutComponent } from './core/layout/main-layout.component';
import { authGuard } from '@vivek/ui';
import { vaultGuard } from './crypto/vault.guard';
import { MarketRefreshCoordinatorService } from './services/market-refresh-coordinator.service';

export const routes: Routes = [
  { path: 'vault/setup', title: 'Create vault · Finance', canActivate: [authGuard], loadComponent: () => import('./vault/vault-setup.component').then(m => m.VaultSetupComponent) },
  { path: 'vault/unlock', title: 'Unlock your vault · Finance', canActivate: [authGuard, () => { inject(MarketRefreshCoordinatorService); return true; }], loadComponent: () => import('./vault/vault-unlock.component').then(m => m.VaultUnlockComponent) },
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
        title: 'Net worth · Finance',
        loadComponent: () => import('./hubs/have-hub.component').then(m => m.HaveHubComponent),
      },
      {
        path: 'spending',
        title: 'Spending · Finance',
        canActivate: [redirectLegacyImports],
        runGuardsAndResolvers: 'paramsOrQueryParamsChange',
        loadComponent: () => import('./hubs/spending-hub.component').then(m => m.SpendingHubComponent),
      },
      {
        path: 'imports',
        title: 'Imports · Finance',
        loadComponent: () => import('./imports/imports.component').then(m => m.ImportsComponent),
      },
      {
        path: 'bills',
        title: 'Bills and subscriptions · Finance',
        loadComponent: () => import('./bills/bills.component').then(m => m.BillsComponent),
      },
      {
        path: 'pay',
        title: 'Pay · Finance',
        loadComponent: () => import('./income/pay.component').then(m => m.PayComponent),
      },
      {
        path: 'planning',
        children: [
          {
            path: '',
            pathMatch: 'full',
            title: 'Planning · Finance',
            canActivate: [redirectLegacyPlanningQuery],
            runGuardsAndResolvers: 'paramsOrQueryParamsChange',
            data: { planningTool: 'overview' },
            loadComponent: () => import('./planning/planning.component').then(m => m.PlanningComponent),
          },
          {
            path: 'retirement',
            title: 'Retirement · Finance',
            data: { planningTool: 'retirement-target' },
            loadComponent: () => import('./planning/planning.component').then(m => m.PlanningComponent),
          },
          {
            path: 'simulation',
            title: 'Simulation · Finance',
            data: { planningTool: 'simulation' },
            loadComponent: () => import('./planning/planning.component').then(m => m.PlanningComponent),
          },
          {
            path: 'savings',
            title: 'Savings · Finance',
            data: { planningTool: 'savings-goal' },
            loadComponent: () => import('./planning/planning.component').then(m => m.PlanningComponent),
          },
          {
            path: 'debt',
            title: 'Debt · Finance',
            data: { planningTool: 'debt-payoff' },
            loadComponent: () => import('./planning/planning.component').then(m => m.PlanningComponent),
          },
          {
            path: 'projection',
            title: 'Projection · Finance',
            loadComponent: () => import('./investment-insights/investment-insights.component').then(m => m.InvestmentInsightsComponent),
          },
          {
            path: 'research',
            title: 'Stock research · Finance',
            loadComponent: () => import('./stock-lab/stock-lab.component').then(m => m.StockLabComponent),
          },
        ],
      },
      { path: 'balance-sheet', pathMatch: 'full', redirectTo: () => '/finance/have' },
      { path: 'portfolio', pathMatch: 'full', redirectTo: () => '/finance/have?t=holdings' },
      { path: 'transactions', pathMatch: 'full', redirectTo: () => '/finance/spending' },
      { path: 'calendar', pathMatch: 'full', redirectTo: () => '/finance/spending?t=calendar' },
      { path: 'recurring', pathMatch: 'full', redirectTo: route => legacyPayDestination(route.queryParamMap) },
      { path: 'income', pathMatch: 'full', redirectTo: route => legacyPayDestination(route.queryParamMap) },
      { path: 'fixed-expenses', pathMatch: 'full', redirectTo: () => '/finance/bills' },
      { path: 'subscriptions', pathMatch: 'full', redirectTo: () => '/finance/bills' },
      { path: 'investment-insights', pathMatch: 'full', redirectTo: () => '/finance/planning/projection' },
      { path: 'stock-lab', pathMatch: 'full', redirectTo: () => '/finance/planning/research' },
      { path: 'charts', pathMatch: 'full', redirectTo: '' },
      {
        path: '**',
        title: 'Page not found · Finance',
        loadComponent: () => import('./not-found/not-found.component').then(m => m.NotFoundComponent),
      },
    ],
  },
];
