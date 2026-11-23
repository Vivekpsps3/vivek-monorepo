# ROOM-03 — implementation evidence

- Leaf issue and parent(s): [#453](https://github.com/Vivekpsps3/vivek-monorepo/issues/453) ROOM-03. Parent [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304) stays open. Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) stays open. [#277](https://github.com/Vivekpsps3/vivek-monorepo/issues/277) stays open and was not edited.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/room-03`; `/tmp/vivek-room-03`. The shared checkout was not edited. Town, Health, Travel, Media, and server product files were not edited by this leaf. GAME-01 arrived through the merge below and those files were left as merged.
- Base main SHA, current tested SHA: product and tests are `3fc157e1d8d47d5dc3673ff4027cd7480c5cde9c`. The branch then merged `origin/main` at `bb3008249f2f97d88ce89a32a1715fda4c00ab46` (GAME-01, pull request #602). That merge is `5a3824467715b7c6e453dd47b2aa07a99e2f8034`. Finance files are unchanged by the merge. `make test-fast`, `make lint-web`, `make typecheck-web`, and root Karma ran on `5a382446`. Finance Karma and `make e2e` ran on `3fc157e1` before the merge. `origin/main` at branch start was `a64f25fa434e202576037abcf5495974fcce45f0` (ROOM-02, pull request #601). No rebase and no force-push.
- Fresh-main/prerequisite/active-PR checks: SCENE-03 (#441, merge `57b69462126defe6bf3b8853237a8b18c1c9abcf`, pull request #555), FUX-04 (#393, merge `4b8a004905e691947598e08a8916179558fcf09f`, pull request #528), FUX-05 (#394, merge `809254d5984a39426deea3993ac20e52977fb4ee`, pull request #529), and FUX-06 (#395, merge `620fcb87f3c7654c3cb0742777096bf93e3b863c`, pull request #530) are ancestors of `5a382446`. [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/453#issuecomment-7113515665). No other open pull request touched the Finance study files when this branch was pushed.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| ROOM-03-A1 | Synthetic Harbor rent, Pier gas, Maritime archives, a posted rent payment, a Northwind deposit, and Harbor checking. Open the rent bill. The inspector says Actual for the posted payment and Projected for the scheduled commitment, both $1,200.00, and opens Edit bill. Open Northwind. Actual and Projected are each $5,000.00 and Edit job opens. Open Simulation. Actual is the published net worth $1,200.00 and Projected is the one-run median, with the note that it does not change current balances. | PASS | `planning-study.spec.ts`, `planning-study.component.spec.ts`, `client-finance.spec.ts`, and Playwright `planning-study.spec.ts` at 390 and 1280, light and night. |
| ROOM-03-A2 | From the opened simulation, Open Simulation, set Horizon to 18, and return through Accounts. The checking balance, posted expense, deposit, and bill amount stay the same. Liabilities stay empty. No vault upsert was recorded. | PASS | Playwright journeys at 390×844 and 1280×800, light and night. Component spec asserts one `createRun` and that a failed run leaves the session draft in place. |
| ROOM-03-LIFE | A failed bill load keeps the month and offers retry. A failed projection keeps the simulation draft. Lock hides names and amounts, and a late median cannot repaint them. A changed session token drops the loaded bill. | PASS | `planning-study.component.spec.ts` failure, draft, lock, and owner cases, plus the Playwright lock journey. |
| ROOM-03-VIEW | 390×844 touch and 1280×800 keyboard, light and night, reduced motion. The inspector starts fully in view. Study rows, the month field, and study links are at least 44px. Axe violations on `app-planning-study` are empty before open, after the bill, and after the simulation. No horizontal scroll. Animations in the study are 0. Escape returns focus to the opened row. | PASS | Four Playwright viewport journeys plus the lock journey. Screenshots stayed in the Playwright attachments and were not committed. |

Fixtures are synthetic. Names and due dates stay visible so a record can be chosen. Amounts stay hidden until that bill, job, or simulation is opened. The study reads `commitmentFacts` and `computeCashflowSummary` for bills and pay, and calls `PlanningService.createRun` once for the simulation median. It does not keep another ledger or add a crypto protocol.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| No earlier planning-study module | Bills page, Pay page, and planning tools | `PlanningStudyComponent` reads published bills, jobs, transactions, and net worth, and opens the existing editors | Retained. The study does not replace those screens, add a second ledger, or add a crypto protocol. `unmatchedScheduledExpenses` still uses the one match loop. | Bills, Pay, and planning-tool specs still pass inside Finance Karma and `make e2e`. |

- Candidate class and protected counterexamples: Bills, Pay, the planning tools, vault lock, and the cashflow match loop stay. No earlier study module existed to delete.
- Comparison base SHA and full replacement closure (including new files): `a64f25fa434e202576037abcf5495974fcce45f0` through product commit `3fc157e1`. New production files under `apps/finance/frontend/src/app/planning-study/`: `planning-study.ts`, and the component, template, and stylesheet. Changed production files: `client-finance.ts`, `have-hub.component.ts`, `income.component.ts`, `income.component.html`, `assets-liabilities.component.html`, and `public-api.ts`.
- Production added/deleted/moved; comments/blank-only churn separately: production +1093/−13, net +1080, counted on `3fc157e1` against `a64f25fa`. Guidance +5/−4 (`apps/finance/AGENTS.md` at 300 words, `docs/FRONTEND.md`). Blank-only lines are not split out. This evidence file is additional docs after that count.
- Independent equivalent implementations before/after: 1 / 1 cashflow summary (`computeCashflowSummary` and the private match loop) and 1 / 1 planning run (`PlanningService.createRun`). 0 / 1 planning study. The study does not call `workflow.runComparison` and does not add a second Monte Carlo. 0 / 0 second ledger.
- State/cache owners and public entry points before/after: entry is `/finance/have?t=study` inside `HaveHubComponent`. The opened bill, job, or model lives in the study component and the route query. Lock seals the study so a late run cannot repaint amounts. Bills remain `/finance/bills`. Pay remains `/finance/pay`. Planning tools remain under `/finance/planning`. The simulation horizon still writes only the existing session draft.
- Remaining old symbol/path search, including config and discovery: `planning-study.spec.ts` is discovered with the Finance Playwright files (`listed project=finance files=52`). `projectPlanningStudy` is exported from `public-api.ts`. `commitmentFacts` stays inside Finance. No new finance section-nav item.
- Follow-up change: which production files and independent policy owners now need editing: none inside this leaf. No queue or parent ledger was edited.
- Tests/docs/generated changes separately: tests +630/−1 (`planning-study.spec.ts`, `planning-study.component.spec.ts`, `e2e/planning-study.spec.ts`, `client-finance.spec.ts`, and the hub spec). Guidance is above. This evidence file is docs. No generated bundle is committed. `make e2e` exited 0 on `3fc157e1`. Release `cc905928099dde3fd7151e91d31f48bec07c8276c2cdac851a21f6708c6ff956`. The initial bundle stays over the 650 kB warning budget at 728.91 kB. The budget was not raised. Study copy is in the have-hub lazy chunk. Existing unused-import warnings on Dashboard, Investment insights, and Stock Lab remain.
- Net production delta and specific reviewed safety/compatibility exception if positive: +1080 production lines. The positive delta is the study. It is not a simplification claim. No Reviewed boundary exception was added.
- No behavior/data/meaningful assertion silently removed: confirmed. Finance Playwright passed 297 tests, 5 skipped. The skipped tests are the existing 1280 target rows and the other previously skipped Finance rows.

## Verification

Commands ran in `/tmp/vivek-room-03`. `make test-fast` and `make e2e` used `PATH="/tmp/node-v24/bin:/tmp/vivek-room-03/.venv/bin:$PATH"`. Karma and Playwright used `CHROME_BIN` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` at `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. `node_modules` and `.venv` are symlinks to the shared checkout and are not committed. Python lint, typecheck, and coverage gates were not run. The leaf diff has no Python product file. There is no separate interactive browser on this machine. Playwright Chromium exercised the study at 390×844 and 1280×800, light and night, including a simulation that returned to Accounts without an upsert.

| Command | Result |
| --- | --- |
| `python3 planning/implementation/plan.py launch ROOM-03` | Prints `make test-fast`, `make lint-web`, `make typecheck-web`, Finance Karma, root Karma, and `make e2e`. It does not edit the queue. |
| `make test-fast` | PASS on `5a382446`. Doc paths OK. Planning validation PASS (103 active packets, 25 parents, 99 completed packets, forty TD owners). 135 unittest tests OK. E2E discovery lists finance files=52. Node script tests 21 pass / 0 fail. |
| `make lint-web` | PASS on `5a382446`. eslint-finance 344, eslint-site 9, eslint-packages 1, eslint-world-engine 0. Each matches its baseline. |
| `make typecheck-web` | PASS on `5a382446`. Web app and spec, Finance, packages, and site. |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS on `3fc157e1`. 553 SUCCESS. Statements 65.22% (8468/12982), branches 52.04% (3890/7474), functions 61.39% (2029/3305), lines 68.71% (7476/10879). An earlier full run reported one failure in `vault-crypto.spec.ts` (`indexedDbHoldsDek` returned false). That spec was not edited. The isolated file then passed 16/16, and the full suite rerun passed 553/553. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS on `5a382446`. 713 SUCCESS. Statements 78.18% (11820/15118), branches 65.74% (5215/7932), functions 80.52% (2539/3153), lines 83.39% (10285/12333). |
| `make e2e` | PASS on `3fc157e1`. 297 passed, 5 skipped (3.4m), including five planning-study journeys. |

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/603. The body is only `Closes #453`.
- Roadmap #134 append-only status-note URL: recorded after merge.
- Merged/activation status (actual evidence, not assumption): not merged yet. No deployment.
- Remaining external prerequisites or approved scope decisions: none. The job editor now marks itself for check when the study opens or closes it, matching the bill and subscription editors.
- Next actor: review and merge this leaf only.
