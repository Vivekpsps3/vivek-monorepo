# HUB-05 — implementation evidence

- Leaf #247; parent #93 stays open. Codex, branch `agent/hub-05`, isolated worktree `/tmp/vivek-hub-05`.
- Base `874c873112b07dcec3787910605326465002018c`. HUB-02 (#369) and HUB-04 source outcomes are merged and present; live leaf/parent and open PRs were checked before the claim. No competing PR. Existing shared-checkout World edits were preserved.
- Claim: https://github.com/Vivekpsps3/vivek-monorepo/issues/247#issuecomment-6930931571.

## Acceptance

| Row | Executed proof | Result |
| --- | --- | --- |
| QUICK1 | `hub-shortcuts.spec.ts` opens the existing menu with N and touch, tests wrapping/Home/Escape/outside click and focus return, opens shortcut help with ?, guards both modal shortcuts, and opens existing search with Ctrl-K. Both widths (390/1280), both themes, axe on menu/help and 44px/overflow assertions. Shell unit test covers editable input/contenteditable, modifiers and repeats. | PASS |
| QUICK1 date/session | Quick-add unit test checks the same browser-local date in normal/setup and locked-unlock return URLs. Finance editor test saves explicit selected dates and today's default through the existing `addTransaction` payload. Existing vault guards and app editors remain authoritative. | PASS |
| CHIP1 | Health unit tests prove zero normal-owner fetches, partial outage copy, five-minute visible refresh budget, logout clearing and held old-owner cancellation. Browser fixture proves normal owners make zero requests, admins see both degraded services, and Quick add stays usable. Existing server health/auth composition tests execute in the server gate. | PASS |

## Deletion and compatibility

Feature with necessary lifecycle guards, not a negative-LOC simplification. No old Quick-add form/draft or competing listener existed to delete. Extended the shell's existing Ctrl/Meta-K listener to delegate to the mounted Hub; no second global shortcut listener or event bus. Reused `UiMenu`, `UiDialog`, current Finance guards/editor, Travel/Media creation routes and bounded Hub fetch helper. Replaced the inert header health slot. Existing card/agenda loaders and greeting remain the owners.

Against the base: production +147/−6 = +141 physical lines; tests +203/−2 = +201; app/package guidance +8/−5 separately. No production moves/generated output. Added code is the visible Quick-add/help controls, authorized bounded health lifecycle and input/modal guards. No copied editor, health endpoint, draft store, polling interval or source ledger. Lexical blank-only +11/−0 and comment-prefix +3/−1 lines are included; no formatting reduction is claimed. Follow-up command changes touch QuickAdd plus the existing app-owned editor; health changes touch the sole chip owner plus the existing endpoints.

The old unit assertion forbidding **any** menu node is corrected to forbid an **open** menu after a session rejection; the supported closed Quick-add menu is intentionally mounted. Existing session-rejection, usable-other-card and no-sign-out assertions remain.

## Verification

Node 24 `/tmp/node24/bin`, repository Python 3.12 venv, Chromium 156 at `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. Logs under `/tmp/hub05-*`; synthetic screenshots/traces under local test artifacts.

| Command | Result |
| --- | --- |
| `make test-fast`, `make lint-web`, `make typecheck-web` (venv on PATH) | PASS |
| `make lint-python`, `make typecheck-python` | PASS: Ruff 91, suppressions 6, mypy 82 baseline findings; no Python implementation change |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS: 399 tests |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS: 503 tests |
| `COVERAGE_FILE=/tmp/hub05-server.coverage ./scripts/coverage-gate.sh server` | PASS: 357 tests, 74.27%; additional performance probe passed |
| `make build-frontends` | PASS; initial-size warning (not the error gate), existing unused imports warnings |
| `make e2e` | PASS: 208 tests, 5 existing platform/layout skips |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS: 109 tests |
| `DEBUG=pw:api npx playwright test --project=suite` | PASS: 46 tests |

Initial failures were fixed: health import crossed the platform boundary (now stays with the existing Hub loader); native Response test scheduling replaced with a controllable JSON fixture; parsed URL trees preserve the query instead of encoding it into the path; help uses the shared button's projected content. An initial web browser run overlapped a production rebuild, producing two temporary 503 shell responses; the full stable-bundle rerun passes all 109 tests. One initial shared-suite process stopped progressing; it was terminated after the isolated held-logout story passed. The complete diagnostic rerun passed all 46 tests. No gate/coverage floor/assertion was lowered.

## Handoff

- PR: https://github.com/Vivekpsps3/vivek-monorepo/pull/380; implementation tree `2086d7d`, opened after required gates passed.
- Roadmap note: https://github.com/Vivekpsps3/vivek-monorepo/issues/134#issuecomment-6931270885.
- Merge/deployment: not merged or deployed.
- Remaining parent scope: HUB-06 and Town-owned TOWN-06; TOWN-05 is still open and required by TOWN-06.
- Next actor: review/merge this leaf with owner authorization; Codex continues HUB-06 in its own worktree.


## CI follow-up — immediate menu closure and fixture isolation

The first CI matrix failed a rapid Escape→? sequence and a following search fixture.
The closed menu's signal changed before its hidden DOM/expanded attribute, so the
next shortcut could see the previous frame. The existing shared menu now paints
closure synchronously before returning focus, with a unit regression that checks
DOM state before another fixture render. No new listener or wrapper was added.
The new Hub browser fixture now restores the domain's default data; the existing
search story explicitly resets its own expected library instead of depending on
which file ran before it.

The final totals above include this follow-up: shared menu +5/−0 production lines, its regression
+9/−0 test lines, and fixture changes in `hub-shortcuts.spec.ts` / `search.spec.ts`.
No assertion, retry setting or gate was weakened. Shared UI validation broadened
to all three Karma suites (Finance 503, site 9, web 400), shared browser/UI Node
suites, and the complete cross-app Playwright matrix. Logs:
`/tmp/hub05-shared-{unit,node}.log`, `/tmp/hub05-all-e2e-final.log`.

One complete matrix first reported 600 passed with a single Travel bootstrap
failure: trace shows `main-YCRJWZ7Z.js` failed with `ERR_NETWORK_CHANGED` while a
separate Docker schema rehearsal created/deleted networks. No PTO app code ran.
Both isolated chart-retry cases pass. The final full matrix ran after those
network rehearsals ended: **601 passed, 5 existing platform/layout skips**, no
new retries or skips. All Finance, Travel, Media, Town and suite projects executed.
