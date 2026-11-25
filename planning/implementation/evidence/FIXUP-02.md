# FIXUP-02 — implementation evidence

- Leaf [#580](https://github.com/Vivekpsps3/vivek-monorepo/issues/580). Parents [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578) and [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304) stay open.
- Sole worker in `/tmp/vivek-fixup-02`, branch `agent/fixup-02`. [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/580#issuecomment-7155549737).
- Fresh main base `07ee27ec95aed49dab4532a49023bb8b83583d23`. The live leaf was open and unclaimed. There were no open PRs at claim. The four dependencies are main ancestors: SCENE-02 `b1c9d0ea` (#553), SCENE-04 `1745b9c0` (#558), SCENE-05 `08d2c9b4` (#567), and SCENE-08 `3ca43de6` (#563). Verified the live exterior controls, Today write and feedback owners, and owner-bound Appearance on that base.
- Product and unit-test revision `2cc7bfbeb0674075fe2fcc0d2376d07db6e3e59a`. Browser tests include the test-only `bfb2e7fe01036e2fd20eb1ee51fb87f3b741acb0` change to exercise the non-default camera and a collapsed picker. The full browser rerun includes test-only `a3f26538477918d0c15569c66227902fa9ceed14` for the mobile Media boundary.

## Acceptance

| Row | Current proof and observed result | Artifact or command |
| --- | --- | --- |
| FIXUP-02-A1 | At 390×844, the full map, Today, and a named building control are in the viewport without scrolling, before and after founding. The first check button receives focus when Today opens by keyboard, so Enter twice checks in. Two taps reach a real Walk check-in, with the exact habit ID and server day in the POST. The real response paints the garden feedback. Undo sends the dated DELETE and clears the mark. | `town.spec.ts` layout, exterior, and unfounded journeys. `town-checkin.spec.ts` touch journey and light/night feedback matrix. |
| FIXUP-02-A2 | At 320px and a 32px root font, Today opens, focuses a useful action, and Escape restores the opener. There is no horizontal overflow. The first-habit editor returns focus after cancellation, and Library opens the real Reading Hall and regains focus on Back. On an inspected lot, Today Escape preserves selection and the zoomed camera. Escape from scene controls restores focus to the inspected lot even if Buildings was collapsed. History, archiving, failed draft recovery, and suggestion-prefilled founding pass. At 1280×800, Today is visible next to the map. | `town.spec.ts` exterior cases, `town-habits.spec.ts`, and `town-dialogs.spec.ts`. Actual browser axe checks, focus, bounds and route assertions. |
| Appearance, dates and lifecycle | The compact View controls retain zoom, reset, pan guidance, season preview state and sound. Season remains a presentation-only override. Offscreen, hidden, and reduced-motion scenes remain quiet. Dated return and Back/Forward retain source visits. Existing held, failed and duplicate check-ins preserve authoritative feedback and publication guards. | `town-scene.spec.ts`, `town-date-visit.spec.ts`, `town-checkin.spec.ts`, and `town-today.component.spec.ts`. |

### Visual comparison

Captured synthetic `town` and `town-empty` against production builds at both 390×844 and 1280×800 in light and dark. The before capture uses the audit's compiled `27c99dc28370c5d2c49382bc1486faeb98c3573f` tree and the after capture uses this branch. Measured browser positions in CSS pixels with scroll at zero.

| View | Before map | After map | After Today | After Buildings |
| --- | --- | --- | --- | --- |
| 390, founded | y599–879 | y295–565 | y137–181 | y628–672 |
| 390, first visit | y1111–1391 | y351–621 | y193–237 | y684–728 |
| 1280, founded | y464–944 | y202–682 | Check-in content starts at y219 beside the map | y745–789 |
| 1280, first visit | y924–1404 | y258–738 | Check-in content starts at y275 beside the map | y801–845 |

Local capture matrix `/tmp/fixup-02-reviewed`. The after set includes the 390px Today drawer in both themes. Screenshot review identified and corrected a wrap in the Residential control. The axe scans found no serious or critical violations in the affected layouts. Exterior district art and per-building scene captions are owned by #581. Independent owner visual review remains pending.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner and disposition | Proof |
| --- | --- | --- | --- |
| Full-width founding empty state, 128px starter image and always-open duplicate suggestion block | First visit to `/town` | Removed the empty state and its image from arrival. One compact first-habit action opens the existing dialog. An optional Habit ideas disclosure preserves the three suggestions and date eligibility copy. The direct Library entrance comes from the existing building list. | Unfounded viewport and first-habit focus tests, suggestion-prefill journey and real Reading Hall Back. |
| Always-visible scene season/date explanation, sound status and default Town place crumb | `TownExteriorComponent` | View controls carries the actual settings link, preview, sound and camera controls. An inspected place retains its crumb. No new appearance or camera owner. | Season and ambience browser suite, date-visit tests and inspected-lot focus tests. |
| Duplicated locked and ordinary building button branches | Building list | One button branch uses the same building model and optional habit mark. The existing link branches, named routes and scene hit geometry survive. | Six districts and 16 buildings, locked-lot assertions, real routes, camera, keyboard, touch and history tests. |
| Full-width XP meter and arrival navigation ahead of the map | Town page | Compact level status retains progress semantics. The supplemental destination links follow the primary layout. The same Today component stays mounted for desktop, the narrow drawer and resize. | Role/value checks, low width check-in, resize, focus return, existing Home, Hall, Workshop and World journeys. |

- Production diff +201/−88 against `07ee27ec`, including moved/reindented link, picker and scene markup. Test diff +114/−15 before evidence. The net production addition is for responsive visibility, 44px controls, focus and compatibility. No new state or transport owner was added.
- One Today action owner, one camera/selection owner, one building list, and one habit editor before and after. No API, migrations, state calculations, server records, art or external services changed.
- The two habit edit tests now select the actual lot inside Town buildings. Their earlier broad selectors selected the first similarly named check-in after the responsive tab-order change. The first-visit unit test now verifies the Library building and scopes the duplicate Home and Hall route assertions to the destination navigation. The mobile Media boundary tests now open Today before trying to write a check-in and still compare real Media records before and after. All existing behavioral assertions remain.

## Verification

| Command | Result |
| --- | --- |
| `PATH="$PWD/.venv/bin:$PATH" make test-fast` | PASS. Planning and path checks, 135 Python tests and 21 Node tests. |
| `make lint-web` and `make typecheck-web` | PASS. Existing web, Finance, site, packages, and World lint and typing baselines match. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 716 tests, 77.59% statement coverage. |
| `make build-frontends` | PASS. The production manifest is generated. The existing initial bundle advisory is 729.29 kB against its 650 kB warning threshold. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 240 Town, Pixels and World browser tests. |
| `npx playwright test --project=suite` | PASS. 61 suite browser tests. |

Node 24, the installed worktree-linked Python environment, and local Chromium ran the gates. Build and web unit checks used the same product and unit-test tree as the final browser revision. The initial full Town run passed 238 of 240. The two missed cases attempted to check in from a closed Today drawer. Both now operate the actual disclosure and all 240 passed on rerun.

## Handoff

- The single implementation PR closes [#580](https://github.com/Vivekpsps3/vivek-monorepo/issues/580). The leaf records the live PR, and the [roadmap](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) carries merge and CI proof.
- The next leaf in the owner's sequence is [FIXUP-03 #581](https://github.com/Vivekpsps3/vivek-monorepo/issues/581). It owns the exterior art and map composition on this layout. Production deployment and independent owner visual review require separate evidence.
