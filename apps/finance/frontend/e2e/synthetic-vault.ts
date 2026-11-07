import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import { errors, expect, Locator, Page } from '@playwright/test';
import { DEFAULT_PBKDF2_ITERATIONS } from '@vivek/browser';
import { frozenNow } from './frozen-clock';

// Finance is a feature of the root router in every test and deployment.
const BASE_PREFIX = '/finance';

function canonicalUrl(url: string): string {
  const queryAt = url.indexOf('?');
  const pathname = queryAt === -1 ? url : url.slice(0, queryAt);
  const search = queryAt === -1 ? '' : url.slice(queryAt);
  const trimmed = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return `${trimmed}${search}`;
}

/** Browser path for an app route. /hub and /auth stay outside the base href. */
export function externalPath(internal: string): string {
  const queryAt = internal.indexOf('?');
  const rawPath = queryAt === -1 ? internal : internal.slice(0, queryAt);
  const search = queryAt === -1 ? '' : internal.slice(queryAt);
  const pathname = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  if (pathname === '/auth' || pathname.startsWith('/auth/') || pathname === '/hub' || pathname.startsWith('/hub/')) {
    return `${pathname}${search}`;
  }
  if (pathname === '/finance' || pathname.startsWith('/finance/')) return `${pathname}${search}`;
  if (pathname === '/') return `${BASE_PREFIX}/${search}`;
  return `${BASE_PREFIX}${pathname}${search}`;
}

function routeReady(target: Page, pathname: string) {
  const bare = pathname.replace(/^\/finance(?=\/|$)/, '') || '/';
  if (bare === '/hub/admin' || bare.startsWith('/hub/admin/')) return target.locator('app-suite-admin');
  if (bare === '/hub' || bare.startsWith('/hub/')) return target.locator('app-hub');
  if (bare === '/') return target.locator('app-dashboard');
  if (bare === '/have' || bare.startsWith('/have/')) return target.locator('app-have-hub');
  if (bare === '/spending' || bare.startsWith('/spending/')) return target.locator('app-spending-hub');
  if (bare === '/recurring' || bare.startsWith('/recurring/')) return target.locator('app-recurring-hub');
  if (bare === '/planning' || bare.startsWith('/planning/')) return target.locator('app-planning-hub');
  if (bare === '/login' || bare.startsWith('/auth/')) return target.getByRole('heading', { level: 1, name: /Sign in|Create/ });
  return target.locator('app-root');
}

/** Form control with this accessible name. Ignores an info-tip button that repeats the label. */
export function field(target: Page | Locator, name: string) {
  return target.locator('input, select, textarea').and(target.getByLabel(name, { exact: true }));
}

type Payload = Record<string, any>;
type QuoteResponse = {
  status?: number;
  symbol?: string;
  price?: number;
  valid?: boolean;
  quote_date?: string;
  price_as_of?: string | null;
};
type RecordRow = {
  collection: string; client_id: string; ciphertext_b64: string;
  schema_version: number; key_version: number; revision: number; updated_at: string;
};

function lastCompletedTradingDate(now = frozenNow()): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDay();
  const daysBack = day === 0 ? 2 : day === 1 ? 3 : day === 6 ? 1 : 0;
  date.setUTCDate(date.getUTCDate() - daysBack);
  return date.toISOString().slice(0, 10);
}

/** Each test uses a fresh key and an in-memory ciphertext server; no real API or vault. */
export async function syntheticVault(
  page: Page,
  seed: Record<string, Payload[]> = {},
  options: { role?: 'user' | 'admin' } = {},
) {
  const context = page.context();
  const attachedPages = new WeakSet<Page>();
  const attach = (target: Page) => {
    if (attachedPages.has(target)) return;
    attachedPages.add(target);
    target.on('pageerror', error => console.error('Synthetic finance browser error:', error.message));
  };
  attach(page);
  // finance_session is httponly. The app only calls /api/auth/me when the
  // readable finance_csrf companion is present, which this synthetic session is.
  await context.addCookies([{
    name: 'finance_csrf',
    value: 'synthetic',
    domain: '127.0.0.1',
    path: '/',
  }]);
  const key = randomBytes(32);
  const passphrase = 'Synthetic finance test passphrase';
  const salt = randomBytes(16);
  const wrapIv = randomBytes(12);
  const wrapCipher = createCipheriv('aes-256-gcm', pbkdf2Sync(passphrase, salt, DEFAULT_PBKDF2_ITERATIONS, 32, 'sha256'), wrapIv);
  const wrappedKey = Buffer.concat([wrapIv, wrapCipher.update(key), wrapCipher.final(), wrapCipher.getAuthTag()]).toString('base64');
  const records = new Map<string, RecordRow>();
  const quoteRequests: string[] = [];
  const quoteRequestDetails: Array<{ symbol: string; refresh: boolean }> = [];
  const quoteResponses = new Map<string, QuoteResponse>();
  const mutations: Array<{ path: string; body: any }> = [];
  let failedWrites = 0;
  let collectionFailure: { collection: string; remaining: number } | null = null;
  let heldUpsertsTarget = 0;
  let heldUpsertsArrived = 0;
  let heldUpsertsGate: Promise<void> | null = null;
  let releaseHeldUpsertsResolve: (() => void) | null = null;
  let heldUpsertsArrivedResolve: (() => void) | null = null;
  let heldUpsertsArrivedPromise: Promise<void> | null = null;
  const identity = (collection: string, clientId: string) => `${collection}/${clientId}`;
  const aad = (row: Pick<RecordRow, 'collection' | 'client_id' | 'schema_version' | 'key_version'>) =>
    Buffer.from(JSON.stringify([row.collection, row.client_id, row.schema_version, row.key_version]));
  function encrypt(data: Payload, row: RecordRow): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(aad(row));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final(), cipher.getAuthTag()]);
    return Buffer.concat([iv, ciphertext]).toString('base64');
  }
  function plaintext(row: RecordRow): Payload {
    const packed = Buffer.from(row.ciphertext_b64, 'base64');
    const cipher = createDecipheriv('aes-256-gcm', key, packed.subarray(0, 12));
    cipher.setAAD(aad(row));
    cipher.setAuthTag(packed.subarray(-16));
    return JSON.parse(Buffer.concat([cipher.update(packed.subarray(12, -16)), cipher.final()]).toString());
  }
  for (const [collection, rows] of Object.entries(seed)) {
    for (const data of rows) {
      const row: RecordRow = {
        collection, client_id: `synthetic_${collection}_${data.id}`, ciphertext_b64: '',
        schema_version: 2, key_version: 1, revision: 1, updated_at: new Date().toISOString(),
      };
      row.ciphertext_b64 = encrypt(data, row);
      records.set(identity(collection, row.client_id), row);
    }
  }
  await context.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const respond = (body: any, status = 200) => route.fulfill({ status, json: body });
    if (path === '/api/auth/me') return respond({ user: { id: 987, username: 'synthetic', display_name: 'Synthetic user', role: options.role ?? 'user', is_active: true } });
    if (path === '/api/admin/users') return respond([
      { id: 987, username: 'synthetic', display_name: 'Synthetic user', role: 'admin', is_active: true, has_vault: true, last_login_at: '2026-10-22T12:00:00Z' },
      { id: 988, username: 'member', display_name: 'Synthetic member', role: 'user', is_active: true, has_vault: false, last_login_at: null },
    ]);
    if (path === '/api/admin/metrics') return respond({ totals: {}, finance_rows: {}, per_user: [], tables: [], recent: [] });
    if (path === '/api/vault/status') return respond({ exists: true, key_version: 1,
      kdf_algorithm: 'PBKDF2', kdf_salt_b64: salt.toString('base64'), kdf_iterations: DEFAULT_PBKDF2_ITERATIONS, wrapped_dek_b64: wrappedKey });
    if (path === '/api/auth/passwordless/wraps' && request.method() === 'GET') {
      return respond({
        auth: {
          kdf_salt_b64: salt.toString('base64'),
          kdf_iterations: DEFAULT_PBKDF2_ITERATIONS,
          wrapped_private_key_b64: wrappedKey,
          recovery_wrapped_private_key_b64: '',
        },
      });
    }
    if (path === '/api/health') return respond({ status: 'ok' });
    if (path === '/api/vault/records') {
      const collection = new URL(request.url()).searchParams.get('collection');
      return respond([...records.values()].filter(row => !collection || row.collection === collection));
    }
    if (path === '/api/vault/counts') {
      const counts: Record<string, number> = {};
      for (const row of records.values()) counts[row.collection] = (counts[row.collection] || 0) + 1;
      return respond({ counts });
    }
    if (path === '/api/vault/records/upsert' || path === '/api/vault/records/delete') {
      const body = request.postDataJSON();
      mutations.push({ path, body });
      if (path.endsWith('/upsert') && heldUpsertsTarget > 0) {
        heldUpsertsArrived++;
        if (heldUpsertsArrived >= heldUpsertsTarget) heldUpsertsArrivedResolve?.();
        await heldUpsertsGate;
      }
      if (failedWrites > 0) { failedWrites--; return respond({ detail: 'Synthetic save failed' }, 503); }
      if (collectionFailure && body.records.some((row: any) => row.collection === collectionFailure!.collection)) {
        collectionFailure.remaining--;
        if (collectionFailure.remaining === 0) {
          collectionFailure = null;
          return respond({ detail: 'Synthetic interrupted import' }, 503);
        }
      }
      if (!Array.isArray(body.records) || body.records.length > 200) return respond({ detail: 'Vault batch limit exceeded' }, 422);
      for (const input of body.records) {
        if (path.endsWith('/upsert') && Buffer.from(input.ciphertext_b64, 'base64').length > 512_000) {
          return respond({ detail: 'Encrypted record exceeds vault payload limit' }, 422);
        }
        const existing = records.get(identity(input.collection, input.client_id));
        if ((existing?.revision ?? null) !== (input.expected_revision ?? null)) return respond({ detail: 'Revision conflict' }, 409);
      }
      if (path.endsWith('/delete')) {
        for (const input of body.records) records.delete(identity(input.collection, input.client_id));
        return respond({ deleted: body.records.length });
      }
      const saved = body.records.map((input: any) => {
        const existing = records.get(identity(input.collection, input.client_id));
        const row: RecordRow = {
          collection: input.collection, client_id: input.client_id, ciphertext_b64: input.ciphertext_b64,
          schema_version: input.schema_version, key_version: input.key_version,
          revision: (existing?.revision ?? 0) + 1, updated_at: new Date().toISOString(),
        };
        // Invalid identity authentication fails the test immediately.
        plaintext(row);
        records.set(identity(row.collection, row.client_id), row);
        return row;
      });
      return respond(saved);
    }
    if (path === '/api/market/research/batch') {
      const body = request.postDataJSON() || {};
      const symbols = Array.isArray(body.symbols) && body.symbols.length ? body.symbols : ['VOO'];
      return respond({
        results: symbols.map((symbol: string) => ({
          symbol: String(symbol).trim().toUpperCase(),
          valid: true,
          source: 'synthetic',
          fetched_at: '2026-10-08T00:00:00Z',
          cache_status: 'hit',
          warnings: [],
          profile: { name: `${String(symbol).trim().toUpperCase()} fund` },
          quote: { current_price: 125 },
          history: [],
          dividends: [],
          splits: [],
          fundamentals: null,
          etf: null,
          analyst: null,
        })),
        failed: [],
      });
    }
    if (path.startsWith('/api/market/research/')) {
      const symbol = decodeURIComponent(path.split('/').pop() || 'VOO').trim().toUpperCase();
      return respond({
        symbol, valid: true, source: 'synthetic', fetched_at: '2026-10-08T00:00:00Z', cache_status: 'hit',
        warnings: [], profile: { name: `${symbol} fund` }, quote: { current_price: 125 },
        history: [], dividends: [], splits: [], fundamentals: null, etf: null, analyst: null,
      });
    }
    if (path.startsWith('/api/market/price/')) {
      const symbol = decodeURIComponent(path.split('/').pop()!);
      const upperSymbol = symbol.trim().toUpperCase();
      quoteRequests.push(symbol);
      quoteRequestDetails.push({ symbol: upperSymbol, refresh: new URL(request.url()).searchParams.get('refresh') === 'true' });
      const quote = quoteResponses.get(upperSymbol);
      if (quote?.status && quote.status >= 400) return respond({ detail: `Synthetic ${upperSymbol} quote failure` }, quote.status);
      return respond({ symbol: upperSymbol, price: 125, price_source: 'live_eod', source: 'yfinance', valid: true,
        price_as_of: frozenNow().toISOString(), quote_date: lastCompletedTradingDate(), ...quote });
    }
    return respond({ detail: `Unexpected synthetic endpoint ${path}` }, 404);
  });
  const enteredPages = new WeakSet<Page>();
  async function unlock(target: Page = page) {
    attach(target);
    const passphraseBox = target.getByRole('textbox', { name: 'Vault passphrase', exact: true });
    // A second tab restores the key and continues to /hub before the form can be submitted.
    // Only the wait is optional. A fill or click failure still fails the test.
    try {
      await passphraseBox.waitFor({ state: 'visible', timeout: 5_000 });
      if (new URL(target.url()).pathname.includes('/vault/')) {
        await passphraseBox.fill(passphrase, { timeout: 2_000 });
        if (new URL(target.url()).pathname.includes('/vault/')) {
          await target.getByRole('button', { name: 'Unlock', exact: true }).click({ timeout: 2_000 });
        }
      }
    } catch (error) {
      if (!(error instanceof errors.TimeoutError)) throw error;
    }
    // No next= param, so unlock lands on /hub. /login is signed out, not unlocked.
    await expect(target).toHaveURL(/\/hub$/);
    await expect(target.locator('app-hub')).toBeVisible();
    enteredPages.add(target);
  }
  async function navigate(pushPath: string, target: Page, expected: string | RegExp) {
    // pushState updates the address before Angular routes. Wait for the final
    // URL, then for that route's heading, so a redirect is not skipped.
    await target.evaluate(nextPath => {
      history.pushState(null, '', nextPath);
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    }, pushPath);
    if (expected instanceof RegExp) {
      await target.waitForURL(expected);
    } else {
      await target.waitForFunction(expectedPath => {
        const here = `${location.pathname}${location.search}`;
        const queryAt = here.indexOf('?');
        const pathname = queryAt === -1 ? here : here.slice(0, queryAt);
        const search = queryAt === -1 ? '' : here.slice(queryAt);
        const trimmed = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
        return `${trimmed}${search}` === expectedPath;
      }, expected);
    }
    await expect(routeReady(target, new URL(target.url()).pathname)).toBeVisible();
  }
  return {
    quoteRequests, quoteRequestDetails, mutations,
    async open(path: string, target: Page = page, expected?: string | RegExp) {
      attach(target);
      if (!enteredPages.has(target)) { await target.goto('vault/unlock'); await unlock(target); }
      const push = externalPath(path);
      const destination = expected instanceof RegExp ? expected : canonicalUrl(externalPath(expected ?? path));
      const current = new URL(target.url());
      const here = canonicalUrl(current.pathname + current.search);
      const arrived = destination instanceof RegExp
        ? destination.test(`${current.pathname}${current.search}`)
        : here === destination;
      if (!arrived) await navigate(push, target, destination);
    },
    async reload(target: Page = page) {
      const previous = new URL(target.url());
      const path = canonicalUrl(previous.pathname + previous.search);
      await target.reload();
      await target.locator('app-main-layout, app-vault-unlock, app-hub').first().waitFor({ state: 'visible' });
      if (await target.locator('app-vault-unlock').isVisible()) {
        enteredPages.delete(target);
        await unlock(target);
      } else {
        enteredPages.add(target);
      }
      const current = new URL(target.url());
      if (canonicalUrl(current.pathname + current.search) !== path) await navigate(path, target, path);
    },
    failNextWrites(count = 1) { failedWrites = count; },
    holdNextUpserts(count = 1) {
      heldUpsertsTarget = count;
      heldUpsertsArrived = 0;
      heldUpsertsGate = new Promise<void>(resolve => { releaseHeldUpsertsResolve = resolve; });
      heldUpsertsArrivedPromise = new Promise<void>(resolve => { heldUpsertsArrivedResolve = resolve; });
    },
    waitForHeldUpserts() { return heldUpsertsArrivedPromise ?? Promise.resolve(); },
    releaseHeldUpserts() {
      heldUpsertsTarget = 0;
      releaseHeldUpsertsResolve?.();
      releaseHeldUpsertsResolve = null;
      heldUpsertsGate = null;
      heldUpsertsArrivedPromise = null;
      heldUpsertsArrivedResolve = null;
    },
    failWriteIn(collection: string, occurrence = 1) { collectionFailure = { collection, remaining: occurrence }; },
    failQuote(symbol: string, status = 503) { quoteResponses.set(symbol.trim().toUpperCase(), { status }); },
    setQuote(symbol: string, response: QuoteResponse) { quoteResponses.set(symbol.trim().toUpperCase(), response); },
    attach,
    data(collection: string) { return [...records.values()].filter(row => row.collection === collection).map(plaintext); },
  };
}
