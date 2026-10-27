# Hub, shared navigation, public site, and Finance

## NAV-01 / NAV-02 — Single persistent workspace shell

Current sources: Travel/Media `backend/static/index.html`; Finance `frontend/src/app/core/layout/main-layout.component.*`; Hub `apps/finance/frontend/src/app/hub/hub.component.*`. Target ownership: `apps/web` composition and generic `packages/ui` primitives, described in [top-down refactor](14-top-down-refactor.md).

- [ ] Write one shell contract: app identity, labeled Hub link, primary local navigation slot, account/settings, route title, page focus, loading/error slot, safe-area behavior.
- [ ] Implement shell once in the unified Angular web application. Domain features supply route/navigation data through explicit small exports; they do not render parallel suite headers.
- [ ] Preserve direct `/hub` navigation through old shells until each feature cutover; delete those shells immediately after cutover acceptance.
- [ ] Check every detail/create/settings/error route with scrolling, narrow width, zoom, and mobile keyboard.
- [ ] Preserve app wordmark → app home; public name/logo → public home; Hub → workspace home.
- [ ] Keep one header account/settings surface; remove duplicate theme and Hub controls in app-specific menus after replacement.
- [ ] Centralize dirty-route behavior; review each editor's existing draft semantics before wiring a guard.
- [ ] Test direct load, refresh, back/forward, signed-out deep link, session expiry, sign-out from each app, and arrival at the requested route after sign-in.

Done when Hub is reachable in one action from all three subapps and the old chrome implementation has been deleted, rather than left as fallback code.

## HUB-01 — Clear, resilient Hub

- [ ] Move Hub out of Finance's ownership to the web composition app; do not move Finance calculations or encrypted storage into it.
- [ ] Give Finance, Travel, and Media equally recognizable entry surfaces and a stable Open action, even if summaries fail or the vault is locked.
- [ ] Keep summaries compact: current/next trip with useful action; active media/next episode; Finance vault state and authorized local snapshot.
- [ ] Add symmetrical per-card Retry with pending state and bounded request deadlines; cancel stale loads on navigation or identity change.
- [ ] Distinguish loading, empty, stale cached snapshot, expired session, and service unavailable. Do not turn a provider error into sign-out.
- [ ] Move profile/name editing into a proper settings panel or dialog; remove inappropriate menu semantics around forms.
- [ ] Retain account admin visibility rules, username-change confirmation, and user-facing recovery errors.
- [ ] Finance summary is produced by a Finance-owned browser facade only after vault unlock. An unavailable snapshot must not prevent Travel/Media use.
- [ ] Add tests for one summary failing while others succeed, timeout, retry success, lock/unlock, sign-out clearing summaries, and late response from a previous user.

## FIN-01 — Finance UX refresh without data-plane changes

- [ ] Audit Home, What you have, Spending/activity/import/calendar, Recurring/jobs/bills/subscriptions, Planning/tools/Stock Lab, setup/unlock, account/admin, tutorials and errors.
- [ ] Keep useful summaries and precise tables; consolidate page headers, fields, action rows, empty states, confirmations, and toasts into the shared shell/component contract.
- [ ] Remove redundant Hub tab after persistent header entry is verified; check five local destinations at 320px.
- [ ] Resolve inconsistent mobile abbreviations and accessible labels without changing route meaning.
- [ ] Replace “Start the backend” with actionable connection recovery, preserved edits, and Retry.
- [ ] Verify tutorial focus trapping, cancellation, background inertness, completion state and return focus; remove unnecessary custom modal machinery if shared dialog covers it.
- [ ] Consolidate duplicate presentation helpers only when they have the same semantics. Keep domain-specific date/money/source-evidence distinctions explicit.
- [ ] Preserve encrypted collection formats, vault authentication/wraps, balance-sheet net worth, full-match ledger totals, source dates, CSV staging/undo, recurring dedup, and speculative planning isolation.
- [ ] Verify shared theme changes against charts, tables, numeric contrast, stale data labels, and large/negative amounts.

## WEB-01 — Public site as part of the same product

- [ ] Move public routes into lazy public features composed by the single web build; retain current content and semantic Home/Work/About hierarchy.
- [ ] Replace vague or conflicting Apps/Hub entry wording with a consistent Workspace action; authenticated users can still follow it to Hub.
- [ ] Preserve canonical URLs, document titles/descriptions, sitemap/robots behavior, crawlable public content, icons and public assets. Keep private routes excluded from public indexing.
- [ ] Retain `/home`, `/work`, `/about`, `/secrets`, and documented aliases through a small route manifest/redirect policy. Avoid broad catch-all returning 200 for nonexistent pages/assets.
- [ ] Keep encryption demo browser-local. Remove unused Socket.IO and Markdown machinery once source/build reachability proves it has no other active consumer; render decrypted text as ordinary escaped text.
- [ ] Delete historical Flask backend and standalone deployment artifacts after reference/fixture migration; do not leave two supported stacks in README.
- [ ] Check theme coherence and visual continuity public → sign-in → Hub → app → Hub → public.

Validation: Finance and site Karma plus relevant Playwright, `make test-fast`, Python/server gates for routing/auth changes, lint/typecheck, production build, assembled-route checks, and public crawl/no-private-data smoke tests. Exact command mapping is in [verification](11-verification.md).
