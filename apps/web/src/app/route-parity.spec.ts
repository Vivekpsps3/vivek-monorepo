import { Route, Routes } from '@angular/router';
import { authGuard } from '@vivek/ui';
import { loadFinanceRoutes } from '../../../finance/frontend/src/public-api';
import { routes as mediaRoutes } from '../../../media/frontend/src/public-api';
import { routes as siteRoutes } from '../../../site/src/public-api';
import { routes as travelRoutes } from '../../../travel/frontend/src/public-api';
import routeExamples from '../../route-examples.json';
import routeManifest from '../../routes.json';
import { PIXELS_ROUTES } from './pixels/pixels.routes';
import { PrivateLayoutComponent } from './private-layout.component';
import { routes } from './routes';
import { SETTINGS_SECTIONS } from './settings/settings.registry';
import { SETTINGS_ROUTES } from './settings/settings.routes';

interface RouteExample {
  id: string;
  path: string;
  owner: string;
  status: string;
  query?: string;
  fragment?: string;
  angular?: string;
  clientRedirect?: string;
  target?: string;
}

interface Registered {
  path: string;
  kind: 'page' | 'redirect';
  target?: string;
}

const examples = routeExamples.examples as RouteExample[];
const aliases = routeManifest.aliases as Record<string, string>;

function join(prefix: string, segment: string): string {
  if (!segment) return prefix;
  if (!prefix) return segment;
  return `${prefix}/${segment}`;
}

function redirectTarget(route: Route, prefix: string): string {
  const redirect = route.redirectTo;
  const raw = typeof redirect === 'function' ? String(redirect({} as never)) : String(redirect ?? '');
  if (raw.startsWith('/')) return raw.slice(1);
  return join(prefix, raw);
}

function walk(tree: Routes, prefix: string, into: Registered[]): void {
  for (const route of tree) {
    if (route.path === '**') continue;
    const full = join(prefix, route.path ?? '');
    if (route.redirectTo != null) {
      into.push({ path: full, kind: 'redirect', target: redirectTarget(route, prefix) });
      continue;
    }
    if (route.children?.length) {
      walk(route.children, full, into);
      continue;
    }
    if (route.loadChildren) continue;
    into.push({ path: full, kind: 'page' });
  }
}

function stitch(children: Routes, lazy: Record<string, Routes>): Routes {
  return children.map(route => {
    const replacement = route.path ? lazy[route.path] : undefined;
    if (replacement && route.loadChildren) return { ...route, children: replacement };
    if (route.children) return { ...route, children: stitch(route.children, lazy) };
    return route;
  });
}

function pathPattern(routePath: string): RegExp {
  const body = routePath.split('/').map(part => (
    part.startsWith(':') ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  )).join('/');
  return new RegExp(`^${body}$`);
}

function fill(template: string, concrete: string, pattern: string): string {
  const params = new Map<string, string>();
  const values = concrete.split('/');
  pattern.split('/').forEach((part, index) => {
    if (part.startsWith(':')) params.set(part.slice(1), values[index] ?? '');
  });
  return template.split('/').map(part => {
    const [head, ...query] = part.split('?');
    const filled = head.startsWith(':') ? params.get(head.slice(1)) ?? head : head;
    return query.length ? `${filled}?${query.join('?')}` : filled;
  }).join('/');
}

function documentKind(path: string): 'alias' | 'public' | 'private' | 'missing' {
  const normalized = path.replace(/^\/+|\/+$/g, '');
  if (Object.prototype.hasOwnProperty.call(aliases, normalized)) return 'alias';
  if ((routeManifest.public as readonly string[]).includes(normalized)) return 'public';
  const covered = (routeManifest.private as readonly string[]).some(pattern => (
    new RegExp(`^(?:${pattern})$`).test(normalized)
  ));
  return covered ? 'private' : 'missing';
}

function sample(routePath: string): string {
  return routePath.replace(/:[^/]+/g, '42');
}

describe('route parity', () => {
  let registered: Registered[] = [];

  beforeAll(async () => {
    const financeRoutes = await loadFinanceRoutes();
    const found: Registered[] = [];
    let siteStitched = false;
    for (const route of routes) {
      if (route.loadChildren && route.path === '') {
        if (!siteStitched) {
          walk(siteRoutes, '', found);
          siteStitched = true;
        }
        continue;
      }
      if (route.children) {
        walk(stitch(route.children, {
          settings: SETTINGS_ROUTES,
          pixels: PIXELS_ROUTES,
          finance: financeRoutes,
          travel: travelRoutes,
          media: mediaRoutes,
        }), route.path ?? '', found);
        continue;
      }
      walk([route], '', found);
    }
    registered = found;
  });

  it('builds settings routes from the registry', () => {
    const childPaths = SETTINGS_ROUTES[0]?.children?.flatMap(route => route.path ? [route.path] : []) ?? [];
    expect(childPaths).toEqual(SETTINGS_SECTIONS.map(section => section.path));
    for (const section of SETTINGS_SECTIONS) {
      expect(documentKind(`settings/${section.path}`)).withContext(section.path).toBe('private');
    }
    expect(documentKind('settings')).toBe('private');
    expect(documentKind('settings/not-a-section')).toBe('missing');
  });

  it('keeps the private layout behind authGuard', () => {
    const layout = routes.find(route => route.component === PrivateLayoutComponent);
    expect(layout?.canActivateChild).toEqual([authGuard]);
  });

  it('registers mounted and public examples and leaves reserved paths unmounted', () => {
    for (const example of examples) {
      const hits = registered.filter(route => pathPattern(route.path).test(example.path));
      if (example.status === 'reserved' || example.status.startsWith('unknown')) {
        expect(hits).withContext(example.id).toEqual([]);
        continue;
      }
      if (example.status === 'alias') {
        expect(aliases[example.path]).withContext(example.id).toBe(example.target);
        continue;
      }
      expect(hits.length).withContext(example.id).toBeGreaterThan(0);
      if (example.angular) {
        expect(registered.some(route => route.path === example.angular)).withContext(example.id).toBeTrue();
      }
      if (example.clientRedirect) {
        const redirect = hits.find(route => route.kind === 'redirect');
        expect(redirect).withContext(example.id).toBeDefined();
        expect(fill(redirect?.target ?? '', example.path, redirect?.path ?? '')).toBe(example.clientRedirect);
      }
    }
    const profile = examples.find(example => example.id === 'profile');
    expect(profile?.fragment).toBe('birthday');
    expect(profile?.owner).toBe('settings');
  });

  it('matches every registered page and redirect to a document or alias', () => {
    expect(registered.length).toBeGreaterThan(0);
    for (const route of registered) {
      const concrete = sample(route.path);
      const kind = documentKind(concrete.split('?')[0]);
      expect(kind).withContext(route.path).not.toBe('missing');
    }
  });
});
