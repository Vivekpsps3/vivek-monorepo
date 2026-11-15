# TOWN-03 — implementation evidence

- Leaf issue and parent(s): TOWN-03 / #251. Parent #81 is referenced and stays open. Living World PLACE-04 stays unbuilt.
- Agent/context, branch/worktree: sole implementer, `/tmp/vivek-town-03`, branch `agent/town-03`.
- Base main SHA, current tested SHA: base `c461fe791251b13e02a05911531246f01f0e8290` (SEC-05 #362). Code under test `d9c952168c0248859bcd66a13726e478125f8dc4`. This evidence file is documentation after that SHA.
- Fresh-main/prerequisite/active-PR checks: the branch merged `origin/main` at `c461fe7` (merge `1c3f182`) and kept SEC-05 recovery, vault, and `exportFinanceRecovery` in `public-api.ts`. `loadFinanceBudgetKept` was already exported. TOWN-02 and SAFE-05 are ancestors of that main. Claim already recorded on #251. `public-api.ts`, Hub loaders, routes, discovery, schema, and Town writes/models were not edited.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| TREAS1 | A four-week habit streak with the newest completed week `false` and an older week `true` stays `Lv 1 · 0 weeks` / `treasury-1.svg`. The inverse (current ISO week ignored, two completed `true` weeks) is `Lv 3 · 2 weeks` / `treasury-2.svg`. Town XP stays `Lv 3 · 340 / 500 XP`. Pure vectors cover gaps, `null`, duplicates, malformed dates, unordered weeks, and a 52-week run that saturates. The face has no money fields. Browser clock `2026-10-29T19:00:00Z` in `America/Los_Angeles`: 52 completed Mondays `2025-10-27` through `2026-10-19`, one `$1` expense on `2025-10-27`, saved annual plan `36500` (`manual`). Treasury shows `Lv 5 · 52+ weeks` and `treasury-3.svg`. The habit day streak remains. Town XP is unchanged. | PASS | `weeks-kept.spec.ts`; `town.component.spec.ts` “shows the treasury tier from completed budget weeks, not a long habit streak”; `apps/web/e2e/town.spec.ts` “treasury follows completed budget weeks and clears when Finance locks” |
| TREAS2 | A locked vault does not call `loadFinanceBudgetKept` and paints `Finance vault locked` to `/finance/vault/unlock?next=%2Ftown`. A late ready result after `VAULT_PRESENCE` is cleared and `cleared$` fires cannot restore the tier. Owner 8 without presence does not load. Owner 9 with presence shows “No spending plan” to `/finance/planning`. User `null` returns to locked. Browser: the first locked visit records no `/vault/records` request, then no-plan and no-data links, then the ready tier, then Lock Finance on `/settings/finance` clears `52+` and any `Lv` digit. Town XP is the same before and after the lock. | PASS | `town.component.spec.ts` “explains a locked Finance vault…” and “clears a visible treasury tier on lock and does not let the old load return”; the same Playwright test. Stale Hub snapshot after a failed retry stays in `hub.component.spec.ts` / `hub-load.spec.ts` and was not re-driven in the browser. |
| TF5 | The existing Hub card, not a second card, covers loading `aria-busy`, ready Town XP ARIA, a 44px keyboard Open Town link at 390 and 1280, passive Media `+10`, a 503 Retry of at least 44px, a 401 expired session with no progress bar, and an empty town “Choose a first habit”. The card text has no Treasury, Health, or `$`. Hub sources were not edited. | PASS | `apps/web/e2e/town.spec.ts` “TF5 Hub card stays free of Treasury and answers loading, retry, expiry, empty, and keyboard”, inside the Town Playwright run (81 passed). Existing Hub unit tests remain the stale-state proof. |

Treasury asks `loadFinanceBudgetKept` only while `vaultOpenFor` matches the owner, with `today`, `weeks: 52`, `includeCurrentWeek: false`, and `deadlineMs: 8000`. Publication uses `openBoundedWork` and `mayPublish`. `weeksKeptRun` still feeds World and is unchanged.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Treasury use of habit `weeksKeptRun` | Town lot and Today treasury face | `financeBudgetRun`, `treasuryFromBudget`, `treasuryFace` in `weeks-kept.ts`, loaded through `TOWN_BUDGET_KEPT` | Habit wiring removed from the treasury face. `weeksKeptRun` retained and still exported. World `world.component.ts` still calls it. | Contrasting unit fixtures above. `git grep weeksKeptRun` in `apps/web/src/app` hits the helper, its spec, the barrel, the levels comment, and World. |
| A second Hub card or a copied TF5 state machine | Existing `town-hub-card.ts` | That card, unchanged | Retained. `hub.component.ts` and `hub-load.ts` have an empty diff against `origin/main`. | TF5 browser matrix plus the existing Hub specs. |

- Candidate class and protected counterexamples: required feature repair. Habit streaks, Town XP, World `weeksKeptRun`, and the Hub card stay. No server budget copy, no 7/365 math, no schema change.
- Comparison base SHA and full replacement closure (including new files): `c461fe791251b13e02a05911531246f01f0e8290`. Closure is `weeks-kept.ts`, `town.component.ts` and its template, `town-lot` and `town-today` (component, template, and the Today min-height rule), `index.ts`, the levels comment, and the specs plus `apps/web/e2e/town.spec.ts`. No new production file.
- Production added/deleted/moved; comments/blank-only churn separately: `git diff --numstat origin/main...HEAD` production is +320 / −42 (net +278). `weeks-kept.ts` +176, `town.component.ts` +109/−7, `town-lot.component.ts` +12/−21, `town-today.component.ts` +9/−8, templates and the Today CSS make up the rest. `town-levels.ts` +2/−1 is comment-only. The growth is one budget projection and its lifecycle gate, not a second calculator.
- Independent equivalent implementations before/after: one habit run used for Treasury before; one budget run after. `weeksKeptRun` remains the only habit-week helper. One Hub card before and after.
- State/cache owners and public entry points before/after: the treasury signal starts locked and drops on lock, owner change, and logout. Budget weeks stay in the Finance vault. Town XP still comes from `GET /api/town`. The setup screen still posts `/api/finance/vault/setup`; the Playwright test rewrites that one call to `/api/vault/setup`. `vault.service.ts` and `public-api.ts` were not edited.
- Remaining old symbol/path search, including config and discovery: Treasury no longer calls `weeksKeptRun`. Routes, `discovery.mjs`, and Town writes/models are unchanged.
- Follow-up change: which production files and independent policy owners now need editing: none in this packet. PLACE-04 is later scope.
- Tests/docs/generated changes separately: `weeks-kept.spec.ts` +141/−1, `town.component.spec.ts` +138/−19, lot/today/constants specs +38/−12, `town.spec.ts` +163. This file is documentation. No generated bundle is committed.
- Net production delta and specific reviewed safety/compatibility exception if positive: net +278 production lines, of which `town-levels.ts` is a comment. The positive delta is the budget-week projection and the lock/owner publication gate. It is a safety and feature repair, not a simplification claim.
- No behavior/data/meaningful assertion silently removed: habit streaks, Town XP copy, and the Hub card contract remain. The treasury face no longer treats a habit streak as a budget run.

## Verification

Local gates on `/tmp/vivek-town-03` at `d9c952168c0248859bcd66a13726e478125f8dc4`. Chrome was `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. Heavy commands used `flock /tmp/vivek-heavy-checks.lock`. Python was the shared checkout `.venv`. `make test-fast` is recorded after this file is saved.

| Command | Result |
| --- | --- |
| `make lint-python` and `make typecheck-python` | PASS |
| `make lint-web` and `make typecheck-web` | PASS |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 724 SUCCESS. Statements 82.87% (5680/6854), branches 69.97% (2193/3134), functions 82.69% (1128/1364), lines 86.59% (4921/5683). |
| `make build-frontends` | PASS. Browser bundle at `dist/web`. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS on the rerun: 81 passed. An earlier full run had 79 passed and 2 failed. `town-checkin.spec.ts` “visibility after the local date changes” then passed alone. The treasury test stayed on vault setup because the client posts `/api/finance/vault/setup` (404); the test now forwards that one request to `/api/vault/setup`, saves the plan from the simulation tool, and locks from `/settings/finance`. The isolated treasury test then passed, and the full Town project passed 81. |
| `npx playwright test --project=suite` | PASS. 30 passed (42.8s). |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS on the rerun: 859 SUCCESS. Statements 75.51% (8468/11214), branches 65.34% (4172/6385), functions 72.05% (2120/2942), lines 78.74% (7452/9463). The first run was 29 FAILED, 830 SUCCESS: jasmine 5s timeouts in untouched vault crypto (`vault-record-capability.spec.ts` “does not call crypto when the vault is locked” and the following crypto cluster). No Finance source was changed. The rerun passed. |
| `make e2e` | PASS. 256 passed, 8 skipped (1.7m). |
| `./scripts/coverage-gate.sh server` | PASS. 887 passed. Total coverage 79.10% (floor 61.53%). Floor not changed. Perf `GET /api/town` p50 130.81 ms (min 129.95, max 179.45). |
| `make test-fast` | PASS. Doc paths, blame revisions, shared boundaries, and Finance UX F1 gates OK. Planning validation 95 packets. Unittest 98 OK. e2e discovery guard OK. Node script tests 21 pass, 0 fail. |

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/368 (`Closes #251` only). #81 is referenced and not closed. Leaf note: https://github.com/Vivekpsps3/vivek-monorepo/issues/251#issuecomment-6888485265
- Roadmap #134 append-only status-note URL: https://github.com/Vivekpsps3/vivek-monorepo/issues/134#issuecomment-6888485058. The roadmap body and `queue.json` are not edited.
- Merged/activation status (actual evidence, not assumption): PR #368 is open. Local gates passed. CI is not recorded here. Not merged. Not deployed. Not activated.
- Remaining external prerequisites or approved scope decisions: none for this packet. The vault setup URL split stays in the client; this leaf only rewrites it inside the Town browser test.
- Next actor: review and squash-merge. Do not start HUB-02 or TOWN-04 from this branch.
