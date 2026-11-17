# HUB-06 — implementation evidence

- Leaf [#248](https://github.com/Vivekpsps3/vivek-monorepo/issues/248); parent #93 remains open. Codex, `agent/hub-06`, isolated worktree `/tmp/vivek-hub-06`.
- Base `874c873112b07dcec3787910605326465002018c`. Fresh main, live leaf/parent and open PRs checked. HUB-03 (#371) and CON-02 (#367) are merged and their shared saved calendar and route-parity outcomes are present. Main was fetched again before delivery; the independent HUB-05 PR #380 does not edit this leaf's code.
- [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/248#issuecomment-6931271304).

## Acceptance

| Row | Executed proof | Result |
| --- | --- | --- |
| FEED1 | `test_calendar_feeds.py` uses two real persisted owners, hash-only stored values, distinct Travel/Media capabilities, no-cookie reads, foreign-owner management denial, duplicate scope rejection, rotation/revocation, disabled/deleted owners, real session/CSRF enforcement and both IP/capability limits. Conditional reads reauthorize before 304; old capabilities fail. | PASS |
| ICS1 | Synthetic trip boundaries, saved transport departure zone and reminder timezone at US DST, midnight/all-day dates, first/last included dates and excluded outer dates, Unicode/punctuation/newline escaping, 75-octet folding, multiple release dates with unique UIDs, omitted uncertain Media dates, source edits/ETags and explicit overflow. Provider-client construction spy forbids provider I/O; Finance/Health/private notes/foreign records are absent. Existing source gates pass with summary cap/defaults preserved. | PASS |
| ICS1 independent parser | `/tmp/hub06-parse-ics.py` parses the generated synthetic calendar using isolated `/tmp/hub06-ics-check` `icalendar` 7.3.0; exact Unicode text, DATE, UTC DATE-TIME, unique UID and zero parser errors. No runtime dependency added. Serialization follows [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545). | PASS |
| FEEDUI1 | `calendar-feeds.spec.ts` creates/copies/hides/rotates/revokes synthetic URLs at 390/1280 in light/dark. Includes failure/retry with retained timezone, disclosure, no storage persistence, focus after disclosure/hide/revoke, reload, axe and overflow. Unit tests cover held old-owner completion, session clearing, destroy cancellation and confirmed mutations. Direct Settings route participates in the existing registry-derived route parity checks. | PASS |
| Migration | Additive single-head `site_calendar_feeds_v1`: capability metadata only, owner cascade, owner/scope uniqueness and hash uniqueness. Historical migration tests retain explicit drift/compatibility ledgers. Full synthetic adoption and upgrade rehearsal passes with integrity/foreign keys, original values, row counts and smoke reads preserved. | PASS |

## Deletion and compatibility

This is a **feature and safety repair**, not a negative-LOC simplification. No prior feed/event store existed. One capability table/lifecycle is necessary; no event table, provider client, polling process, Finance/Health projection or parallel calendar ledger was added. The server composes the existing Travel dated summary and Media saved calendar. Travel's normal API keeps its 50-row display cap; feed composition consumes the same assembly without that cap and rejects over 1,000 dated events. Its fixed six-week window covers seven days before today through 34 ahead. All-day dates remain dates; saved transport zones override the subscription's zone for departures.

| Candidate | Actual consumers / surviving owner | Disposition and proof |
| --- | --- | --- |
| Potential duplicate calendar/event assembly | Existing Hub/agenda/source calendars and new feed; Travel summary / Media calendar remain authoritative | Reused both source projections. Only ICS presentation is new; request/provider and same-source fixtures execute. No nonexistent old ledger is claimed deleted. |
| Capability copies / permanently retained URL | Settings permanent list versus one-time disclosure | List/API metadata contain only id/scope/timezone. Raw URLs are not persisted; hide/session change/route destruction clear the disclosure. DB stores SHA-256 hashes of 32-byte random capabilities. |
| Lost exception response headers | Existing server HTTP exception owner | Preserve `exc.headers`, so rate-limited readers receive Retry-After. Existing server/Finance tests pass; no new error middleware. |
| Cross-domain imports | Explicit server composition boundary | One named composition owner added to the existing boundary check, documented in server guidance. Identity lifecycle imports no Travel/Media rules. No general import exemption or new registry. |

Against base, full closure: production **+604/−5 = +599 physical lines**; migration +38/−0; boundary gate +1/−0; tests +508/−5; guidance/operations docs +45/−0, before this evidence file. Production includes lexical blank-only +64/−0 and comment-prefix +9/−0; no formatting savings claimed. No production moves or generated artifacts. Necessary additions supply capabilities/ICS, secure one-time Settings controls and lifecycle/logging guards. Existing Finance encryption, PTO/currency math, Media membership/progress and route semantics are retained.

Follow-up scope/timezone changes touch the single identity lifecycle, calendar composer and Settings component. Source-date changes stay with Travel or Media; no second source ledger needs editing. Application redaction covers messages and exception traces; non-sensitive tracebacks retain normal behavior. The reviewed edge format omits query strings. No real capability URL is included in this evidence.

## Verification

Node 24 `/tmp/node24/bin`, repository Python 3.12 venv, Chromium 156 from the existing local Playwright cache. Exact logs `/tmp/hub06-*`; synthetic screenshots/traces remain local. This worktree predates the independent shared-menu fix in HUB-05; that PR runs its complete cross-app matrix separately.

| Command | Result |
| --- | --- |
| `make test-fast`, `make lint-web`, `make typecheck-web` | PASS |
| `make lint-python`, `make typecheck-python` | PASS: Ruff 91, suppressions 6, mypy 82 existing findings; no baseline increases |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS: 397 tests |
| `COVERAGE_FILE=/tmp/hub06-server.coverage ./scripts/coverage-gate.sh server` | PASS: 371 tests, 75.45%, plus passing performance probe |
| `COVERAGE_FILE=/tmp/hub06-travel.coverage ./scripts/coverage-gate.sh travel` | PASS: 190 tests, 86.05% |
| `COVERAGE_FILE=/tmp/hub06-media.coverage ./scripts/coverage-gate.sh media` | PASS: 91 tests, 69.70% |
| `COVERAGE_FILE=/tmp/hub06-finance.coverage ./scripts/coverage-gate.sh finance` | PASS: 159 tests, 81.43% |
| `node --test apps/travel/backend/static/tests/*.test.mjs apps/media/backend/static/tests/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs` | PASS: 88 tests |
| `make build-frontends` | PASS |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS: 109 tests |
| `npx playwright test --project=suite` | PASS: 45 tests |
| `make docker-build SITE_IMAGE=personal-site:hub-06-verify` | PASS; disposable verification image, no production deployment |
| `make db-check db-validate-seeded SITE_IMAGE=personal-site:hub-06-verify` | PASS: adoption `stamp_and_upgrade` and current-main `upgrade`, data/integrity/smoke proof |
| `PYTHONPATH=$PWD .venv/bin/python /tmp/hub06-parse-ics.py` | PASS: independent parser |

Fixed initial failures without lowering gates: declared new current-head/drift expectations, returned uniform missing-resource responses before HTTPS minting validation, preserved Retry-After, corrected labels/accessible names and waited for NgModel disabled-state propagation before focus return. The first schema rehearsal used the old development image and correctly failed its revision check; the rebuilt disposable image passes. New multiple-release regression exposed duplicate UIDs and now passes with distinct identities. No suite, assertion, baseline or floor was skipped/weakened.

## Handoff

- PR: https://github.com/Vivekpsps3/vivek-monorepo/pull/381, opened after required local gates passed; tested implementation tree `21df518`.
- Roadmap note: https://github.com/Vivekpsps3/vivek-monorepo/issues/134#issuecomment-6932243509; no parent/global body changes.
- Not merged or deployed. Production requires the normal migration/deployment workflow and configured HTTPS origin; no real feed has been activated by this work.
- Parent's Town-owned reflection still depends on open Town Hall work. Next actor: review/merge with owner authorization; integration owner reconciles the queue after merges.
