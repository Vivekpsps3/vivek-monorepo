# STYLE-04 — Register bounded scene assets and migrate one selectable composition

- Leaf #385, parents #304 and #308, roadmap #134.
- Claim and isolated worktree at /tmp/vivek-style-04 on agent/style-04. [Issue claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/385#issuecomment-6963268263)
- Fresh main base fe04d6d84a6a99f525e053e483ba19405ea96e06. Tested implementation 004f1ad8b020f07af9c0a2383f3062881b75a979. The evidence commit carries the tested application and test sources.
- Fresh main contains the shared coastal palette, focus and motion tokens from STYLE-01. The leaf had no competing claim, and no PR was open before implementation. [Prerequisite merge](https://github.com/Vivekpsps3/vivek-monorepo/pull/494)

## Acceptance

| Row | Executed proof | Result |
| --- | --- | --- |
| STYLE-04-A1 | Open Reading Hall from the existing Library lot. Touch the Bookshelves, resize from 390×844 to 1280×800, and switch live between light and night. The link box and painted image box match at both widths and themes. After selecting the desk, a click just inside the Bookshelves bounds selects it again. Its canonical Books action opens the isolated Media library containing Synthetic Reading Hall Almanac. The room reads the level and current-day XP/cap from the real Town API. | PASS |
| STYLE-04-A2 | Hub and Town overview make zero room artwork requests. Entry requests precisely four SVGs. Leaving unmounts every room image and object. A held room-art response released after exit cannot repaint Town. Explicit entry again and direct reload with a selected object work. The room reports zero running animations with reduced motion and with motion enabled. | PASS |
| STYLE-04-LIFE | An art 503 leaves the room roster usable. A Town 503 shows a separate progress retry. Each retry preserves the selected Reading desk and restores focus to an available control or the progress heading. A held previous-owner Town response cannot publish through the actual room subscription, which also unsubscribes on destruction. The room has no private draft fields. Its URL carries a fixed public object ID. | PASS |
| STYLE-04-VIEW | Phone tap, keyboard selection, canonical navigation and Back return to the prior object and to the Library entrance. All visible action targets measure at least 44×44 CSS px. Axe reports zero violations at 390×844 and 1280×800 in light and night. A 320px capture uses a verified 32px root font. A fresh Town with no habits can still enter and leave the room. | PASS |

The real application used an isolated Town and Media server with seeded synthetic
habits and one synthetic saved book. A separate empty-Town reset proved first-visit
access. The 503 and held-response cases are deliberate synthetic failures at the
art and Town request boundaries. The room reads Town-owned Media progress and
links to existing Media destinations without writing records.

Captures attached to the Town Playwright report and copied to
/tmp/style-04-review were inspected apart from the automated checks. Cutaway
walls, window light, shelf depth and desk shadows keep their geometry across both
palettes. At phone width the roster wraps and the inspector stacks below it.
The expanded-text capture keeps all three labels and a readable canonical action.
Independent owner art approval and production activation remain separate.

Room entry makes one Town read and four artwork requests. The artwork is 9,216
bytes uncompressed and the lazy room chunk is 3,877 bytes gzipped. A separate
1280×800 Chromium probe of 36 warm scene selections measured 2.5 ms p95 from
click dispatch to the inspector DOM update. The probe measured script and DOM
publication on the isolated machine.

## Deletion and compatibility

| Candidate | Previous consumer | Surviving owner and proof |
| --- | --- | --- |
| Library lot's direct /media destination | Existing Town building roster | The same Library lot opens the Reading Hall. The Hall retains Media Now as its default action, with the Books, Now and Calendar destinations still owned by Media. Browser tests exercise the existing Town roster, new entry, canonical destination and return. |
| Prior room renderer, asset catalogue or hitbox path | No existing Reading Hall | The one bounded asset catalogue supplies intrinsic bounds, anchors, layer, palettes, attribution and motion. The native anchor and image share one projected rectangle. The three roster links consume the same object definitions. |
| Existing Library sprite and progression | Town overview | Retained for the exterior Library lot, with its current stage and source labels. Town continues to own stage and daily XP, and existing passive-credit and habit tests still pass. |

Feature replacement at the stated base. Production changes add 459 and remove
4 physical lines, including 144 lines of original artwork. Tests and route
fixtures add 237 and remove 1 line, and Town guidance adds 5. No files moved.
The new room has one progress subscription and four browser-owned image loads.
There is one route-scoped selection, stored in the URL for return, and one
bounded geometry owner. A follow-up room object changes the Town catalogue and
its original artwork, with its canonical action still supplied by its app.

## Verification

Final gates used Node 24, the repository Python environment and installed
Chromium. The initial browser and Karma runs caught a missing server document
manifest entry, and the browser failure fixture initially used a glob that
missed the timezone query. The private route registration and precise intercept
were corrected and rerun. The first fast run lacked the venv's Alembic and
passed when rerun with the repository interpreter. Gates and baselines are intact.

| Command | Result |
| --- | --- |
| make test-fast | PASS. Planning/docs, boundaries, 111 Python and 21 Node script tests. |
| make lint-web | PASS. Existing lint baselines and engine purity. |
| make typecheck-web | PASS. Seven TypeScript projects. |
| npm run test:web -- --watch=false --browsers=ChromeHeadlessCI | PASS. 406 tests and coverage. |
| make build-frontends | PASS. Production build and release manifest. Existing Finance import warnings still reported. |
| npx playwright test --config apps/web/e2e/playwright.config.ts | PASS. 114 tests, including five Reading Hall browser journeys. |
| npx playwright test --project=suite | PASS. 50 tests. |
| ./scripts/coverage-gate.sh server | PASS. 372 tests, 75.45% coverage and the separate passive-history performance gate. The manifest tested by this gate is unchanged at the tested implementation. |
| make lint-python | PASS. Format, Ruff and suppressions. |
| make typecheck-python | PASS. Existing mypy baseline. |

## Handoff

- The closing PR and scoped roadmap note are linked from the #385 issue timeline.
- The issue worker reviews the published diff and checks the exact head before
  authorized merge. The PR timeline records CI, review and merge status.
- Independent owner visual approval and deployed activation have separate evidence.
