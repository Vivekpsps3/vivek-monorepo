import { inject } from '@angular/core';
import { Router, type CanActivateFn, type ParamMap } from '@angular/router';
import { legacyPayDestination } from '../core/layout/finance-navigation';
import type { PlanningToolId } from '../models/planning.model';

export interface PlanningDestination {
  id: 'retirement' | 'simulation' | 'savings' | 'debt' | 'projection' | 'research';
  label: string;
  detail: string;
  path: string;
  tool?: PlanningToolId;
}

export const PLANNING_DESTINATIONS: readonly PlanningDestination[] = [
  {
    id: 'retirement',
    label: 'Retirement',
    detail: 'Estimate a target from spending you already record.',
    path: '/finance/planning/retirement',
    tool: 'retirement-target',
  },
  {
    id: 'simulation',
    label: 'Simulation',
    detail: 'Compare a what-if with your current plan.',
    path: '/finance/planning/simulation',
    tool: 'simulation',
  },
  {
    id: 'savings',
    label: 'Savings',
    detail: 'See what a goal needs each month.',
    path: '/finance/planning/savings',
    tool: 'savings-goal',
  },
  {
    id: 'debt',
    label: 'Debt',
    detail: 'Estimate how long a payoff takes.',
    path: '/finance/planning/debt',
    tool: 'debt-payoff',
  },
  {
    id: 'projection',
    label: 'Projection',
    detail: 'Project portfolio growth without changing balances.',
    path: '/finance/planning/projection',
  },
  {
    id: 'research',
    label: 'Stock research',
    detail: 'Look up a ticker and a purchase plan.',
    path: '/finance/planning/research',
  },
];

const TOOL_PATH: Readonly<Record<string, string>> = {
  simulation: '/finance/planning/simulation',
  'retirement-target': '/finance/planning/retirement',
  'savings-goal': '/finance/planning/savings',
  'debt-payoff': '/finance/planning/debt',
};

/** Where an old planning query should land. Null stays on the index. */
export function legacyPlanningDestination(params: ParamMap | null | undefined): string | null {
  const tab = params?.get('t');
  if (tab === 'compensation') return legacyPayDestination(params);
  if (tab === 'growth') return '/finance/planning/projection';
  if (tab === 'stocks') return '/finance/planning/research';
  const tool = params?.get('tool');
  return tool && TOOL_PATH[tool] ? TOOL_PATH[tool] : null;
}

export const redirectLegacyPlanningQuery: CanActivateFn = route => {
  const next = legacyPlanningDestination(route.queryParamMap);
  return next ? inject(Router).parseUrl(next) : true;
};
