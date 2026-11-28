# GAME-14 — implementation evidence

- Leaf issue and parent(s): [#483](https://github.com/Vivekpsps3/vivek-monorepo/issues/483) GAME-14. Parents [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304) and [#316](https://github.com/Vivekpsps3/vivek-monorepo/issues/316) stay open. Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) stays open. [#277](https://github.com/Vivekpsps3/vivek-monorepo/issues/277) stays open and was not edited.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/game-14`; `/tmp/vivek-game-14`. The shared checkout was not edited. Server Town models, Media collections, Travel, Finance, and Health stores were not edited. No Town model or migration was added.
- Base main SHA, current tested SHA: base and `origin/main` at fetch time `eb09b79814ebeb7298a9b0b004d33cbc3efbee9a`. Product behavior tested below is `fe9a63b529f9ee79b0e3d89bc537ef9ccf53d50a`. The gates below ran on that tree before this evidence file, and `make test-fast` was repeated after the file was added.
- Fresh-main/prerequisite/active-PR checks: `origin/main` was `eb09b798` at the claim fetch. NAV-04 (#389), SCENE-08 (#446), and GAME-11 (#480) are closed. That base already has the owner-keyed `town.scene.v1` record, opt-in Town sound, and Harbor Rhythm's original tones plus an untimed sequence. Those behaviors stay. Harbor Rhythm was not rebuilt. [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/483#issuecomment-7235748603).

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| GAME-14-A1 | Signed-in owner 1, no stored scene record. Mute is on, volume is 70, motion follows the device, decoration is on, and no `AudioContext` is constructed. A blocked `town.scene.v1` write keeps Town usable: Today opens, Walk stays enabled, and Play Town sound stays off. | PASS | `apps/web/e2e/town-preferences.spec.ts` arrival assertions and the 390 blocked-storage journey. `scene-appearance.spec.ts` defaults. `game-section.component.spec.ts` blocked write. |
| GAME-14-A2 | Volume 40, mute, Reduce motion, and decoration off save on `town.scene.v1.1` and survive reload. Decoration off hides the idle mark. Home still opens `/town/home/living`. Slot 1 still selects Walk 30 minutes. Appearance and Harbor Rhythm write the same sound bit. An open season preview is not committed with a volume change. | PASS | `town-preferences.spec.ts` 1280 journey. `scene-appearance.service.spec.ts` persist. `town-exterior.spec.ts` decoration off. |
| GAME-14-LIFE | A failed preference write keeps the session value, focuses the alert, and does not write another owner. An owner change during a season save does not publish the draft onto the new owner. Hidden, offscreen, or reduced motion does not construct a tone. | PASS | `game-section.component.spec.ts`, `scene-appearance.service.spec.ts`, `scene-sound.spec.ts`, `town-exterior.spec.ts`. |
| GAME-14-VIEW | 1280×800 light keyboard and 390×844 night touch, both with reduced motion. Mute, Reduce motion, decoration, and volume targets are at least 44px. Today opens on the first enabled button and Escape returns to Today. Axe serious and critical violations are empty on `app-game-section`, `app-town`, and `app-town-hall`. No horizontal scroll. | PASS | Both journeys in `town-preferences.spec.ts`. Screenshots `game-preferences-1280-light` and `today-access-390-night` stay in the Playwright output and are not committed. |
| PLACE-12-ACCESS | Keyboard, reduced motion, sound off, and blocked scene storage. Open and dismiss Today. Walk shows "Flower open" with `animation-name: none` and one garden mark that does not animate. Focus returns to Today. Sound stays off. No notification permission request. | PASS | `town-preferences.spec.ts` 390 journey inside the Town run of 341 passed. |

Fixtures are synthetic. Preferences stay on this device for the signed-in owner. Changing mute, volume, motion, or decoration does not start audio. There is no notification service and no autoplay. Hidden and offscreen scenes set `data-hidden` and `data-ambience="still"`. Harbor Rhythm still offers the timed chart and the untimed sequence; reduced motion stops traveling notes. GAME-13 journal pages, resident rewards, and Stamp grants were not redone. MERGE-01 and FIXUP-06 were not implemented.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Game settings sentence that only described the device media query. | `/settings/game` inline template. Appearance and Harbor Rhythm already wrote `town.scene.v1.<ownerId>`. | `SceneAppearanceService` in `scene-appearance.ts`. Game writes mute, volume, motion, and decoration through `persist`. | The inline sentence was replaced by controls on that same record. No second key, Town model, or migration. Old `{season, sound}` records still read and gain volume 0.7, motion `system`, and decoration on. | `scene-appearance.spec.ts` partial records. `town-preferences.spec.ts` stored JSON. Harbor `setSound` still calls `persist({ sound })`. |

- Candidate class and protected counterexamples: season preview, Harbor chart session storage, Memory Shelves session board, and the Health vault store stay. The rest tick still uses the health dialog's own visibility and reduced-motion listener, and it also honors the stored motion and volume. That is not a second preference record.
- Comparison base SHA and full replacement closure (including new files): `eb09b79814ebeb7298a9b0b004d33cbc3efbee9a`. New production files: `game-section.component.html` and `game-section.component.css`. Changed production files: `scene-appearance.ts`, `scene-appearance.service.ts`, `game-section.component.ts`, Harbor Rhythm, Memory Shelves, scene sound and audio, the exterior, the rest timer, and the workout dialog.
- Production added/deleted/moved; comments/blank-only churn separately: production +338/−67, net +271, counted from `eb09b798` to `fe9a63b5`. Guidance and allowlist +12/−8 (`settings/AGENTS.md`, `docs/QUALITY.md`, `tests/e2e/discovery.mjs`). Blank-only lines are not split out. This evidence file is additional docs after that count.
- Independent equivalent implementations before/after: 1 / 1 scene preference record. 0 / 0 second game-preference store. Harbor's chart remains session state, not a preference copy.
- State/cache owners and public entry points before/after: `town.scene.v1.<ownerId>` remains the only preference key. `/settings/game` now edits mute, volume, motion, and decoration immediately. Appearance still previews season until Save. Sign-in still uses the existing session. A blocked write leaves Town routes usable.
- Remaining old symbol/path search, including config and discovery: `townTestMatch` now includes `town-preferences.spec.ts`. The allowlist sentence in `docs/QUALITY.md` names that file. No `town.game` key was added.
- Follow-up change: which production files and independent policy owners now need editing: none inside this leaf. MERGE-01 and FIXUP-06 stay out of this PR. No queue or parent ledger was edited.
- Tests/docs/generated changes separately: tests +414/−23, including `town-preferences.spec.ts` and `game-section.component.spec.ts`. This evidence file is docs. No generated bundle is committed. `make build-frontends` exited 0. Release `804877ffbea446b5e575f02a5dc82025d463790fad801e61508c407f681c2913`. The initial bundle stays over the 650 kB warning budget at 732.98 kB. The budget was not raised. Existing Finance unused-import warnings remain.
- Net production delta and specific reviewed safety/compatibility exception if positive: +271 production lines. This is the preference fields, the Game controls, and the quiet/static scene behavior. The positive delta is the implementation, not a simplification claim. No Reviewed boundary exception was added.
- No behavior/data/meaningful assertion silently removed: confirmed. The first web Karma run failed one pre-existing locked-vault test because an earlier spec had left `finance-vault-present`. That test now removes the key before asserting the injector stays unused. The rerun passed 800. Town Playwright passed 341, including both new journeys. Harbor untimed play and Appearance season save still pass.

## Verification

Commands ran in `/tmp/vivek-game-14`. `make` used `PATH="/tmp/vivek-game-14/.venv/bin:$PATH"`. Karma used `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. Playwright used that Chromium as `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. `node_modules` and `.venv` are symlinks to the shared checkout and are not committed. No Python product file changed, so Python lint, typecheck, and coverage gates were not run.

| Command | Result |
| --- | --- |
| `python3 planning/implementation/plan.py launch GAME-14` | Prints the web, Playwright, and docs commands below. It does not edit the queue. |
| `make test-fast` | PASS on the product tree before this file, and again with this file present. Doc paths OK. Planning validation PASS (120 active packets, 25 parents, 99 completed packets, forty TD owners). 135 unittest tests OK. E2E discovery lists town files=30. Node script tests 21 pass / 0 fail. |
| `make lint-web` | PASS. eslint-finance 344, eslint-site 9, eslint-packages 1, eslint-world-engine 0. Each matches its baseline. Engine purity 1 pass. |
| `make typecheck-web` | PASS. Web app and spec, Finance, packages, and site. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | First run FAIL: 1 failed, 799 success (`loadTownHealthStages` saw a leftover `finance-vault-present`). Repaired run PASS. 800 SUCCESS. Statements 78.11% (13581/17386), branches 66.52% (6291/9457), functions 80.63% (2968/3681), lines 83.59% (11835/14157). |
| `make build-frontends` | PASS. Release hash above. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 341 passed (3.4m), including both `town-preferences.spec.ts` journeys. |
| `npx playwright test --project=suite` | PASS. 75 passed (52.7s). |

## Handoff

- PR URL (leaf closure keyword only): recorded when the pull request is opened. The body is only `Closes #483`.
- Roadmap #134 append-only status-note URL: recorded after merge.
- Merged/activation status (actual evidence, not assumption): not merged yet.
- Remaining external prerequisites or approved scope decisions: no deployment. MERGE-01 and FIXUP-06 stay on their own leaves.
- Next actor: required checks, then merge this leaf only.
