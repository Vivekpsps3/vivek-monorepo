# HOME-01 — implementation evidence

- Leaf issue and parent(s): [#466](https://github.com/Vivekpsps3/vivek-monorepo/issues/466) HOME-01. Parents [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304), [#312](https://github.com/Vivekpsps3/vivek-monorepo/issues/312), and [#313](https://github.com/Vivekpsps3/vivek-monorepo/issues/313) stay open. Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) stays open. [#277](https://github.com/Vivekpsps3/vivek-monorepo/issues/277) stays open and was not edited.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/home-01`; `/tmp/vivek-home-01`. The shared checkout was not edited. Finance, Travel, Media, and Health measurement records were not edited. Travel migration tests only gained the new schema-head labels.
- Base main SHA, current tested SHA: product and tests are `bd7f694fd589d274075b112a114f228dff8e320e`. Gates below ran in `/tmp/vivek-home-01` on that tree before this evidence file. `origin/main` at branch start was `bb3008249f2f97d88ce89a32a1715fda4c00ab46` (GAME-01, pull request #602). It moved to `0010c4955c8aeb9f0d1e1435b17c509dbbdc39f5` (ROOM-03, pull request #603). That update was merged with a fast-forward. No rebase and no force-push.
- Fresh-main/prerequisite/active-PR checks: TOWN-07 `af0b2f0709eeebfe165823ed01af5a044ece3e51`, SCENE-03 `57b69462126defe6bf3b8853237a8b18c1c9abcf`, and GAME-01 `bb3008249f2f97d88ce89a32a1715fda4c00ab46` are ancestors of this branch. The Stamp wallet is on that main. The Town scene frame in `library-room.scene.ts` remains y-down, with the origin at the room's top left. It was not changed. The only other open pull request at start was #603, Finance only, and it is now on main.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| HOME-01-A1 | Synthetic owner 1 saves the study starters at revision 0 and receives revision 1. A second writer with the old revision gets 409 and the row stays at revision 1. A foreign owner cannot read or replace that row. An oversized body, a bad room, a doorway cell, an overlap, and a 17th wall item write nothing. | PASS | `apps/server/tests/test_town_layouts.py`. Playwright saves the study at 390 and 1280, light and night, then the older revision is rejected and the stored revision stays 1. |
| HOME-01-A2 | Upgrade from the Stamp head keeps a habit, a world concept, a trip, and a layout row whose catalog id is not in this catalog. Downgrade drops `town_room_layouts`. Deleting the owner removes that owner's layout and leaves the other owner's row. | PASS | Upgrade and delete cases in `test_town_layouts.py`. `make db-check` and `make db-validate-seeded`. |
| HOME-01-LIFE | A 503 keeps the palette and the session note. A conflict updates the displayed revision from the exact server sentence and does not replace the palette. An owner change clears the note and the palette and drops a late revision 4. | PASS | `home-room.component.spec.ts`. The same 503 and conflict sentences are in the four Playwright journeys. |
| HOME-01-VIEW | 390×844 and 1280×800, light and night (`suite-theme`), keyboard at 1280 and touch at 390, reduced motion. Save layout and Save the older revision are at least 44px. Axe on `app-town-home` has no serious or critical violations. No horizontal scroll. Animations under the home element are 0. The page does not say Stamps or Buy. | PASS | Four journeys in `apps/web/e2e/town-home.spec.ts`, inside the Town Playwright run of 228 passed. Screenshots stayed in Playwright attachments and were not committed. |
| PLACE-08-MIG | One Alembic head, `site_town_layouts_v1`. Expand-only. A foreign owner, a malformed payload, and a mismatched revision do not change the stored row. Account delete removes only that owner's layout. | PASS | `test_town_layouts.py`, `test_schema_migrations.py`, and the seeded upgrade from `site_town_stamps_v1`. |
| PLACE-09-PRIVATE | The write body is catalog id, cell or wall slot, orientation, and palette. A desk note and extra keys such as `note` are absent from the request and from the public read. A private key injected in SQL stays in the row and is omitted from the response. | PASS | `home-layout.spec.ts`, the HTTP privacy case, and the Playwright request and GET assertions. |

Fixtures are synthetic catalog ids and room cells. The layout does not accept a health measurement, a trip id, a money amount, or an identity field. Known free starters save without a Stamp. A priced or unknown catalog id needs an active entitlement. Refund behavior is unchanged and does not look for a placed layout. `/town/home` has no Stamp gate for viewing. `/town/memory` still awards no Stamps. The scene keeps the authored starters. The saved payload is those starters plus the chosen palette. The server response does not move the furniture.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| No earlier room-layout store | The home page rendered authored starters only. Cosmetic prices stay on the catalog. | `apps/server/town/layouts.py` and the save controls on `HomeRoomComponent` | Retained. No prior layout path existed to delete. Placement editing, undo, and corrupt recovery stay with HOME-04 and HOME-05. | Home specs and Town Playwright still pass. |

- Candidate class and protected counterexamples: habits, the Stamp wallet, the cosmetic catalog, memory shelves, and the y-down scene frame stay. Account deletion removes `town_room_layouts` before the stamp tables and before the user row. There is no cascade from `users`.
- Comparison base SHA and full replacement closure (including new files): `0010c4955c8aeb9f0d1e1435b17c509dbbdc39f5`. New production files: `apps/server/town/layouts.py`, `apps/server/alembic/versions/site_town_layouts_v1.py`, and `apps/web/src/app/town/home-layout.ts`. Changed production files: `town/models.py`, `town/router.py`, `town/schemas.py`, `schema.py`, `identity/admin.py`, `checks.py`, `town.api.ts`, and `home-room.component.ts`, `.html`, and `.css`.
- Production added/deleted/moved; comments/blank-only churn separately: production +797/−8, net +789. Guidance +4/−1 (`apps/web/src/app/town/AGENTS.md` 299 words, `FEATURES.md`, `scripts/restore-drill.py`). `apps/web/AGENTS.md` stays 297 words and `apps/server/AGENTS.md` stays 300 words. Blank-only lines are not split out. This evidence file is additional docs after that count.
- Independent equivalent implementations before/after: 0 / 1 layout store. 1 / 1 Stamp wallet. 1 / 1 cosmetic catalog. 1 / 1 Town XP path. The layout checks entitlements and does not grant or refund Stamps.
- State/cache owners and public entry points before/after: entry is `/town/home/:room`. Reads and writes are `GET` and `PUT /api/town/layouts/{room}`. The row is keyed by owner and room. The palette is a same-session draft. A generation counter drops a late response after an owner change or a room change. The scene does not re-render placements from the server.
- Remaining old symbol/path search, including config and discovery: `town-home.spec.ts` was already in the Town Playwright allowlist (`listed project=town files=24`). `TOWN_CONSTANTS_VERSION` stays 1. No new route was added.
- Follow-up change: which production files and independent policy owners now need editing: HOME-04 owns place, rotate, recolor, and the milestone choice. HOME-05 owns undo, reset, conflict presentation beyond this revision sentence, and corrupt recovery. No queue or parent ledger was edited.
- Tests/docs/generated changes separately: tests +1083/−8, including schema-head labels in three Travel migration tests. Guidance is above. This evidence file is docs. No generated bundle is committed. The initial web bundle stays over the 650 kB warning budget at 728.91 kB. The budget was not raised.
- Net production delta and specific reviewed safety/compatibility exception if positive: +789 production lines. The positive delta is the layout table, its checks, and the save controls. It is not a simplification claim. No Reviewed boundary exception was added. Coverage floors were not lowered. Server coverage measured 81.68% against a stored 61.87% and floor 61.53%. Travel coverage measured 89.32% against a stored 81.41% and floor 80.41%. The floors stay where they are.
- No behavior/data/meaningful assertion silently removed: confirmed. Town Playwright passed 228 tests. Suite Playwright passed 61. Web Karma passed 716.

## Verification

Commands ran in `/tmp/vivek-home-01` on `bd7f694fd589d274075b112a114f228dff8e320e`. `make test-fast` used `PATH="/tmp/vivek-home-01/.venv/bin:$PATH"` because `/usr/bin/python3` has no Alembic. Karma used `CHROME_BIN` and Playwright used `PLAYWRIGHT_CHROMIUM_EXECUTABLE` at `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. `make db-validate-seeded` used `SITE_IMAGE=personal-site:home-01`, `SEED_PORT=18191`, and `SITE_PORT=18195`. That image was built from this worktree and was not deployed. `node_modules` and `.venv` are symlinks to the shared checkout and are not committed. An earlier Town Playwright run, while coverage and the image build were still finishing, failed one Pixels Life theme assertion (`data-theme` was empty). That spec does not use the layout code. The rerun with the machine idle passed 228, including that spec and the four layout journeys.

| Command | Result |
| --- | --- |
| `python3 planning/implementation/plan.py launch HOME-01` | Prints the commands below. It does not edit the queue. Travel coverage is an extra root gate because the schema-head pins changed. |
| `make test-fast` | PASS. Doc paths OK. Planning validation PASS (103 active packets, 25 parents, 99 completed packets, forty TD owners). 135 unittest tests OK. E2E discovery lists town files=24. Node script tests 21 pass / 0 fail. |
| `make lint-python` | PASS. 268 files already formatted. Ruff 90 findings match the baseline. Suppressions 6 findings match the baseline. Re-run on the final tree. |
| `make typecheck-python` | PASS. Mypy 79 findings match the baseline. Re-run on the final tree. |
| `./scripts/coverage-gate.sh server` | PASS. 479 passed, 1 skipped. Total 81.68% (6632 statements, 1215 missed). Floor 61.53%. Perf gate `GET /api/town` p50 176.57 ms, 1 passed. |
| `./scripts/coverage-gate.sh travel` | PASS. 232 passed. Total 89.32% (4206 statements, 449 missed). Floor 80.41%. |
| `make db-check` | PASS. `schema_drift_check` ok at `site_town_layouts_v1`. |
| `make db-validate-seeded` | PASS. Adopt action `stamp_and_upgrade`. Upgrade from `site_town_stamps_v1` to `site_town_layouts_v1`. Upgrade schema diff is empty. |
| `make lint-web` | PASS. eslint-finance 344, eslint-site 9, eslint-packages 1, eslint-world-engine 0. Each matches its baseline. Engine purity 1 pass. |
| `make typecheck-web` | PASS. Web app and spec, Finance, packages, and site. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 716 SUCCESS. Statements 78.24% (11903/15212), branches 65.78% (5248/7978), functions 80.58% (2557/3173), lines 83.47% (10367/12419). |
| `make build-frontends` | PASS. Release manifest written. Initial bundle 728.91 kB, over the existing 650 kB warning by 78.91 kB. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 228 passed (2.5m), including four layout save and rejected-overwrite journeys. |
| `npx playwright test --project=suite` | PASS. 61 passed. |

## Handoff

- PR URL (leaf closure keyword only): recorded after the pull request is opened. The body is only `Closes #466`.
- Roadmap #134 append-only status-note URL: recorded after merge.
- Merged/activation status (actual evidence, not assumption): not merged yet. No deployment.
- Remaining external prerequisites or approved scope decisions: HOME-04 owns the placement editor. HOME-05 owns undo and corrupt recovery. The scene frame stays y-down. Refund does not look for a placed unlock.
- Next actor: review and merge this leaf only.
