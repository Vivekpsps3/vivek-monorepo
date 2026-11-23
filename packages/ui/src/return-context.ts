import { Location } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { safeNextPathFrom } from './after-auth';
import { SESSION_CONTEXT } from './session-context';

const spendingTabs = ['activity', 'calendar', 'review', 'imports', 'spend', 'pay'];
const flag = ['1'];
const month = (value: string) => /^(?!0000)\d{4}-(?:0[1-9]|1[0-2])$/.test(value);

function isIsoMondayDate(value: string): boolean {
  if (!isReturnDate(value)) return false;
  return new Date(`${value}T00:00:00Z`).getUTCDay() === 1;
}

export function isReturnDate(value: string): boolean {
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

type Coordinate = readonly string[] | ((value: string) => boolean);

const compensationRange = {
  year: (value: string) => value === 'all' || value === 'custom' || /^(?!0000)\d{4}$/.test(value),
  start: isReturnDate, end: isReturnDate,
  compensation_start: isReturnDate, compensation_end: isReturnDate,
};

const destinations: Readonly<Record<string, Readonly<Record<string, Coordinate>>>> = {
  '/finance': {},
  '/finance/embed': {},
  '/finance/have': { t: ['sheet', 'balance', 'assets', 'liabilities', 'holdings'] },
  '/finance/spending': {
    t: spendingTabs, v: ['all', 'income', 'spending'], month: value => value === 'all' || month(value),
    date: isReturnDate, from: isReturnDate, through: isReturnDate, pixelsDay: isReturnDate,
    periodStart: isReturnDate, periodEnd: isReturnDate, priorStart: isReturnDate, priorEnd: isReturnDate, add: flag, receipts: flag,
  },
  '/finance/imports': { start: ['bank', 'fidelity'] },
  '/finance/bills': {
    kind: ['all', 'bill', 'subscription'], status: ['all', 'active', 'inactive'], order: ['latest', 'soonest'],
  },
  '/finance/pay': { month, history: flag, ...compensationRange },
  '/finance/income': { month, history: flag, ...compensationRange },
  '/finance/recurring': {
    t: ['income', 'spend', 'pay', 'bills', 'subs', 'compensation'], month, history: flag, ...compensationRange,
    kind: ['all', 'bill', 'subscription'], status: ['all', 'active', 'inactive'], order: ['latest', 'soonest'],
  },
  '/finance/planning': {
    t: ['growth', 'stocks', 'compensation'], ...compensationRange,
    tool: ['simulation', 'retirement-target', 'savings-goal', 'debt-payoff'],
  },
  '/finance/planning/retirement': {},
  '/finance/planning/simulation': {},
  '/finance/planning/savings': {},
  '/finance/planning/debt': {},
  '/finance/planning/projection': {},
  '/finance/planning/research': {},
  '/town': {},
  '/town/library': {},
  '/town/hall': { object: ['rules', 'progress', 'archive'] },
  '/town/cosmetics': {
    item: (value: string) => /^[a-z][a-z0-9-]{0,39}$/.test(value),
    part: ['day', 'night'],
  },
  '/town/review': { week: isIsoMondayDate },
  '/town/clinic': { entry: isHealthEntryId },
  '/town/gym': { entry: isHealthEntryId },
  '/town/world': { day: isReturnDate, week: isReturnDate },
  '/pixels': { year: value => /^(?!0+$)\d{1,4}$/.test(value), day: isReturnDate },
  '/pixels/day': {
    date: isReturnDate,
    from: ['year', 'life'],
    year: value => /^(?!0+$)\d{1,4}$/.test(value),
    span: isReturnDate,
  },
  '/pixels/life': { span: isReturnDate },
  '/hub': {},
  '/hub/admin': {},
  '/hub/agenda': { date: isReturnDate, sources: ['', 'travel', 'media', 'travel,media', 'media,travel'] },
  '/media': {},
  '/media/library': {
    kind: ['', 'movie', 'tv', 'book', 'artist', 'album', 'track', 'game'],
    status: ['want', 'anticipating', 'in_progress', 'completed', 'paused', 'dropped', 'following', 'unfollowed'],
    sort: ['activity', 'title', 'rating', 'newest'], fav: flag,
    offset: value => /^(?:0|[1-9]\d{0,6})$/.test(value),
    face: ['spine', 'text'],
  },
  '/media/calendar': { month },
  '/media/add': {},
  '/media/search': {},
  '/travel': {},
  '/travel/terminal': {
    object: ['board', 'desk', 'table'],
    trip: value => /^[1-9]\d{0,15}$/.test(value),
    leg: value => /^[1-9]\d{0,15}$/.test(value),
    day: isReturnDate,
  },
  '/travel/calendar': { month },
  '/travel/trips/new': {},
  '/travel/settings': {},
  '/travel/pto': {},
  '/settings': {},
  '/settings/account': {},
  '/settings/profile': {},
  '/settings/appearance': {},
  '/settings/game': {},
  '/settings/connections': {},
  '/settings/finance': {},
  '/settings/travel': {},
  '/settings/calendars': {},
  '/settings/about': {},
};

const financeAliases = new Set([
  'balance-sheet', 'portfolio', 'transactions', 'calendar', 'fixed-expenses',
  'subscriptions', 'investment-insights', 'stock-lab', 'charts',
]);

/** Return links carry public navigation coordinates, never free-form filters or record fields. */
export function returnPath(next: string): string | null {
  const path = safeNextPathFrom(next);
  if (!path) return null;
  const url = new URL(path, window.location.origin);
  const pathname = url.pathname.replace(/\/$/, '') || '/';
  if (!Object.hasOwn(destinations, pathname)) {
    return pathname.startsWith('/finance/') && financeAliases.has(pathname.slice('/finance/'.length))
      ? pathname : null;
  }
  const allowed = destinations[pathname];
  const query = new URLSearchParams();
  for (const [key, rule] of Object.entries(allowed)) {
    const [value, ...duplicates] = url.searchParams.getAll(key);
    if (value === undefined || duplicates.length) continue;
    if (typeof rule === 'function' ? rule(value) : rule.includes(value)) query.set(key, value);
  }
  const suffix = query.toString();
  return suffix ? pathname + '?' + suffix : pathname;
}

export function vaultReturnQuery(next: string): { next?: string } {
  const valid = returnPath(next);
  return valid ? { next: valid } : {};
}

/** Health client ids are navigation coordinates, not measurement values. */
export function isHealthEntryId(value: string): boolean {
  return /^hlt_[A-Za-z0-9_-]{22}$/.test(value);
}

export function vaultUnlockHref(next: string): string {
  const valid = returnPath(next);
  return '/finance/vault/unlock' + (valid ? '?next=' + encodeURIComponent(valid) : '');
}

export function vaultSetupHref(next: string): string {
  const valid = returnPath(next);
  return '/finance/vault/setup' + (valid ? '?next=' + encodeURIComponent(valid) : '');
}

export function currentVaultReturn(): string | null {
  return returnPath(new URLSearchParams(window.location.search).get('next') ?? '');
}

interface ViewPosition {
  top: number;
  focus: string | null;
}

function focusKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return /^\d{1,16}$/.test(value) || isReturnDate(value) ? value : null;
}

const SOURCE = 'suiteReturnSource';
const VIEW = 'suiteReturnView';

interface HistoryState {
  [SOURCE]?: { path?: unknown; owner?: unknown };
  [VIEW]?: { path?: unknown; owner?: unknown; top?: unknown; focus?: unknown };
}

/** Owner-bound presentation state on the originating browser entry. */
@Injectable({ providedIn: 'root' })
export class ReturnContext {
  private readonly location = inject(Location);
  private readonly router = inject(Router);
  private readonly session = inject(SESSION_CONTEXT, { optional: true });

  private get owner(): number | undefined { return this.session?.currentUser?.id; }

  link(source: string): Record<string, unknown> {
    const path = returnPath(source);
    return path && this.owner ? { [SOURCE]: { path, owner: this.owner } } : {};
  }

  sourceState(source: string): Record<string, unknown> {
    const expected = returnPath(source);
    const saved = this.state()[SOURCE];
    if (!expected || !this.owner || saved?.owner !== this.owner || saved.path !== expected) return {};
    return { [SOURCE]: { path: expected, owner: this.owner } };
  }

  back(source: string): boolean {
    if (!Object.hasOwn(this.sourceState(source), SOURCE)) return false;
    this.location.back();
    return true;
  }

  finishVault(): Promise<boolean> {
    const next = currentVaultReturn();
    if (next && this.back(next)) return Promise.resolve(true);
    return this.router.navigateByUrl(next ?? (window.self === window.top ? '/finance' : '/finance/embed'), {
      replaceUrl: true,
    });
  }

  saveView(path: string, focus: string | null = null): void {
    if (typeof window === 'undefined' || !this.owner || !this.at(path)) return;
    const current = this.state();
    window.history.replaceState({
      ...current,
      [VIEW]: { owner: this.owner, path, top: Math.round(window.scrollY), focus: focusKey(focus) },
    }, '');
  }

  view(path: string): ViewPosition | null {
    const saved = this.state()[VIEW];
    if (!this.owner || saved?.owner !== this.owner || saved.path !== path) return null;
    if (typeof saved.top !== 'number' || !Number.isSafeInteger(saved.top) || saved.top < 0) return null;
    return { top: saved.top, focus: focusKey(saved.focus) };
  }

  /** Saved return path for this owner, or null when the entry has none. */
  origin(): string | null {
    const saved = this.state()[SOURCE];
    if (!this.owner || saved?.owner !== this.owner || typeof saved.path !== 'string') return null;
    return returnPath(saved.path);
  }

  private at(path: string): boolean {
    return this.router.url.split(/[?#]/)[0].replace(/\/$/, '') === path
      && this.location.path().split(/[?#]/)[0].replace(/\/$/, '') === path;
  }

  private state(): HistoryState {
    return (this.location.getState() as HistoryState | null) ?? {};
  }
}
