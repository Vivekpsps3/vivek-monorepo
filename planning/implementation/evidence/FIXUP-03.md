# FIXUP-03 — connected coastal Town map

- Leaf [#581](https://github.com/Vivekpsps3/vivek-monorepo/issues/581). Parents [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578) and [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304) stay open.
- Sole worker on `agent/fixup-03` in `/tmp/vivek-fixup-03`. [Issue claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/581#issuecomment-7169898035).
- Fresh main base `1626db3e6d460ff85dcb9c2b04d9284061aacb43`. No overlapping PR or claim at start. Verified the FIXUP-02 first-viewport layout, STYLE-04 Reading Hall, SCENE-01 camera helpers, SCENE-02 six-district building actions, and SCENE-08 owner appearance on that base. The prerequisite merges `1626db3e`, `7c230229`, `58b055a9`, `b1c9d0ea`, and `3ca43de6` are main ancestors.
- Tested product and test revision `847583d3483951c17b0458aa957bdf89dbcc75df`.

## Acceptance

| Row | Executed proof and result | Artifact or check |
| --- | --- | --- |
| FIXUP-03-A1 | On the audited `27c99dc2` and fresh base with synthetic Town data, the 390px Culture frame clipped Library, Theater, Music bar and Arcade against 53px boxes. Their natural single-line widths were 56, 61, 74 and 55px. At desktop, the tint plates and square sprite backdrops were separate. The Reading Hall and the selected concept use coastal colors, angled building faces and shadows. | Audited and base captures in the matrix below. |
| FIXUP-03-A1 | Founder and first-visit overview show the connected coast, streets, lit landmarks, garden and pier at both widths and palettes. The Culture frame shows all four whole names at the actual map locations. Framing other districts uses the same map anchors. Screenshot review moved the Theater name away from the Music bar entrance, staggered Garden names, and kept all four Culture names readable at 320px with a 32px root font. Focus moves the name into one screen-space label, including a 40-character habit name. | Real production capture matrix, `town.spec.ts` Culture and layout cases, `town-dialogs.spec.ts` naming journey. |
| FIXUP-03-A2 | At 390 and 1280, the browser scans the shared Theater and Music bar frame region to find three real paint cases. Touching the transparent intersection stays on Town. Touching both shapes opens the front Music bar. At a second zoom after a pointer pan, touching the exposed Theater opens Movies. Drag changes the transform without navigating. Enter on the building picker opens the same actions. | `town.spec.ts` Culture journey, `town-exterior.spec.ts` bounds, cancel and owner cases. |
| Layout and failure | The 390px Today disclosure, map, Buildings and first building action remain in the arrival viewport. Reduced motion keeps the scene still and omits the outgoing variant. The active name fits at 320px with a 32px root font. Failure of both exterior SVG requests leaves the Library keyboard action and Back focus available. | Existing 390/1280 layout, accessibility and ambience cases, expanded-text and blocked-art cases. |
| State and routing | The scene and picker use the same landmark symbol and actual stage. Treasury's third stage still follows Finance budget weeks, and the Finance lock hides budget data. Clinic/Gym locked art keeps the same real routes and reveals no measurements. Newly founded habit art, check-in marks, locked/empty lots, and the existing Reading Hall route remain available. | Unit and Town browser suites, including Treasury, habit and Clinic journeys. |

### Visual comparison

Captured production builds with `node /tmp/fixup-03-capture.cjs audit base after` and synthetic `town` and `town-empty`. The audit and base roots are the existing audited production build and the prior FIXUP-02 build. `/tmp/fixup-03-reviewed` contains overview and framed Culture at 390×844 and 1280×800 in light and night, the after arrival screens, and the Reading Hall comparison. Town Playwright attaches the framed view at both widths and the 320px focus view. `node /tmp/fixup-03-extra.cjs after` captures the night Garden and enlarged names separately. The daylight and night colors come from the exterior palette with preserved appearance state, including warm window light and the same silhouettes. Capture review is complete. Independent owner visual review remains pending.

### Scene budget

A matched 2× zoom at 1280×800 measured 54 steady pointer moves, and 36 real touch releases alternated seeded habit inspections. `node /tmp/fixup-03-bench.cjs base after` measures synchronous event and layout work, animation frame cadence, long tasks, and inspector publication separately. Transfer figures come from actual SVG response bodies, and measured frame cadence is approximately 60 Hz. The separate gzip measurement uses `gzip -nc` on the emitted Town route chunk.

| Measure | FIXUP-02 base | Coastal map |
| --- | ---: | ---: |
| Initial Town SVG requests | 14 | 2 |
| Initial Town SVG response body bytes | 71,545 | 23,357 |
| Gzipped Town route chunk | 23,480 bytes | 24,501 bytes |
| Steady pan handler and layout p95 | 0.9 ms | 0.6 ms |
| Pointer-up selection handler p95 | 10.2 ms | 6.5 ms |
| Confirmed inspector DOM update p95, including the existing URL update | 18.9 ms | 18.8 ms |
| Steady pan tasks above 50 ms | 0 | 0 |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner and disposition | Proof |
| --- | --- | --- | --- |
| Six disconnected `.plate` blocks and `exteriorPlates()` | `TownExteriorComponent` | One authored coastal SVG in the existing y-down scene. Districts keep their view controls and frame authored building positions. | Overview, district and reduced-motion journey. |
| Permanent clipped captions and image-box hit reconstruction | `TownExteriorComponent` | Framed labels and a focused/selected name replace the clip. Native visible-painted SVG bounds and layer order supply picks in the existing pointer path. The camera and 8px drag threshold stay as shared scene helpers. | Three distinct paint cases with real touch, pan/zoom, and no action on cancel. Reading Hall still uses its existing rectangle helpers. |
| Five old front-facing exterior SVGs and separate icons in the map/picker | Map and building picker | `landmarks.svg` supplies both views. `lotFace` still chooses from real stage and availability inputs. World, the Hub and the habit dialog retain their root Town sprites through their existing paths. | Exact picker artwork stage tests, room navigation, and source search for the old five `/town/exterior/*` paths. |

This is a presentation replacement with original artwork and a corrected selection boundary. The full replacement adds 586 and removes 182 production lines, including 322 authored artwork lines and five removed flat art files. Tests add 178 and remove 66 lines. Town guidance replaces one line. The exterior has one camera, one action handler for native paint picks, and one authoritative stage selection. The UI changes add one ephemeral focus signal, with clearing on owner change. The route, URL inspector, write owners, dates, check-in effects, entitlements and persisted records stay independent of artwork. The compact habit and archive labels still ellipsize in the list. Their full names remain available to keyboard users and on map selection/focus.

## Verification

| Command | Result |
| --- | --- |
| `PATH="$PWD/.venv/bin:$PATH" make test-fast` | PASS. Planning and path checks, 135 Python tests and 21 Node tests. |
| `make lint-web` and `make typecheck-web` | PASS. Existing lint findings match their baselines and seven TypeScript projects compile. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 716 tests, 77.59% statement coverage. |
| `make build-frontends` | PASS. Production bundle and release manifest. Existing initial bundle advisory remains 729.29 kB against its 650 kB warning threshold. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 242 Town, Pixels, Health and World browser tests. |
| `npx playwright test --project=suite` | PASS. 61 suite browser tests. |

Node 24, the linked repository venv and local Chromium 157 run these checks. The first full run exposed retired asset assertions in Town and a changed compact habit-name rule. The asset checks now assert the same real stages and symbols, and the list keeps its compact name rule. The focused map still shows the whole name. Two early fixture boots in that run logged Chromium `ERR_NETWORK_CHANGED`. A subsequent run had an intermittent keyboard focus miss in the existing workout sound check. The final unchanged full rerun passes those cases and all 242 browser tests.

## Handoff

- Final local verification precedes the implementation PR. GitHub closes only #581 through the PR, and the [roadmap](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) records merge and CI proof.
- Independent owner visual feedback and production deployment remain separate.
