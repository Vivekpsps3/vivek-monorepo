# DEL-03 — implementation evidence

- Leaf issue and parent(s): [#215](https://github.com/Vivekpsps3/vivek-monorepo/issues/215); parents [#200](https://github.com/Vivekpsps3/vivek-monorepo/issues/200) and [#198](https://github.com/Vivekpsps3/vivek-monorepo/issues/198) stay open
- Agent/context, branch/worktree: Cursor Grok, `agent/del-03`, `/tmp/vivek-del-03`
- Base main SHA, current tested SHA: base `08be484ba3b3535dbcb500749245f2e75ee1f2e4`; implementation `8e67e6c50ba0b8fd5831853d1f6df860c460be25`. Commands below ran on that tree before the commit. This evidence file is a later docs-only commit.
- Fresh-main/prerequisite/active-PR checks: no queue dependency. PR #193 is already merged and is not open work. PR #288 is on the original base (`71823ff`, one Town/World main landmark) and World was re-read there before editing. After the PR opened, `origin/main` had moved to `e9cd267b3c047e6e2d5153b5df0378c15ef429e0` (#291, TMDB detail transport). That commit was merged in and did not touch World files. Claim comment is on #215. SAFE-04/SAFE-05 were not given a new lifecycle helper.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| LOCAL1 | Route open, leave, and open again. The `WORLD_CONTROLLER` seam stays the injected owner: a World URL does not dispose it, navigation away disposes it once, and `WorldController.prototype.dispose` is not also called. Without the token, each visit constructs a distinct `WorldController`. Stage pointer/wheel listeners are removed on leave. After destroy, session clear and a `finance-vault-lock` storage event do not call the departed controller; the next visit receives the clear. Playwright leaves `/town/world?week=2026-10-12`, returns through Town, and checks one `app-world`, one `main`, End/Home, and back/forward. | PASS | `apps/web/src/app/world/ui/world.component.spec.ts`; `apps/web/e2e/world.spec.ts` (`leaves World and opens one controller again`); Karma 648; Town Playwright 53 |
| LOCAL2 | `rg` for `WorldControllerService` and `world-controller.service` over source, tests, providers, and config. No import, provider, lazy route, or barrel export. The file is deleted. `connectController` and `WORLD_CONTROLLER` remain the only composition path. No root singleton was added. | PASS | consumer search on `8e67e6c`; deletion ledger below |
| LOCAL3 | Today still jumps to day 3 of `2026-10-26`, and a today outside the loaded span still jumps with day 0 (the old loop's miss, not a clamp to day 6). Keyboard, reduced motion, fog, private chest copy, and the two-bitmap frame cap stay covered. URL reload, landmarks, and back/forward ran in Playwright. `engine/`, `logic/engine-week.ts`, and `weeksKeptRun` were not edited. | PASS | World Karma specs; `npx playwright test --config apps/web/e2e/playwright.config.ts` (53 passed); suite project (24 passed) |
| LOCAL4 | Whole World production diff, not a move: component 7 added / 12 deleted, service 0 / 36. Net production −41. No extra guard. Tests and docs are counted separately below. | PASS | `git diff --numstat 08be484ba3b3535dbcb500749245f2e75ee1f2e4 8e67e6c` |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| `WorldControllerService` in `apps/web/src/app/world/data/world-controller.service.ts` (36 lines, `providedIn: 'root'`) | none beyond the class declaration. No provider array, lazy import, barrel export, template, or test constructed it | `connectController` in `apps/web/src/app/world/ui/world.component.ts`, overridable by `WORLD_CONTROLLER` | removed. Constructor, session subscription, storage listener, and root lifetime go with the file | `rg` on `8e67e6c`; route dispose/reentry specs |
| Repeated today-offset loop (`addIsoDays` seven times) | `goToday` only | existing `dayIndex` | loop removed. Out-of-span dates still use day 0, which is what the loop did | Today spec: day 3, day 0 before start, day 0 after current |
| Unused `scale` field and a second `scaleForWidth` on the floored width | paint wrote it; no reader used it | `scaleNow` → `scaleForWidth` | field and second call removed. `scaleForWidth` is a step at 1024, so floored and raw widths pick the same scale | component diff; existing scale specs |
| Week-origin `index * CHUNK_W` and chest fallback `54` | paint | `tileOfDay(index, 0)` and `CHEST_X` | duplicate literals replaced. `tileOfDay(n, 0)` is `n * CHUNK_W`; `CHEST_X` is 54 | renderer/camera specs; Town Playwright |

- Candidate class and protected counterexamples: verified orphan for the service (no supported import, provider, route, lazy/config, template, or test consumer). The camera/paint edits are duplicate live formulas replaced by the existing helpers. Habit-week and Finance budget math were not consolidated. Media migration SQL, Pixels scoring, and vault protocol were not touched.
- Comparison base SHA and full replacement closure (including new files): `08be484ba3b3535dbcb500749245f2e75ee1f2e4`. Closure is the deleted service, `world.component.ts`, its spec, `apps/web/e2e/world.spec.ts`, the packet source-path line, and the assessment link. No new production file.
- Production added/deleted/moved; comments/blank-only churn separately: production 7 added / 48 deleted / net −41. Moved 0. Comment/blank-only churn 0. The day-span check is the old loop's miss result, not an added guard.
- Independent equivalent implementations before/after: two controller setups (root service and route `connectController`) before; one route setup after.
- State/cache owners and public entry points before/after: the root service is gone. Each World visit constructs its own `WorldController` and disposes it on navigation away and on destroy. `WORLD_CONTROLLER` remains the test override. URL replace, fog storage, and the plain controller snapshot stay.
- Remaining old symbol/path search, including config and discovery: no match under `apps/`, `packages/`, `scripts/`, or tests. Remaining mentions are planning prose: this packet's deletion instructions, DEL-01's ownership sentence, the 2026-11-08 review, and the remediation plan's TD-11 inventory sentence. The assessment link no longer points at the deleted file.
- Follow-up change: which production files and independent policy owners now need editing: a World behavior change edits `world.component.ts` (route/DOM lifetime) and `world-controller.ts` (load/snapshot). SAFE-04/SAFE-05 still own any shared lifecycle helper. Do not reintroduce a root singleton.
- Tests/docs/generated changes separately: tests 237 added / 1 deleted (`world.component.spec.ts` 207/1, `world.spec.ts` 30/0). Docs in the implementation commit: packet 0/1, assessment 4/3. Generated 0. This evidence file is the required note, not a product deletion.
- Net production delta and specific reviewed safety/compatibility exception if positive: net −41. No positive exception. No extra guard.
- No behavior/data/meaningful assertion silently removed: URL query, back/forward, fog, chest copy, reduced motion, keyboard, bitmap cap, and habit-week treasury input stay. Assertions were added, not weakened. Coverage floors were not changed.

`git diff --numstat 08be484ba3b3535dbcb500749245f2e75ee1f2e4 8e67e6c`:

```
30	0	apps/web/e2e/world.spec.ts
0	36	apps/web/src/app/world/data/world-controller.service.ts
207	1	apps/web/src/app/world/ui/world.component.spec.ts
7	12	apps/web/src/app/world/ui/world.component.ts
0	1	planning/implementation/issues/DEL-03.md
4	3	planning/technical-debt/2026-11-09-assessment.md
```

The packet source-path bullet for the deleted file was removed so `planning/implementation/plan.py` still passes. The deletion instructions in that packet remain. The assessment markdown link was pointed off the missing file and now says the wrapper was removed.

## Verification

Node: system `v20.20.2`; these commands used Node `v24.22.2` at `/tmp/node-v24`. `CHROME_BIN` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` were Playwright Chromium `156.0.0.0` (`chrome-linux64/chrome`). Playwright used `PYTHON=/home/vivek/Deployments/vivek-monorepo/.venv/bin/python`. Worktree had no `node_modules`, so `npm ci` was run with Node 24. An earlier Karma start did not execute tests: `SUITE_KARMA_COVERAGE=0` was still exported, the coverage plugin was not registered, and Angular's `codeCoverage: true` then failed the reporter load. That was not an assertion failure. The gate command was rerun with the variable unset.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS (exit 0). Doc paths, planning validation (79 packets), blame, shared boundaries, script unit tests, e2e discovery |
| `make lint-web` | PASS (exit 0). eslint-finance 469, eslint-site 9, eslint-packages 1, eslint-world-engine 0, engine purity 1 passed |
| `make typecheck-web` | PASS (exit 0). web, finance, packages, and site app/spec `tsc` |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS (exit 0). 648 SUCCESS. Coverage statements 82.44% (5085/6168), branches 68.92% (1914/2777), functions 81.77% (1041/1273), lines 86.02% (4432/5152) |
| `make build-frontends` | PASS (exit 0). Output `dist/web` |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS (exit 0). 53 passed |
| `npx playwright test --project=suite` | PASS (exit 0). 24 passed |

IDE browser: `cursor-ide-browser` opened `https://example.com` and could not open `http://127.0.0.1:8791/town/world?week=2026-10-12` (`chrome-error://chromewebdata/`). The Town fixture server was up and returned 200 to local curl. Leave/reenter, one `app-world`, one `main`, the week URL, End/Home, and back/forward were executed by the Playwright test above instead.

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/292 (`Closes #215` only)
- Roadmap #134 append-only status-note URL: filled after the comment
- Merged/activation status (actual evidence, not assumption): PR #292 is open. Not merged and not deployed.
- Remaining external prerequisites or approved scope decisions: none for this leaf. Parents #200 and #198 stay open. SAFE-04/SAFE-05 still own shared lifecycle adoption
- Next actor: merge this PR after the local gates above, then the integration owner reconciles #134 from the merged evidence

Issue / parent / local packet: DEL-03 / #215 / parents #200 and #198 / `planning/implementation/issues/DEL-03.md`

Branch, worktree, base main SHA, current SHA: `agent/del-03`, `/tmp/vivek-del-03`, base `08be484ba3b3535dbcb500749245f2e75ee1f2e4`, implementation `8e67e6c50ba0b8fd5831853d1f6df860c460be25`

Owned files and conflict groups: `world-ui`, `world-controller`, `world-engine`. Edited the World component, its spec, the World Playwright spec, the deleted service, the packet source list, and the assessment link. PR #193 was not treated as open. PR #288's landmark behavior was left in place.

Completed acceptance rows with direct evidence: LOCAL1, LOCAL2, LOCAL3, LOCAL4 PASS, as the table above.

Unfinished/failed rows and exact next action: none. The IDE browser could not reach loopback; Playwright covered that journey.

Deletion ledger and current consumer migration: service file deleted; no callers to migrate. Route `connectController` is the surviving owner.

Commands run, results, tested SHA; required checks still pending: see the verification table. All required local gates passed on the implementation tree. CI is the second run.

PR and roadmap note URLs; actual merge/deployment/activation state: https://github.com/Vivekpsps3/vivek-monorepo/pull/292 is open. Not deployed. The #134 comment follows merge.

External prerequisites and next actor: no external prerequisite. Next actor merges the leaf PR and leaves the parents open.

No unstated decision from the previous context is necessary to continue.
