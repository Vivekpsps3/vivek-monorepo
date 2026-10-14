import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import { Page } from '@playwright/test';

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

function lastCompletedTradingDate(now = new Date()): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDay();
  const daysBack = day === 0 ? 2 : day === 1 ? 3 : day === 6 ? 1 : 0;
  date.setUTCDate(date.getUTCDate() - daysBack);
  return date.toISOString().slice(0, 10);
}

/** Each test uses a fresh key and an in-memory ciphertext server; no real API or vault. */
export async function syntheticVault(page: Page, seed: Record<string, Payload[]> = {}) {
  const context = page.context();
  const attachedPages = new WeakSet<Page>();
  const attach = (target: Page) => {
    if (attachedPages.has(target)) return;
    attachedPages.add(target);
    target.on('pageerror', error => console.error('Synthetic finance browser error:', error.message));
  };
  attach(page);
  const key = randomBytes(32);
  const passphrase = 'Synthetic finance test passphrase';
  const salt = randomBytes(16);
  const wrapIv = randomBytes(12);
  const wrapCipher = createCipheriv('aes-256-gcm', pbkdf2Sync(passphrase, salt, 1000, 32, 'sha256'), wrapIv);
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
    if (path === '/api/auth/me') return respond({ user: { id: 987, username: 'synthetic', display_name: 'Synthetic user', role: 'user', is_active: true } });
    if (path === '/api/vault/status') return respond({ exists: true, key_version: 1, migration_status: 'complete', migrated: true,
      kdf_algorithm: 'PBKDF2', kdf_salt_b64: salt.toString('base64'), kdf_iterations: 1000, wrapped_dek_b64: wrappedKey });
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
    if (path.startsWith('/api/market/price/')) {
      const symbol = decodeURIComponent(path.split('/').pop()!);
      const upperSymbol = symbol.trim().toUpperCase();
      quoteRequests.push(symbol);
      quoteRequestDetails.push({ symbol: upperSymbol, refresh: new URL(request.url()).searchParams.get('refresh') === 'true' });
      const quote = quoteResponses.get(upperSymbol);
      if (quote?.status && quote.status >= 400) return respond({ detail: `Synthetic ${upperSymbol} quote failure` }, quote.status);
      return respond({ symbol: upperSymbol, price: 125, price_source: 'live_eod', source: 'yfinance', valid: true,
        price_as_of: new Date().toISOString(), quote_date: lastCompletedTradingDate(), ...quote });
    }
    return respond({ detail: `Unexpected synthetic endpoint ${path}` }, 404);
  });
  const enteredPages = new WeakSet<Page>();
  async function unlock(target: Page = page) {
    attach(target);
    await target.getByRole('textbox', { name: 'Vault passphrase', exact: true }).fill(passphrase);
    await target.getByRole('button', { name: 'Unlock', exact: true }).click();
    await target.waitForURL(url => url.pathname === '/');
    enteredPages.add(target);
  }
  async function navigate(path: string, target: Page = page) {
    // Browser history navigation exercises Angular guards without replacing the unlocked session.
    await target.evaluate(nextPath => {
      history.pushState(null, '', nextPath);
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    }, path);
    await target.waitForURL(url => url.pathname + url.search === path);
  }
  return {
    quoteRequests, quoteRequestDetails, mutations,
    async open(path: string, target: Page = page) {
      attach(target);
      if (!enteredPages.has(target)) { await target.goto('/vault/unlock'); await unlock(target); }
      const current = new URL(target.url());
      if (current.pathname + current.search !== path) await navigate(path, target);
    },
    async reload(target: Page = page) {
      const previous = new URL(target.url());
      const path = previous.pathname + previous.search;
      await target.reload();
      await target.locator('app-main-layout, app-vault-unlock').first().waitFor({ state: 'visible' });
      if (await target.locator('app-vault-unlock').isVisible()) {
        enteredPages.delete(target);
        await unlock(target);
      } else {
        enteredPages.add(target);
      }
      const current = new URL(target.url());
      if (current.pathname + current.search !== path) await navigate(path, target);
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
