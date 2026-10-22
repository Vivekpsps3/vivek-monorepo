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
