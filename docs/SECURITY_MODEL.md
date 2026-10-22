# Security model

This app uses server-blind user data storage for finance data: the browser owns
finance plaintext, and the backend owns only ciphertext, auth, sync metadata,
and account administration.

## Goal

Protect user finance data from database readers, backups, admin tooling, and
normal apps/finance/backend/server operators. Admins should be able to manage accounts,
disable access, reset contents, and delete data, but they should not be able to
decrypt user finance records or reset vault access.

## Non-goals

- Protect against a fully malicious server that serves modified JavaScript to
  capture vault passphrases.
- Protect against a compromised browser, extension, or endpoint after the user
  unlocks their vault.
- Make admins able to recover user finance data after vault secrets are lost.

If malicious frontend delivery is in scope, the app needs a trusted client
distribution model such as a signed static bundle, native wrapper, or local app.
A normal web deployment can still make the database and backend server-blind, but
the operator controls the code delivered to browsers.

## Required architecture

1. Browser generates a random per-user data encryption key and signing keypair.
2. Browser wraps the data key and signing private key with a vault passphrase-derived key only (no recovery-key path).
3. The backend stores the signing public key, encrypted wraps, and a hash of each short-lived, single-use login challenge.
4. Vault passphrases, signing private keys, and unwrapped data keys never reach the backend.
5. Browser signs an account-bound challenge locally; only the public-key verification result creates a session.
6. The session is an HttpOnly cookie (plus a readable CSRF cookie), not the vault passphrase. `SESSION_DAYS` is the lifetime, and each authenticated request slides that lifetime forward. The unwrapped data key stays in this browser's local storage so a reload stays unlocked. Lock vault and sign out delete that key. The passphrase is never written to a cookie, token, or the server.
7. Browser encrypts finance records before upload and decrypts them after download.
8. Backend stores ciphertext, non-sensitive sync metadata, and optional blind indexes only; it never computes over private plaintext.

## Plaintext allowed on the backend

- User account identity and role data in `users`.
- Sessions, CSRF token hashes, and account audit events.
- Global provider registries such as banks and brokerages.
- Public market quote cache, subject to the holdings privacy decision below.
- Encrypted record metadata: owner user ID, collection name, client record ID, schema version, key version, timestamps, and sync revision.

## Plaintext not allowed on the backend

- Transaction amounts, dates, categories, descriptions, account masks, import filenames if sensitive, and dedupe source material.
- Asset and liability names, amounts, dates, and notes.
- Job income, fixed expense, subscription, and payment-account details.
- Holdings symbols, shares, purchase prices, brokerage account masks, and nicknames unless the holdings quote decision explicitly accepts symbol leakage.
- Planning profiles, assumptions, generated input snapshots, and run artifacts.
- Tax document vault data. Tax document storage has been removed and should not be reintroduced without a new product/security decision.

## Recovery rules

- There is no password reset. Admins cannot reset a vault passphrase, generate a signing key, or alter encrypted vault material.
- There is no recovery-key path. If a user loses their vault passphrase, encrypted finance data cannot be recovered; admins can only delete the encrypted data and let the user start over.

## Holdings price privacy

Manual and imported prices do not disclose symbols. After an authenticated user
unlocks the vault, the browser starts a bounded, nonblocking refresh for the
deduplicated symbols in current holdings and configured employer jobs, including
inactive or former jobs with stock history. An explicit retry, one-off quote
lookup, or Stock Lab research request also sends ticker symbols to the public
market endpoint and yfinance. The shell discloses this before or while refresh
is active and reports partial failures; a failed quote leaves the last saved
price in place.

The browser saves successful quotes inside encrypted holdings and dated employer
valuations, using the provider's trading date. Shares, values, employee purchase
contributions, cost bases, employer titles, account details, and saved scenario
inputs remain encrypted; the backend market cache stores only public
symbol-level data.

Longer-term choices if stricter holdings privacy is required:

1. Encrypt symbols and use manual/current imported prices.
2. Disclose symbols to the backend for quote lookup with a clear UI disclosure.
3. Fetch quotes directly from the browser, accepting third-party/API-key tradeoffs.
4. Serve broad public quote datasets so the browser can look up symbols locally.

Do not claim ticker symbols are server-blind when a Portfolio refresh, employer
stock price refresh, or Stock Lab request has sent them to the backend.

## Local intelligence privacy gate (SEC-001)

Client-side financial signals, detectors, and local snapshots must obey:

| Rule | Requirement |
|------|-------------|
| Network | Detectors and signal modules send **no** requests. No amounts, merchants, shares, account masks, or private evidence leave the browser. |
| Mutation | Signals never write assets, liabilities, holdings, transactions, or recurring cashflow. Actions are reversible user navigation only. |
| Evidence | Evidence strings stay in-memory or encrypted vault collections if persisted later; never server plaintext logs. |
| Ticker exception | Session price refresh, explicit retry or one-off lookup, and Stock Lab research may disclose symbols, under the holdings privacy section above. |
| Versioning | Each detector has a stable `detectorId` + version; fixtures prove deterministic outputs. |

Feature contracts for new analytics must list transmitted fields (default: **none**)
and ship unit tests that run pure detectors over synthetic fixtures.

No client-side signal/detector code currently ships; these rules bind any future implementation.

## Migration ordering

Existing schema-v1 ciphertext is decrypted locally only after account
authentication and rewritten as schema-v2 records with authenticated-record
AAD. This browser-side format upgrade remains supported.

The former server-side plaintext Finance schema and its browser-to-server
row-copy migration have been retired. Before creating or upgrading any schema,
startup checks that every legacy finance table is empty and that no user still
has only password authentication. If data remains, startup stops before
changing the database. Open the previous app version, migrate the account into
its browser vault, verify the encrypted records, then retry the deployment.
Alembic revision `e0f6a2b3c4d5` drops the empty legacy tables and migration
bookkeeping; it preserves users, vault wraps, encrypted records, blind indexes,
and public market caches. The backend never decrypts finance records. Back up
the SQLite file before deploying this cleanup (see [DEPLOY.md](./DEPLOY.md)).

Password-only auth migration is an account-enrollment path in the previous
release. The current release's preflight blocks startup while a password-only
account remains, so restore the previous release to complete enrollment; it
clears the password hash without uploading vault secrets.

## Admin tooling

Raw SQL and metrics that expose finance details are incompatible with
server-blind storage. Admin tooling should be limited to counts, table health,
schema/migration state, account management, session revocation, and destructive
data reset.

## Verification expectations

- API responses before vault unlock contain no finance plaintext.
- Logs contain no finance plaintext.
- Admin UI contains no finance plaintext.
- SQLite database bytes contain no known finance plaintext after migration, cleanup, WAL checkpoint, and `VACUUM`.
- Wrong-user record access is rejected server-side even though payloads are encrypted.
- Tampered ciphertext or associated data fails to decrypt in the browser.

## Content Security Policy and origin isolation

The site is one origin behind the edge proxy in
[ops/nginx/site.conf](../ops/nginx/site.conf). Finance, Travel, Media, the
portfolio, and `/api` share that origin. The unwrapped finance data key is
stored in `localStorage` under `finance-dek` (`persistDekLocal` in
`apps/finance/frontend/src/app/crypto/vault-crypto.ts`). The vault passphrase
is typed into the finance document and is not stored. Any script that runs on
this origin can read that key and can hook the passphrase field. A path such
as `/travel` is not a security boundary.

The application (not the edge proxy) sends an **enforced**
`Content-Security-Policy`. A second policy on the proxy would be enforced as
well, so the vhost no longer sends `Content-Security-Policy-Report-Only`.
HTML responses get a new nonce, that nonce is written onto parser-inserted
`<script>`, `<style>`, and modulepreload tags, and Angular roots receive
`ngCspNonce` so component styles can carry it. Those HTML responses are
`Cache-Control: no-store` so a shared cache cannot reuse a nonce. Production
Angular builds disable critical-CSS inlining because that injects an
`onload` handler, which a script policy without `'unsafe-inline'` refuses.

| App | What is different |
| --- | --- |
| Finance (`/finance`, `/hub`, `/auth`) | `img-src 'self' data:`, `connect-src 'self'`, Trusted Types (`angular` and `angular#unsafe-bypass`), `frame-ancestors 'self'` so the same-origin `/embed` ops iframe still works. |
| Portfolio (`/`, `/home`, `/work`, `/about`, `/secrets`, other documents) | Same script rules as finance, without Trusted Types. `frame-ancestors 'none'`. No map or artwork hosts. |
| Travel | `img-src` adds only `https://tile.openstreetmap.org`. No Trusted Types, because trip pages assign HTML strings. `frame-ancestors 'none'`. |
| Media | `img-src` adds the artwork hosts the providers actually emit: `image.tmdb.org`, `static.tvmaze.com`, `coverartarchive.org`, `covers.openlibrary.org`, `*.mzstatic.com`, `media.rawg.io`. No blanket `https:`. No Trusted Types. |
| API and health (`/api`, `/travel/api`, `/media/api`, `/health`, `/metrics`) | `default-src 'none'` and the same lock on scripts, images, connect, base, forms, and framing. |

Every document policy also sets `script-src` to a per-response nonce plus
`'strict-dynamic'` (with `'self'` only as a fallback for old browsers),
`script-src-attr 'none'`, `object-src 'none'`, `base-uri 'self'`,
`form-action 'self'`, and `connect-src 'self'`. There is no
`'unsafe-eval'`. `'unsafe-inline'` is used only for `style-src-attr`, because
style attributes cannot take a nonce and Leaflet, Media covers, and a few
finance templates set them. Companion headers on every response:
`Referrer-Policy: same-origin`, `X-Content-Type-Options: nosniff`,
`Cross-Origin-Opener-Policy: same-origin`,
`Cross-Origin-Resource-Policy: same-origin`, `Origin-Agent-Cluster: ?1`,
`X-Frame-Options` (`SAMEORIGIN` for finance, `DENY` otherwise), and a
`Permissions-Policy` that disables camera, microphone, geolocation, payment,
and the other unused powerful features. HSTS stays on the HTTPS vhost.

Browsers POST violations to `/csp-report` (`report-uri` and `report-to` /
`Reporting-Endpoints`). The handler returns 204, counts a directive label, and
logs the directive and the blocked URL without its query. It does not store
or log `script-sample`, which could contain page text.

Trusted Types are enforced on the finance shell only. Its production bundle
creates `angular#unsafe-bypass` for script URLs, and Chart.js 4 does not assign
`innerHTML`. `angular#bundler` is not in this Angular 21 build, so it is not
allowlisted. The portfolio encryption demo renders markdown through
ngx-markdown, which assigns a string to `innerHTML`; enforcing Trusted Types
there blanks that demo. Travel and Media render with `innerHTML` /
`insertAdjacentHTML`. A policy that allowed those assignments would be a
passthrough. Enabling Trusted Types for those shells means rewriting them onto
DOM APIs or a sanitizer that returns TrustedHTML.

### Separating the finance origin

CSP does not stop script that is already allowed from reading `finance-dek`
or the passphrase field. That requires a different origin (scheme, host, and
port). Doing it now, before DNS exists, would break production, so this repo
does not switch hosts. The edge change is:

1. DNS. Add `finance.vivekpanchagnula.com` to the same host as the apex. Do
   not use a `CNAME` that would make the finance host a child for cookie
   purposes, and do not set a parent `Domain` on cookies.
2. Certificate. Expand the live certificate so the existing files in
   `/etc/letsencrypt/live/vivekpanchagnula.com/` cover the new name, for
   example `certbot certonly --nginx --expand -d vivekpanchagnula.com -d www.vivekpanchagnula.com -d finance.vivekpanchagnula.com`.
3. Edge proxy. Add a server for the finance host that proxies to the same
   upstream (`127.0.0.1:8085`) and does **not** add its own
   `Content-Security-Policy`. Keep HSTS on that server. After the host serves
   the app, stop serving `/finance`, `/hub`, `/auth`, and `/api` on the apex
   (404 or a redirect to the finance host). Until that cutover, do not publish
   the DNS name.

```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name finance.vivekpanchagnula.com;
    ssl_certificate /etc/letsencrypt/live/vivekpanchagnula.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/vivekpanchagnula.com/privkey.pem;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy same-origin always;
    location / {
        proxy_pass http://127.0.0.1:8085;
        proxy_http_version 1.1;
        proxy_set_header Host finance.vivekpanchagnula.com;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Request-ID $request_id;
    }
}
```

4. Application follow-up, only after that host answers. This is intentionally
   not in the current image:
   - Serve the finance shell, `/hub`, `/auth`, and `/api` only when `Host` is
     `finance.vivekpanchagnula.com`. Keep Travel and Media on the apex.
   - Rebuild the finance bundle with `<base href="/">` (the image currently
     uses `--base-href /finance/`).
   - Point Travel and Media hub links at
     `https://finance.vivekpanchagnula.com/hub`.
   - Leave the session and CSRF cookies host-only. They are already set with
     `path=/` and no `Domain` attribute in `apps/finance/backend/auth.py`, so
     an apex script will not receive the finance cookie once the host is
     different. `localStorage` is already per origin.
   - Set `CORS_ORIGINS` to `https://finance.vivekpanchagnula.com` only.
   - Re-run the browser CSP check against both hosts.

`Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Resource-Policy: same-origin` keep other sites from embedding
or scripting these responses. They do not split `/travel` from `/finance`.
