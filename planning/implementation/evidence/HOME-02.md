# HOME-02 — implementation evidence

- Leaf issue and parent(s): [#449](https://github.com/Vivekpsps3/vivek-monorepo/issues/449) HOME-02. Parents [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304) and [#313](https://github.com/Vivekpsps3/vivek-monorepo/issues/313) stay open. Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) stays open. #277 stays open and was not edited.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/home-02`; `/tmp/vivek-home-02`. The shared checkout was not edited. Health, Finance, Travel, Media, and server product files were not edited.
- Base main SHA, current tested SHA: product and tests are `8002c377b9ae2aa773e5dcdc4230f3dd68bc87ea`. The gates below ran on that tree. This note only records the SHA. The branch started at `6244f204fe7c5580dc8945eb91f345cbf7db89dd` and fast-forwarded to `27c99dc28370c5d2c49382bc1486faeb98c3573f` (ROOM-05, pull request #576) before the catalog commit.
- Fresh-main/prerequisite/active-PR checks: STYLE-04 (#385, pull request #497, merge `7c2302295618d3a215038510c5116aff2476a37f`) is an ancestor of this base. [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/449#issuecomment-7105855275). At claim time the open pull request was #576 (ROOM-05, Travel). It merged and was fast-forwarded with no overlap. No other pull request was open at commit time.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| HOME-02-A1 | The selected catalog is twelve free starters and twelve shop items, in design order, with day and night SVG files, footprint, layer, anchor, and attribution. Every id selects inside its declared pixel bounds in light and night. | PASS | `cosmetic-catalog.spec.ts` and `cosmetic-catalog.component.spec.ts`. `apps/web/e2e/cosmetic-catalog.spec.ts` at 390×844 and 1280×800, light day and dark night. Preview natural size matches columns×56 by rows×56. |
| HOME-02-A2 | Sample layout keeps `oak-seat` and unsupported `missing-keepsake`. The missing id is labeled and stays in the list. A shop item has no place control. A starter that does not fit is refused. The layout stops at 64 without dropping the unknown id. | PASS | Component spec missing, shop, fit, and cap cases. Playwright unsupported list text and the 503 artwork case. |
| HOME-02-LIFE | Artwork failure keeps the column draft and the saved entries. Retry ignores a stale paint token. An owner change and a lock clear the draft and restore that owner's sample. A load after destroy does not write. A held oak-seat response after Back to Town does not paint the Town page. | PASS | Component spec late-load case. Playwright failure, retry, place, and focus-return case. |
| HOME-02-VIEW | 390×844 touch and 1280×800 keyboard, light and night, reduced motion. Choice targets are at least 44px. Day and Night switch the selected art. Focus returns to the Town catalog link. Axe serious and critical violations on `app-town-cosmetic-catalog` are empty. No horizontal scroll. No Stamp key in localStorage. | PASS | Four Playwright viewport journeys plus the 1280 light correction journey. Screenshots stayed in the Playwright output and are not committed. |

Fixtures are synthetic. Starter price is 0 and the label is Free. Shop prices are listed in Stamps and are not granted or spent. The nine milestone ornament ids stay out of the catalog. The Town y-down frame is unchanged. Pixel scores are unchanged.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| No prior starter or shop cosmetic catalog in the app. The nine milestone ornaments were never registered as assets. | Design names in `planning/product-revamp/design.md`. Milestone sets in `planning/living-world/catalog.md`. | `apps/web/src/app/town/cosmetic-catalog.ts` for the 24 items. `MILESTONE_ORNAMENT_IDS` names the nine and carries no art or price. | None removed. Milestones stay specified, not folded into starter or shop, and not a second asset catalog. | `cosmeticById` is null for each milestone id. The page text does not offer Buy, Grant, or a balance. |

- Candidate class and protected counterexamples: Reading Hall and Hall assets, Town habit rules, and the milestone eligibility sets stay. No previous cosmetic module existed to delete.
- Comparison base SHA and full replacement closure (including new files): `27c99dc28370c5d2c49382bc1486faeb98c3573f`. New production files: `cosmetic-catalog.ts`, the catalog component, template, and stylesheet, and 48 SVG files under `apps/web/public/town/cosmetics/`. Changed production files: Town route and header link, private Town section, `routes.json`, `route-examples.json`, and `return-context.ts`.
- Production added/deleted/moved; comments/blank-only churn separately: production +845/−1, net +844, including 192 SVG lines. Guidance and discovery +7/−7 (`town/AGENTS.md`, `docs/QUALITY.md`, `tests/e2e/discovery.mjs`, `scripts/check-e2e-discovery.test.mjs`). Blank-only lines are not split out.
- Independent equivalent implementations before/after: 0 / 1 cosmetic catalog. 0 / 0 currency wallet. The nine milestone ids are a name list, not a second catalog.
- State/cache owners and public entry points before/after: `/town/cosmetics` is the page. The selected item and day or night part live in the URL. The layout is an in-memory owner map seeded from the sample, including the unsupported id. Lock clears additions. HOME-01 still owns server layout persistence. GAME-02 still owns purchase and refund.
- Remaining old symbol/path search, including config and discovery: `cosmetic-catalog.spec.ts` is in `townTestMatch`, the discovery test, and `docs/QUALITY.md`. `/town/cosmetics` is in `routes.json` and `route-examples.json`. Return path keeps `item` and `part` of day or night.
- Follow-up change: which production files and independent policy owners now need editing: none inside this leaf. No queue or parent ledger was edited.
- Tests/docs/generated changes separately: tests +454, including the catalog unit, component, and Playwright specs. This evidence file is docs. No generated bundle is committed. `make build-frontends` exited 0. Release `b615bb9b8bd78910cd7b865abaa5ae11a93295b0a4b9430bff88b57f65236e21`. The initial bundle stays over the 650 kB warning budget at 680.98 kB. The budget was not raised. Existing Finance unused-import warnings remain.
- Net production delta and specific reviewed safety/compatibility exception if positive: +844 production lines. This is the feature: the selected catalog, day and night files, footprint and layer metadata, attribution, and a session preview that can place a free starter. The positive delta is the implementation, not a simplification claim. No Reviewed boundary exception was added.
- No behavior/data/meaningful assertion silently removed: confirmed. Existing Town Playwright journeys still pass (191 passed).

## Verification

Commands ran in `/tmp/vivek-home-02`. `make test-fast` used `PATH="/tmp/vivek-home-02/.venv/bin:$PATH"` because `/usr/bin/python3` has no project dependencies. Karma used `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. Playwright used its installed Chromium. `node_modules` and `.venv` are symlinks to the shared checkout and are not committed. The first `make test-fast` failed in `test_restore_drill` before Alembic imported, then failed the new spec as an orphan. The allowlist names `cosmetic-catalog.spec.ts`. The table is the venv run after that. A focused Karma run failed `dataset` on `Element`; the spec casts `HTMLElement`. The full web suite below is the result. `apps/server/tests/test_route_parity.py` ran because `routes.json` and `route-examples.json` changed. Python lint, typecheck, and coverage gates were not run. The leaf diff has no Python product file.

| Command | Result |
| --- | --- |
| `python3 planning/implementation/plan.py launch HOME-02` | Printed the commands below. It did not edit the queue. |
| `make test-fast` | PASS. Doc paths OK. Planning validation PASS (88 active packets, 24 parents, 99 completed packets, forty TD owners). 135 unittest tests OK. E2E discovery lists town files=20. Node script tests 21 pass / 0 fail. |
| `make lint-web` | PASS. eslint-finance 344, eslint-site 9, eslint-packages 1, eslint-world-engine 0. Each matches its baseline. |
| `make typecheck-web` | PASS. Web app and spec, Finance, packages, and site. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 666 SUCCESS. Statements 77.75% (10473/13469), branches 65.48% (4671/7133), functions 79.85% (2240/2805), lines 82.78% (9108/11002). |
| `make build-frontends` | PASS. Release hash above. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 191 passed (2.0m), including five cosmetic catalog journeys. |
| `npx playwright test --project=suite` | PASS. 61 passed (47.0s), including the app-switcher End key on Life. |
| `python3 -m pytest -q apps/server/tests/test_route_parity.py -m "not perf"` | PASS. 38 passed, 1 skipped. |

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/577
- Roadmap #134 append-only status-note URL: recorded after merge.
- Merged/activation status (actual evidence, not assumption): not merged yet. Pull request #577 is open.
- Remaining external prerequisites or approved scope decisions: HOME-01 owns saved layout persistence. HOME-03 owns the four rooms. HOME-04 owns place, rotate, and recolor. GAME-02 owns buy and refund. No deployment.
- Next actor: review and merge this leaf only.
