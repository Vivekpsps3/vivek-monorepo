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

## Login material

Passwordless login has to give the browser its own wrapped signing key before a session exists. That response is unauthenticated. It does not include the vault data-key wrap or the unused recovery wraps; those stay on the authenticated vault status route for the signed-in account.

Unknown usernames get a deterministic decoy of the same shape and wrap length, derived from `AUTH_DECOY_SECRET` or a secret file stored next to the database. Repeating a lookup must not show whether the account exists. The passwordless routes take a username only; an email is not an alias for that username, so the two identifiers do not return the same wrap. Signup is closed by default (`AUTH_SIGNUP_MODE`). Invitation enrollment is unchanged. `open` mode still reports a taken username; `invite` and `allowlist` use one failure response for a bad code, a name that is not allowed, and a name that is already taken.

The wrapping KDF is PBKDF2-HMAC-SHA256. New wraps use at least 600,000 iterations and at most 5,000,000. A stored 310,000-iteration wrap still unlocks. The browser re-wraps it on the next successful unlock, including the unlock screen for a session that is already signed in. WebCrypto does not provide Argon2id; `kdf_algorithm` on the vault is the field a later algorithm would use.

Lookup, challenge, verify, signup, and bootstrap are rate limited per IP inside the one server process. Lookup has no per-account limit. Challenge and verify share a per-(account, IP) budget, and failed verifies have a separate higher per-account cap. Once that cap is reached, only further failures are rejected. A valid signature is never counted or blocked. A signed-in wrap update is not counted against those budgets. The client address is the peer uvicorn accepted after `FORWARDED_ALLOW_IPS`; the application does not read `X-Forwarded-For`. Passwordless sign-in uses the enrolled username. An email is not accepted.

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
SPA shell routes set `x-csp-shell: 1`. The middleware strips that header and,
only then, writes a new nonce onto parser-inserted `<script>`, `<style>`, and
modulepreload tags. Angular roots receive `ngCspNonce` so component styles can
carry it. Any other HTML response is left untouched, so a reflected `<script>`
cannot pick up the nonce. Shell responses are `Cache-Control: no-store` so a
shared cache cannot reuse a nonce. Production Angular builds disable
critical-CSS inlining because that injects an `onload` handler, which a script
policy without `'unsafe-inline'` refuses.

| App | What is different |
| --- | --- |
| Finance (`/finance`, `/hub`, `/auth`) | `img-src 'self' data:`, `connect-src 'self'`, Trusted Types with an empty policy allowlist (`require-trusted-types-for 'script'`). `frame-ancestors 'none'`. |
| Portfolio (`/`, `/home`, `/work`, `/about`, `/secrets`, other documents) | Same script rules as finance, without Trusted Types. `frame-ancestors 'none'`. No map or artwork hosts. |
| Travel | `img-src` adds only `https://tile.openstreetmap.org`. No Trusted Types, because trip pages assign HTML strings. `frame-ancestors 'none'`. |
| Media | `img-src` adds the artwork hosts the providers emit, plus the hosts their redirects land on: `image.tmdb.org`, `static.tvmaze.com`, `coverartarchive.org`, `covers.openlibrary.org`, `archive.org`, `*.archive.org`, `*.mzstatic.com`, `media.rawg.io`. No blanket `https:`. No Trusted Types. |
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
`X-Frame-Options: DENY`, and a `Permissions-Policy` that disables camera,
microphone, geolocation, payment, and the other unused powerful features.
HSTS stays on the HTTPS vhost.

`/embed` is a compact net-worth route (`docs/FRONTEND.md`). It is not an
iframe, and the repository has no `<iframe>` that loads it. Every document
sends `frame-src 'none'`, so a page on this origin cannot frame `/embed`. A
cross-origin ops page was already blocked by the previous
`X-Frame-Options: SAMEORIGIN`. `frame-ancestors 'none'` applies to finance as
well. `after-auth.ts` still sends a framed window to `/embed`, and that branch
cannot run while ancestors are denied.

Browsers POST violations to `/csp-report` (`report-uri` and `report-to` /
`Reporting-Endpoints`). The handler returns 204, counts a directive label, and
logs one JSON object per report (directive, app, blocked URL without its query,
and client address). The address is `request.client.host`. Uvicorn fills that
from the forwarded client only when the peer is `FORWARDED_ALLOW_IPS`; the
handler does not read `X-Forwarded-For`. It reads the body with a running
16 KiB cap, including chunked requests that omit `Content-Length`. The edge
`location = /csp-report` sets `client_max_body_size 16k`. Each request logs at
most 5 reports. Each budget key logs at most 30 lines per minute, IPv6 keys
are the /64 prefix, IPv4-mapped addresses (`::ffff:a.b.c.d`) use the embedded
IPv4 address, and the whole process logs at most 300 lines per minute.
A full key table drops expired entries and otherwise refuses new keys.
`site_csp_reports_total` counts every parsed report and is the authoritative
record. The log lines are samples: ten keys at the per-key cap fill the
process budget and can mute further logs for up to 60 seconds, while the
counter still increments. The handler does not store or log `script-sample`,
which could contain page text.

Trusted Types are enforced on the finance shell only, with an empty
`trusted-types` allowlist. Finance source does not call `bypassSecurityTrust*`
or assign `innerHTML` (`scripts/check-shared-boundaries.py` fails the build if
a bypass appears). The production bundle can create `angular#unsafe-bypass`
lazily for a script-URL bypass, and nothing on the finance shell calls that
helper, so the name is not allowlisted. Chart.js 4 in this build does not
assign `innerHTML`. `angular#bundler` is not emitted. ngx-markdown is the
portfolio secrets demo, not finance; it assigns a string to `innerHTML`, and
enforcing Trusted Types there blanks that demo. Travel and Media render with
`innerHTML` / `insertAdjacentHTML`. A policy that allowed those assignments
would be a passthrough. Enabling Trusted Types for those shells means rewriting
them onto DOM APIs or a sanitizer that returns TrustedHTML.

### Separating the finance origin

CSP does not stop script that is already allowed from reading `finance-dek`
or the passphrase field. That requires a different origin (scheme, host, and
port). Doing it now, before DNS exists, would break production, so this image
does not switch hosts.

`finance.vivekpanchagnula.com` and the apex are schemeful same-site. A CNAME
does not change cookie scope: `finance.` is a subdomain either way, and the
browser does not consult DNS to decide which cookies to send. What matters is
not setting a parent `Domain`, and using `__Host-` names so a parent-domain
cookie cannot be set at all.

Travel and Media authenticate with the finance session. `apps/server/auth.py`
reads `finance_session`, and both browsers send `finance_csrf`. If those apps
stay on the apex while the cookie becomes host-only on `finance.`, their login
stops. The cutover has to give them an apex session of their own before the
finance cookies move. That session must not be the vault session. Moving
Travel and Media onto `finance.` would keep login working and would also put
them back in the vault's origin.

1. DNS. Add `finance.vivekpanchagnula.com` as a record on the same host as the
   apex. Do not set a parent `Domain` on any cookie.
2. Certificate. Expand the live certificate so the existing files in
   `/etc/letsencrypt/live/vivekpanchagnula.com/` cover the new name, for
   example `certbot certonly --nginx --expand -d vivekpanchagnula.com -d www.vivekpanchagnula.com -d finance.vivekpanchagnula.com`.
3. Edge proxy. The zones `personal_site` and `personal_connections` stay in the
   `http` context of [ops/nginx/site.conf](../ops/nginx/site.conf). Add a server
   that uses those zones, the same body size, timeouts, and access log as the
   apex, and proxies to `127.0.0.1:8085`. Set `Host` to the finance name. Keep
   HSTS. Do not add a `Content-Security-Policy`. `location = /csp-report` uses
   `client_max_body_size 16k`. This file is not applied by the deploy workflow;
   after editing the host copy, run `nginx -t && nginx -s reload` on nginx-edge.
   After the finance host serves the app, redirect apex `/finance`, `/hub`,
   `/auth`, and `/api` to the finance host and send `Clear-Site-Data: "storage"`
   on those redirects so the apex copy of `finance-dek` is deleted. That header
   clears every apex site store, including Travel and Media preferences, the
   first time a browser hits a retired finance URL. Do not publish the DNS name
   before this cutover.

```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name finance.vivekpanchagnula.com;
    ssl_certificate /etc/letsencrypt/live/vivekpanchagnula.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/vivekpanchagnula.com/privkey.pem;
    access_log /dev/stdout personal_site;
    error_log /dev/stderr warn;
    client_max_body_size 10m;
    client_body_timeout 15s;
    client_header_timeout 15s;
    send_timeout 60s;
    limit_conn personal_connections 40;
    limit_req zone=personal_site burst=100 nodelay;
    limit_req_status 429;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy same-origin always;
    location = /csp-report {
        client_max_body_size 16k;
        proxy_hide_header x-csp-shell;
        proxy_pass http://127.0.0.1:8085;
        proxy_http_version 1.1;
        proxy_set_header Host finance.vivekpanchagnula.com;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Request-ID $request_id;
        proxy_connect_timeout 5s;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }
    location / {
        proxy_hide_header x-csp-shell;
        proxy_pass http://127.0.0.1:8085;
        proxy_http_version 1.1;
        proxy_set_header Host finance.vivekpanchagnula.com;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Request-ID $request_id;
        proxy_connect_timeout 5s;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }
}
```

4. Application follow-up, only after that host answers. This is intentionally
   not in the current image:
   - Serve the finance shell, `/hub`, `/auth`, and `/api` only when `Host` is
     `finance.vivekpanchagnula.com`.
   - Before that gate flips, issue Travel and Media an apex session that is
     not `finance_session`. They currently read that cookie
     (`apps/server/auth.py`, `apps/travel/backend/static/modules/api.mjs`,
     `apps/media/backend/static/modules/api.mjs`).
   - Rename the finance cookies to `__Host-finance_session` and
     `__Host-finance_csrf` with `Secure`, `Path=/`, and no `Domain`. The
     `__Host-` prefix makes the browser reject a `Domain` attribute, so an
     apex script cannot plant `Domain=vivekpanchagnula.com` over the session
     or shadow `finance_csrf`. `__Host-` requires HTTPS. Local HTTP dev keeps
     the current names until the split.
   - On the apex shells that remain, call `localStorage.removeItem('finance-dek')`
     once at startup so a browser that never hits the redirect still drops the
     old key. Do that only at cutover. Doing it while finance still shares the
     apex origin would delete the live vault key. `Clear-Site-Data: "storage"`
     on the apex redirects covers browsers that never load those shells again.
   - Rebuild the finance bundle with `<base href="/">` (the image currently
     uses `--base-href /finance/`).
   - Point hub links at `https://finance.vivekpanchagnula.com/hub`.
   - Set `CORS_ORIGINS` to `https://finance.vivekpanchagnula.com` only.
   - Re-run the browser CSP check against both hosts.

`Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Resource-Policy: same-origin` keep other sites from embedding
or scripting these responses. They do not split `/travel` from `/finance`.
