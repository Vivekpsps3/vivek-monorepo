# ROOM-14 — implementation evidence

- Leaf issue and parent(s): [#464](https://github.com/Vivekpsps3/vivek-monorepo/issues/464) ROOM-14. Parents [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304), [#256](https://github.com/Vivekpsps3/vivek-monorepo/issues/256), [#258](https://github.com/Vivekpsps3/vivek-monorepo/issues/258), and [#90](https://github.com/Vivekpsps3/vivek-monorepo/issues/90) remain open. Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) remains open. #277 remains open and was not edited.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/room-14`; `/tmp/vivek-room-14`. The shared checkout was not edited. Town files outside `apps/web/src/app/town/health/`, Media, Travel, and server code were not edited by this leaf. `apps/finance/frontend/src/public-api.ts` is unchanged. `apps/web/src/app/town/AGENTS.md` was left unchanged.
- Base main SHA, current tested SHA: work started from `dd64f2bddab94251a7a4867345ce2ec92029c302`. Product and tests are `88b6d67bc6999c0a05df1ad1c9a91abce270707e`. The gates below ran on merge `a46a5e15309dc2e8bfa489d457a28c62beaea225`, which contains that commit and `origin/main` `b70ca1159fe311973b917e81b72a59e826d57856` (HOME-03). This note only records those SHAs.
- Fresh-main/prerequisite/active-PR checks: SCENE-03 (#441), HEAL-03 (#429), and HEAL-04 (#430) are merged ancestors. Pixel scores were not changed. Lab folders and the checkup book read `HealthStoreService` through the existing vault API. No second store and no new crypto protocol. Fixtures are synthetic.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| ROOM-14-A1 | Synthetic Ω-other lab `hlt_SyntheticLabNoRangeABC` (4 u, 2026-10-28, no bounds) and Ω-marker `hlt_SyntheticLabBelowRange` (9 u, bounds 10 to 20). Older checkup 2026-09-02 “Older synthetic visit” and newer checkup 2026-10-28 “Newer synthetic visit”. Opening the no-range folder shows cells 2026-10-28, 4, u, no range, and “Shown in u.” The checkup book lists the newer visit, then the older measured date and note. An unordered bound (low 20, high 10) stays “no range” and does not print 20. A one-sided low bound prints “below range · from 5 u”. | PASS | `health-history.spec.ts` groups the archive rows. `health-room.component.spec.ts` opens the folder and the book. `apps/web/e2e/health-entry.spec.ts` opens both in the browser. |
| ROOM-14-A2 | A failed lab rename to Ω-held keeps the draft and “Could not save this entry. Try again.” The saved value stays 4. Escape returns focus to the Edit button. Signing out removes the folder names, notes, archive tables, and the name field. Town requests do not carry those strings. Exterior clinic text has no measurement digits and no folder names. | PASS | The same component spec and `openClinicArchive` in Town Playwright. Locked Lab folders and Checkup book show no tables and no digits. |
| ROOM-14-LIFE | A held rename to Ω-held is in flight when the session user changes to id 8. The loading room hides Ω-other, Ω-held, Ω-marker, both notes, and 2026-09-02. The late upsert does not land. `upsertCancelled` is greater than 0. The ready room has no folder button and no name field. | PASS | `health-room.component.spec.ts` “opens a no-range lab and an older checkup, and drops a held edit when the owner changes”. |
| ROOM-14-VIEW | 390×844 touch and 1280×800 keyboard, light and night, reduced motion. Locked clinic copy has no digit. Folder and book targets are at least 44 px. Opening a folder focuses its heading. All lab folders returns focus to that folder button. Axe serious and critical violations on `app-health-room` are empty. Horizontal overflow is at most 1 px. Transition duration is 0 s. Range words are below, in, above, and no range. Visible text does not match diagnos, healthy, or normal. | PASS | `clinic-room.spec.ts` hits (540, 180) and (540, 300) and digit-free copy. Town Playwright health-progress loop at 1280 light, 390 light, 1280 dark, and 390 dark. |

Exterior labels are “Lab folders” and “Checkup book”. The open folder title stays in memory and is not written to the URL. Selecting labs or checkups moves that series into the inspector so the archive ids stay unique. The other series stays in the list.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| The flat lab and checkup articles in the Clinic ready list. No prior folder or checkup table. | Health room clinic route and `health-entry.spec.ts`. | `HealthStoreService` still owns `health_stats`. `buildClinicSeries` still derives the rows. `labRangeText` is the one range sentence. | Nothing deleted. The unselected series stays in the list. The selected series renders in the inspector with grouped tables. | `git show --stat 88b6d67b` adds the folders and the book and does not remove the store or the edit ids. |

- Candidate class and protected counterexamples: vault crypto, `public-api.ts`, Pixel scores, and Town files outside health stay. The HOME-03 merge is present and was not edited again.
- Comparison base SHA and full replacement closure (including new files): `dd64f2bddab94251a7a4867345ce2ec92029c302` through product `88b6d67bc6999c0a05df1ad1c9a91abce270707e`, then merge `a46a5e15309dc2e8bfa489d457a28c62beaea225`. No new production file. Edited production files are under `apps/web/src/app/town/health/`.
- Production added/deleted/moved; comments/blank-only churn separately: production +305/−49, net +256. Guidance is `FEATURES.md`, +1/−1, and is not in that production count. Blank-only lines are not split out.
- Independent equivalent implementations before/after: 1 / 1 clinic scene. 1 / 1 clinic history projector. 1 / 1 health store.
- State/cache owners and public entry points before/after: the durable clinic selection is the `object` query on `/town/clinic`. The open folder title, zoom, and pan stay in memory. Lock, an owner change, or leaving the lab object clears the open folder through `dropPrivate` or the query effect. `object` is not added to the vault return query.
- Remaining old symbol/path search, including config and discovery: `public-api.ts` has no diff. Town e2e discovery lists 22 files after the HOME-03 merge. This leaf did not add a file.
- Follow-up change: which production files and independent policy owners now need editing: none inside this leaf. No queue or parent ledger was edited.
- Tests/docs/generated changes separately: tests +382/−5. This evidence file is docs. No generated bundle is committed. `make build-frontends` and the build inside `make e2e` exited 0. Release `d7ac72891f8c396e3d134fa0a1f444d7e6432ceb1e2b482237402a0a672fae86`. The initial bundle stays over the 650 kB warning budget at 681.80 kB. The budget was not raised. The health room chunk is 157.89 kB. Existing Finance unused-import warnings remain.
- Net production delta and specific reviewed safety/compatibility exception if positive: +256 production lines. This is the lab folders, the checkup book, and the inspector wiring that reuses the existing editor. The positive delta is the feature.
- No behavior/data/meaningful assertion silently removed: confirmed. Locked clinic copy stays digit-free. An unselected clinic still lists the other series. A failed save keeps the previous row.

## Verification

Commands ran in `/tmp/vivek-room-14` on `a46a5e15309dc2e8bfa489d457a28c62beaea225`. `make test-fast` and `make e2e` used `PATH="/tmp/vivek-room-14/.venv/bin:$PATH"`. Karma used `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. Playwright used `PLAYWRIGHT_CHROMIUM_EXECUTABLE` set to that same Chrome. `node_modules` and `.venv` are symlinks to the shared checkout and are not committed. Python lint, typecheck, and coverage gates were not run. The leaf diff has no Python product file.

| Command | Result |
| --- | --- |
| `python3 planning/implementation/plan.py launch ROOM-14` | Printed the commands below. It did not edit the queue. |
| `make test-fast` | PASS. Boundaries OK. 135 Python tests OK. 21 Node script tests pass. Town e2e files are listed (22) and not executed by this gate. |
| `make lint-web` | PASS. eslint-finance 344, eslint-site 9, eslint-packages 1, eslint-world-engine 0. Each matches its baseline. |
| `make typecheck-web` | PASS. Web app and spec, Finance, packages, and site. |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 521 SUCCESS. Statements 63.39% (7777/12267), branches 49.51% (3445/6958), functions 59.31% (1856/3129), lines 66.83% (6867/10275). |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 690 SUCCESS. Statements 77.79% (11274/14492), branches 65.44% (5002/7643), functions 80.11% (2425/3027), lines 82.89% (9811/11836). |
| `make build-frontends` | PASS. Release hash above. Initial total 681.80 kB. Health room chunk 157.89 kB. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 207 passed (3.8m), including the archive journey at 1280 light, 390 light, 1280 dark, and 390 dark. |
| `npx playwright test --project=suite` | PASS. 61 passed (2.1m). |
| `make e2e` | PASS. 281 passed, 5 skipped (3.3m). The rebuild wrote the same release hash. |

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/597. The body is only the leaf keyword for #464.
- Roadmap #134 append-only status-note URL: not added yet. The issue body will not be edited.
- Merged/activation status (actual evidence, not assumption): not merged when this sentence is written.
- Remaining external prerequisites or approved scope decisions: none for this leaf. Owner visual review of the folders stays separate from these passing checks.
- Next actor: wait for required checks, then merge.
