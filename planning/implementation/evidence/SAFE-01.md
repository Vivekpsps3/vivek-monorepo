# SAFE-01 — implementation evidence

- Leaf issue and parent(s): [#201](https://github.com/Vivekpsps3/vivek-monorepo/issues/201), parent [#198](https://github.com/Vivekpsps3/vivek-monorepo/issues/198)
- Agent/context, branch/worktree: Cursor Grok, `agent/safe-01`, `/home/vivek/Deployments/worktrees/vivek-safe-01`
- Base main SHA, current tested SHA: `63bc975ede08967e61c50f78b25176b07dc07d18`. `origin/main` matched that SHA. Application gates ran on that base plus `lock-finance.ts` and `lock-finance.spec.ts` before this evidence file. The head SHA is the commit that adds this file; it does not change application behavior.
- Fresh-main/prerequisite/active-PR checks: fetched `origin/main` and it was `63bc975ede08967e61c50f78b25176b07dc07d18` (0 ahead, 0 behind). SAFE-01 has no queue dependency. PR #193 is already on that history as `495d698`. `gh pr list --state open` returned no open pull requests. Issue #201 already had this branch claim and no competing claim. Conflict groups `finance-vault-lifecycle` and `pixels-data` were free.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| LOCAL1 | `lockFinance clears Finance and Pixels once per lock in either registration order (LOCAL1)` registers both orders, dispatches twice, and expects each listener once per dispatch in registration order | PASS | Focused Karma after the collection change: 10 SUCCESS. Same spec failed on the old slot (only the last listener ran). Full Finance Karma: 751 SUCCESS |
| LOCAL2 | `keeps the remaining listener after the other is disposed twice (LOCAL2)` and `unbind drops only that binding when the same callback is registered twice (LOCAL2)` | PASS | Same focused run, 10 SUCCESS. On the old slot, disposing the latest listener cleared nobody, and unbinding one of two identical callbacks removed the only slot |
| LOCAL3 | `wipes the key and clears the other listeners before module load when one throws and BroadcastChannel is unavailable (LOCAL3)` | PASS | Same focused run. `wipeDek()` runs before `clearLockSnapshots()`, both before any `await`. A throwing listener is caught inside the fan-out. On the old slot the spec saw only the last listener |
| LOCAL4 | Existing Finance lock order, key wipe, toast, and broadcast specs; Finance service lock specs; Pixels `does not call Finance or profile while locked` and `drops a Finance payload that resolves after lock`; Finance Playwright coherence/lock return; Pixels year locked-unlock link; suite locked-card and cross-tab lock | PASS | Finance Karma 751 SUCCESS; web Karma 630 SUCCESS; `make e2e` 238 passed, 8 skipped; Town/Pixels Playwright 28 passed; suite Playwright 24 passed |

Baseline before the implementation, coverage intentionally off and not a gate: `SUITE_KARMA_COVERAGE=0 npx ng test finance-app --watch=false --browsers=ChromeHeadlessCI --code-coverage=false --include='**/lock-finance.spec.ts'` with `CHROME_BIN` set. Result: 5 FAILED, 5 SUCCESS. The five failures were the new collision specs. The five existing lock specs passed against the single slot.

Dispatch rule covered by `snapshots dispatch membership and defers listeners added during the pass`: membership is copied at the start of the pass; a binding removed before its turn does not run; a binding added during the pass runs on the next lock.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Module-global single mutable `dropSnapshots` callback | `FinanceService` constructor and `PixelsDataService` constructor, both via `bindLockSnapshots` | `lockSnapshotBindings` Set in `lock-finance.ts` | Removed the slot, the overwrite assignment, and the unbind that restored a shared no-op when the function identity matched the current slot. Replaced with one binding object per registration. Callers were not edited | `git diff` of `lock-finance.ts` (4 deletions, 20 insertions). Collision specs fail on the old slot and pass on the Set |
| Shared no-op restoration on unbind | The function returned by `bindLockSnapshots` | The unbind closed over its own binding and deletes only that object; a second call is a no-op | Removed. Same-callback double registration stays two bindings | LOCAL2 same-callback spec |

- Production added/deleted/moved: `apps/finance/frontend/src/app/crypto/lock-finance.ts` +20 / −4, net +16. Moved 0. The increase is the binding set, the snapshot loop, and per-listener exception isolation. No second store, event bus, or package.
- Tests/docs/generated changes separately: `lock-finance.spec.ts` +137 / −1 (the import now includes `bindLockSnapshots`), net +136 test lines. This evidence file is 74 lines of documentation. Generated bundles and coverage reports were not committed.
- Remaining necessary overhead and why: the Set, the copy taken at dispatch, the live-membership check, and the empty `catch` stay. They are the registration, disposal-during-dispatch, and isolation rules. `wipeDek()` still runs synchronously before that fan-out and before the first `await`.
- No behavior/data/meaningful assertion silently removed: `bindLockSnapshots` and `lockFinance` stay exported with the same signatures. Message version, channel name, toast copy, and the fallback path when a later module step fails are unchanged. Finance and Pixels still bind in their constructors and unbind on destroy. No crypto, KDF, schema, or Finance/Town/Pixels math change. No test skip or coverage threshold was added or lowered.

`finance.service.ts`, `pixels-data.service.ts`, and `pixels-data.service.spec.ts` needed no edit. The public signature already matches both callers, and those files had no single-slot assignment to delete.

## Verification

`CHROME_BIN` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` were `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. The binary was not read. `SUITE_KARMA_COVERAGE` was unset for every gate below. Karma was not silent and was not rerun.

| Command | Result |
| --- | --- |
| `make lint-web` | PASS. eslint-finance 469, eslint-site 9, eslint-packages 1, eslint-world-engine 0, all matching baseline. Engine purity 1 pass |
| `make typecheck-web` | PASS |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 751 SUCCESS. Statements 73.86% (7370/9978), branches 63.68% (3591/5639), functions 70.89% (1895/2673), lines 76.96% (6519/8470) |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 630 SUCCESS. Statements 81.38% (4932/6060), branches 67.89% (1857/2735), functions 80.64% (1004/1245), lines 84.9% (4298/5062) |
| `make build-frontends` | PASS. Pre-existing NG8113 unused-import warnings only |
| `make e2e` | PASS. 238 passed, 8 skipped. This diff adds no skip |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 28 passed |
| `npx playwright test --project=suite` | PASS. 24 passed |

LOCAL4 browser observations inside those passes include Finance `two tabs refresh encrypted activity after edits, lock together, and send only invalidation metadata`, `Lock Finance from the menu returns to the same screen`, Pixels year grid `Finance locked · Unlock`, suite `a locked Finance card drops money, counts, and names loaded while unlocked`, and `a settings lock clears Finance and the Hub in other tabs within a second`.

## Handoff

# SAFE-01 — context handoff

Issue / parent / local packet: SAFE-01, GitHub #201, parent #198, packet `planning/implementation/issues/SAFE-01.md`.

Branch, worktree, base main SHA, current SHA: `agent/safe-01`, `/home/vivek/Deployments/worktrees/vivek-safe-01`, base `63bc975ede08967e61c50f78b25176b07dc07d18`. Head is the commit that contains this file. No upstream existed before the push of this branch.

Owned files and conflict groups; other active PRs checked: `finance-vault-lifecycle`, `pixels-data`. Changed `lock-finance.ts`, `lock-finance.spec.ts`, and this evidence file. No other open PR at implementation time.

Completed acceptance rows with direct evidence: LOCAL1, LOCAL2, LOCAL3, LOCAL4 all PASS, mapped in the table above.

Unfinished/failed rows and exact next action: none in this leaf. Parent #198 stays open. SAFE-02 and later leaves are not done here. TD-09 transport migration remains SAFE-04.

Deletion ledger and current consumer migration: the single callback slot and its shared no-op unbind are gone. `FinanceService` and `PixelsDataService` keep their existing `bindLockSnapshots` calls. Production net +16, tests net +136, plus this document. No generated files committed.

Commands run, results, tested SHA; required checks still pending: the eight gate commands above passed on the application diff. No required check left failing or unrun. This document was added after those runs.

PR and roadmap note URLs; actual merge/deployment/activation state: the PR is opened from this commit with `Closes #201` and a non-closing reference to #198. The #134 note is an append-only comment carrying the PR URL and head SHA. Not merged. Not deployed. Not activated.

External prerequisites and next actor: none for this leaf. Reviewer merges or requests changes. Integration owner folds the roadmap body after merge.

No unstated decision from the previous context is necessary to continue.
