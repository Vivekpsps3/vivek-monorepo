# SAFE-04 — implementation evidence

- Leaf issue and parent(s): [#204](https://github.com/Vivekpsps3/vivek-monorepo/issues/204); parent [#198](https://github.com/Vivekpsps3/vivek-monorepo/issues/198) stays open
- Agent/context, branch/worktree: SAFE-04 in `/tmp/vivek-safe-04`, branch `agent/safe-04`
- Base main SHA, current tested SHA: merged `origin/main` `3f0304381486682169fb94f4c42875e63452393d` (fast-forward from `80b9ca0e0776297f3addcdfdac78542f6a7ced40`; that merge did not touch the lock files). Gates below ran on the implementation commit `8d6ad4b9c54bffedb24e984ce32b42ab9e4791b9` before this evidence file. Node is `/tmp/node24/bin/node` v24.11.1.
- Fresh-main/prerequisite/active-PR checks: SAFE-01 (#201) and SAFE-03 (#203) are merged. No open pull requests at implementation start. Issue #204 already named this branch and worktree. `origin/main` had moved to `3f03043` (#299, Media helpers) and was merged before the gates.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| LOCAL1 | Hub, Pixels, and World subscribe to `bindLockNotices`. A storage lock notifies all three stand-ins once. A remote version-1 lock for the current owner clears Hub, drops Pixels finance, and clears World. Same-tab Pixels lock still uses `bindLockSnapshots` when `BroadcastChannel` is absent. World same-tab session clear still uses `session.cleared$`. | PASS | `lock-notice.spec.ts` "notifies every live subscriber"; Hub `clears a loaded card when another tab broadcasts a lock`; Pixels `drops finance on a same-tab lock when BroadcastChannel is missing`; World ownership spec same-tab clear plus remote lock. Finance Karma 779 SUCCESS; web Karma 653 SUCCESS |
| LOCAL2 | Wrong owner, wrong version, `invalidate`, malformed values, and a non-string tab id return null and are not rewritten for the current owner. A lock whose tab id is this tab is ignored. A sign-out that carries this tab id is delivered. Owner changes on the session port follow the new id. | PASS | `lock-notice.spec.ts` reject matrix, owner-change, and sign-out echo specs; Hub echo/sign-out spec; Pixels foreign/malformed/self-echo spec; World foreign/malformed/self-echo then valid lock |
| LOCAL3 | Disposing a subscriber twice does not call it again. A listener removed during the pass does not run. A listener added during the pass waits. After Pixels or World is destroyed, a later lock does not clear it. A throwing listener does not stop the next one. | PASS | `lock-notice.spec.ts` disposal and throw specs; Pixels `does not drop finance after the service is destroyed`; World ownership spec after `destroy` |
| LOCAL4 | `isRemoteLock` and the Hub/Pixels/World channel and storage listeners are gone. Production `BroadcastChannel` construction for this channel remains the lock sender (`postLock`), the market coordinator sender/invalidate receiver, and the one adapter listener. | PASS | symbol search; `make typecheck-web`; Finance and web Karma |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Hub, Pixels, and World storage listeners, `finance-vault-sync-v1` construction, and `isRemoteLock` | `HubComponent.watchVaultLock`, `PixelsDataService` constructor, `WorldComponent` storage subscription | `acceptLockNotice` / `bindLockNotices` in `lock-notice.ts`. Hub still aborts and calls `lockFinance`. Pixels still `dropFinance`. World still `onFinanceCleared`. Same-tab Pixels snapshots stay on `bindLockSnapshots` | Deleted the three copies. No compatibility wrapper | LOCAL1–LOCAL3 |
| Market coordinator lock/sign-out predicate | `isTabMessage` accepted lock, sign-out, and invalidate | `acceptLockNotice` for lock and sign-out. `isInvalidateMessage` stays in the coordinator, which still sends invalidate and sign-out on its own channel | Removed the lock/sign-out branch of `isTabMessage`. Coordinator is not a second lock parser and does not subscribe, so its own sign-out post is not applied twice | coordinator specs inside Finance Karma 779 SUCCESS |

- Candidate class and protected counterexamples: duplicate live policy. Owner, revision, and vault additional-data checks are unchanged. No event bus and no plaintext store.
- Comparison base SHA and full replacement closure: `3f0304381486682169fb94f4c42875e63452393d`. Closure is `lock-notice.ts`, `lock-finance.ts` (channel constant only), `public-api.ts`, `market-refresh-coordinator.service.ts`, `hub.component.ts`, `pixels-data.service.ts`, `world.component.ts`.
- Production added/deleted/moved: added 181, deleted 107, net +74. Moved 0. `lock-notice.ts` is 128 lines (102 code, 13 comment, 13 blank). Hub net −27, Pixels net −29, World net −4, coordinator net +5, public API +1, `lock-finance.ts` 0.
- Independent equivalent implementations before/after: three shell parsers plus the coordinator lock predicate, then one `acceptLockNotice` and one `storageLocksVault`.
- State/cache owners and public entry points before/after: feature records stay in Hub, Pixels, and World. Public entries added: `bindLockNotices`, `acceptLockNotice`, `storageLocksVault`, `VAULT_SYNC_CHANNEL`, `LockSessionNotice`. `bindLockSnapshots` and `lockFinance` stay the same-tab snapshot owner and the lock sender.
- Remaining old symbol/path search: `isRemoteLock` and `watchVaultLock` remain only in this packet's prose. Production channel constructors are `postLock`, the coordinator, and the adapter.
- Follow-up change: which production files and independent policy owners now need editing: a new lock subscriber calls `bindLockNotices` and keeps its own clear. Invalidate messages stay in `market-refresh-coordinator.service.ts`.
- Tests/docs/generated changes separately: tests added 290 and deleted 9, net +281 (`lock-notice.spec.ts` 172, Hub spec +26/−4, Pixels spec +75/−4, World spec +17/−1). This file is the documentation change. Generated bundles are not committed.
- Net production delta and specific reviewed safety/compatibility exception if positive: +74. The increase is the single validator: version, integer owner, kind, tab type, self-echo for lock only, disposal, and one shared listener. The copied predicates did not share the sign-out exception or the malformed rejection. No protocol fields were added.
- No behavior/data/meaningful assertion silently removed: Hub still ignores dek migration, clears on lock signal, presence removal, and a null storage key, and does not lock twice. A sign-out that names this tab still locks. World now uses that same storage policy, including presence removal and a cleared store, which its old `LOCK_SIGNAL`-only listener missed.

## Verification

`CHROME_BIN` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` were `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. `SUITE_KARMA_COVERAGE` was unset. An earlier finance Karma start failed before any spec because a leftover `SUITE_KARMA_COVERAGE=0` disabled the coverage plugin while the runner still requested it. That run is not a result. The sequence below is the clean rerun.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS |
| `make lint-web` | PASS. eslint-finance 469, eslint-site 9, eslint-packages 1, eslint-world-engine 0, matching baseline |
| `make typecheck-web` | PASS |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 779 SUCCESS. Statements 75.06% (7657/10201), branches 64.76% (3733/5764), functions 71.97% (1962/2726), lines 78.09% (6770/8669) |
| `npm test --prefix apps/site -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 15 SUCCESS. Statements 92.17% (106/115), branches 64.7% (22/34), functions 83.33% (20/24), lines 93.2% (96/103) |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 653 SUCCESS. Statements 82.41% (5042/6118), branches 68.65% (1877/2734), functions 81.92% (1038/1267), lines 85.93% (4393/5112) |
| `node --test packages/browser/runtime/*.test.mjs packages/ui/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs` | PASS. 18 pass, 0 fail |
| `make e2e` | PASS. 240 passed, 8 skipped |
| `npx playwright test --config apps/media/e2e/playwright.config.ts` | PASS. 72 passed |
| `npx playwright test --config apps/travel/e2e/playwright.config.js` | PASS. 144 passed. `plan.py launch SAFE-04` prints this `.js` path |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 68 passed |
| `npx playwright test --project=suite` | PASS. 24 passed |

## Handoff

- PR URL (leaf closure keyword only): opened from this branch with `Closes #204` and `Refs #198`
- Roadmap #134 append-only status-note URL: posted after the squash merge
- Merged/activation status: not merged at this commit. Not a deployment
- Remaining external prerequisites or approved scope decisions: parent #198 stays open. Invalidate transport stays on the market coordinator
- Next actor: integration owner, after the squash merge
