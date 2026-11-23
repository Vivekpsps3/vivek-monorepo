# SCENE-10 — implementation evidence

- Leaf issue and parent(s): [#448](https://github.com/Vivekpsps3/vivek-monorepo/issues/448) SCENE-10. Parents [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304), [#307](https://github.com/Vivekpsps3/vivek-monorepo/issues/307), [#310](https://github.com/Vivekpsps3/vivek-monorepo/issues/310), [#317](https://github.com/Vivekpsps3/vivek-monorepo/issues/317), and [#81](https://github.com/Vivekpsps3/vivek-monorepo/issues/81) remain open. Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) remains open. #277 remains open and was not edited.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/scene-10`; `/tmp/vivek-scene-10`. The shared checkout was not edited. `apps/web/src/app/town/health/`, Finance, Travel, Media, and server code were not edited by this leaf. HEAL-05 arrived through the merge below.
- Base main SHA, current tested SHA: work started from `08d2c9b47aea0af77e00ac2b29ba38012afbbba1`. The branch was fast-forwarded to `bdbee8e6ea329387d3680087a6491dfe7b8c9a01` (ROOM-10, pull request #566), then merged `e2f1d28e27f4d067cb0c1e7ce79da5301a6ee004` (HEAL-05, pull request #568). Product and tests are `5c66021e`. The gates below ran on merge `28d9aa4581e7923444a8dea19343aabdc140a344`. This note only records that SHA.
- Fresh-main/prerequisite/active-PR checks: SCENE-03 (#441) and PIX-02 (#423) are merged ancestors. `git fetch origin main` before the merge left `origin/main` at `e2f1d28e27f4d067cb0c1e7ce79da5301a6ee004`. Town keeps the existing y-down frame. Pixel scores were not changed. World still renders; the legacy `/town/world?day=` redirect stays with MERGE-02.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| SCENE-10-A1 | Seed `pixels-facts`, clock `2026-10-29T19:00:00Z`, timezone America/Los_Angeles. Year `/pixels?year=2024&day=2024-02-29` opens `/town?visit=2024-02-29&from=year&year=2024`. Life `/pixels/life?span=2024-02-29` opens `/town?visit=2024-02-29&from=life&span=2024-02-29`. World, Back, Forward, and reload return that exact origin. A direct visit URL reloads to the same canonical link. | PASS | `apps/web/e2e/town-date-visit.spec.ts` at 390×844 and 1280×800, light and dark. `date-visit.spec.ts` prefers `visit` over a settled World `day`. |
| SCENE-10-A2 | 2024-01-15 stays unrecorded. 2026-12-01 stays ahead and can still list a fact. A 503 day stays unavailable with Retry. `2024-02-31` stays invalid and does not call the day API. Town zoom, Harbor, and inspect do not grow `history.length`. A World drag adds one history entry and the Pixels link still uses the visit day. Activity markers hide the fact list without hiding buildings, and on World they leave the recorded list and canvas visible. | PASS | `town-date-visit.spec.ts` distinct-state test and the World drag inside the round trip. `date-visit.component.spec.ts` appearance cases. |
| SCENE-10-LIFE | A late day read is ignored after the selection changes. An owner change clears the correction draft and ignores the pre-change resolver. An unavailable read keeps the typed invalid draft. Ordinary failure does not clear that draft. | PASS | `date-visit.component.spec.ts` held response, owner change, and failed read. |
| SCENE-10-VIEW | 390×844 touch and 1280×800 keyboard, light and night, reduced motion. Visit, World, Activity, Retry, and the correction field are at least 44px. Focused controls show an outline. Axe serious and critical violations on `app-date-visit` are empty. Transition duration is 0s and the panel has no running animations. | PASS | `town-date-visit.spec.ts` viewport matrix and axe include `app-date-visit`. |
| PLACE-03-ROUND | The selected Year day and the birthday-relative Life span land on dated Town. World carries the same `visit`, `from`, and year or span. Back, Forward, reload, and the Pixels link return that origin. A plain World week without `from` still uses the existing day link. | PASS | `town-date-visit.spec.ts` round trip. Existing `world.spec.ts` "See this day in Pixels" when no visit is selected. |
| PLACE-06-QUIET | Recorded, unrecorded, future, and unavailable copy stay distinct. Unrecorded does not say the day failed or was rest. Future does not say nothing was recorded. Turning activity off does not hide the recorded source list on World or the town buildings. | PASS | `town-date-visit.spec.ts` state sentences and both activity toggles. `visitSentence` in `platform/date-visit.ts`. |

Fixtures are the pixels-facts seed: check-in "Read synthetic" on 2024-02-29, trip "Leap harbor", and no private concept note in the panel. The layout note says rooms, levels, and balances are not reconstructed. The exterior still shows the live town.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| No prior Town date-visit panel. World already had its own week/day query and Pixels link. | Year and Life had no Town visit link. World `day` was the Pixels return when no selection was present. | `platform/date-visit.ts` reads one selection. Town renders the facts. Pixels links into Town. World keeps `visit` while the camera may replace `day`. | Nothing deleted. The civil-date check is duplicated in the platform module so Town, Pixels, and World do not import one another. | `git diff bdbee8e6..5c66021e` adds the module and does not remove World. |

- Candidate class and protected counterexamples: World renderer, Town y-down frame, Pixel scores, and the live town layout stay. No historic balance or room state is invented.
- Comparison base SHA and full replacement closure (including new files): `bdbee8e6ea329387d3680087a6491dfe7b8c9a01` through product `5c66021e`. New production files: `apps/web/src/app/platform/date-visit.ts`, `apps/web/src/app/town/date-visit.component.ts`, `.html`, and `.css`.
- Production added/deleted/moved; comments/blank-only churn separately: production +638/−7, net +631. Guidance pixels and world AGENTS plus `docs/QUALITY.md` are +8/−4 and are not in that production count. Blank-only lines are not split out.
- Independent equivalent implementations before/after: 0 / 1 visit selection. 1 / 1 World week renderer. 1 / 1 Pixels day service. The ISO check now also lives next to the selection parser.
- State/cache owners and public entry points before/after: the selection is the URL (`visit`, `from`, `year` or `span`). Facts load through the existing `PixelsDataService.loadDay`. A local epoch and owner id drop stale reads. The correction draft is component memory. Activity visibility is component memory and is not written to the URL. Town camera and inspect still use `replaceUrl`.
- Remaining old symbol/path search, including config and discovery: `town-date-visit.spec.ts` is in `townTestMatch`, the discovery test, and `docs/QUALITY.md`. One Reviewed edge: `town/date-visit.component.ts` to `pixels/pixels-data.service.ts`, removal owner `web-town`.
- Follow-up change: which production files and independent policy owners now need editing: none inside this leaf. MERGE-02 still owns the legacy World day redirect. No queue or parent ledger was edited.
- Tests/docs/generated changes separately: tests and discovery +476/−8. This evidence file is docs. No generated bundle is committed. `make build-frontends` exited 0. Release `50b2475f1030d6da419d225a4c083cd46860a4b56bb792a41f0cd37a122ce334`. The initial bundle stays over the 650 kB warning budget at 680.17 kB. The budget was not raised. Existing Finance unused-import warnings remain.
- Net production delta and specific reviewed safety/compatibility exception if positive: +631 production lines. This is the visit panel, the shared selection parser, and the Year, Life, and World links. The positive delta is the feature. The Reviewed service edge is the one cross-feature call, because Town reads day facts from the existing Pixels service.
- No behavior/data/meaningful assertion silently removed: confirmed. Reading Hall return now removes the `/api/town` stubs with the same route functions Playwright registered. The settled progress line is asserted so a loading inspector cannot pass as ready. An earlier full Town run, started while Karma was also running, failed `town-scene.spec.ts` ambience once (audio count 1). That test passed alone, and the Town command recorded below passed 177.

## Verification

Commands ran in `/tmp/vivek-scene-10` on `28d9aa4581e7923444a8dea19343aabdc140a344`. `make test-fast` used `PATH="/tmp/vivek-scene-10/.venv/bin:$PATH"`. Karma used `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. `node_modules` and `.venv` are symlinks to the shared checkout and are not committed. Python lint, typecheck, and coverage gates were not run. The leaf diff has no Python product file. HEAL-05 health files arrived only through the merge.

| Command | Result |
| --- | --- |
| `python3 planning/implementation/plan.py launch SCENE-10` | Printed the commands below. It did not edit the queue. |
| `make test-fast` | PASS. Boundaries OK. 135 Python tests OK. 21 Node script tests pass. Town e2e files are listed (17) and not executed by this gate. |
| `make lint-web` | PASS. eslint-finance 344, eslint-site 9, eslint-packages 1, eslint-world-engine 0. Each matches its baseline. |
| `make typecheck-web` | PASS. Web app and spec, Finance, packages, and site. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 621 SUCCESS. Statements 77.93% (9514/12207), branches 65.67% (4286/6526), functions 79.82% (1971/2469), lines 82.99% (8272/9967). |
| `make build-frontends` | PASS. Release hash above. Initial total 680.17 kB. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 177 passed (2.3m), including the date-visit matrix and Reading Hall return. |
| `npx playwright test --project=suite` | PASS. 61 passed (1.0m). |

## Handoff

- PR URL (leaf closure keyword only): filled in after the pull request is opened. The body is only the leaf keyword for #448.
- Roadmap #134 append-only status-note URL: added after the merge, without editing the issue body.
- Merged/activation status (actual evidence, not assumption): not merged when this sentence is written.
- Remaining external prerequisites or approved scope decisions: none for this leaf. Owner visual review of the visit panel stays separate from these passing checks.
- Next actor: open the pull request, wait for required checks, then merge.
