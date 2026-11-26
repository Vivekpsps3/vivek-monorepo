# FIXUP-01 — Health destinations and Quick add

- Leaf [#579](https://github.com/Vivekpsps3/vivek-monorepo/issues/579) and tracking parents [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578) and [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304).
- Sole implementer on `agent/fixup-01` in `/tmp/vivek-fixup-01`. [Issue claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/579#issuecomment-7196117666)
- Fresh main `6f3858fdd5b1ea857c0eb9564f975e1d6a536fee`. Implementation `0d766e51bfd9f3ff4bd0e973cdd77766850f04a5`.
- NAV-01 `35c9f241`, NAV-03 `18c8553f`, HEAL-01 `234d4a61`, FIT-03 `e8ff90ea`, and HEAL-05 `e2f1d28e` are ancestors. Current main supplies direct private routes, the compact Hub, Health editors, entered sets with stable workout drafts, and lock/unlock projection cleanup. The issue and PR list showed no competing claim or overlapping PR.

## Acceptance

| Row | Executed proof | Result |
| --- | --- | --- |
| Baseline | Built the audited revision `27c99dc2` and opened the production UI in Chromium with a synthetic owner at 390×844. Hub rendered Health as Unavailable, the switcher had no Health group, and Quick add offered three destinations. Direct Clinic and Gym visits loaded normally. | Reproduced |
| FIXUP-01-A1 | The Hub Health shortcut opens Clinic. Pin moves it to the first position, reload retains it, and Reset restores Holdings first. Travel reaches Clinic or Gym directly from the switcher. Both links fit in the initial viewport and measure at least 44px high. The heading gains focus, the switcher identifies Health and the active room, and Escape and Back work. | PASS at 390×844 and 1280×800 in light and night, with touch, keyboard and reduced motion |
| FIXUP-01-A2 | From a filtered Hub agenda, Quick add starts the existing Add weight editor. The locked room has no plaintext or editor. Reloading the room and unlock page retains intent. Unlock focuses the date. Cancel returns to the exact Hub query and heading focus. A simulated write failure retains the weight, and retry saves one record and returns. A direct Health URL with an action query opens the room only. | PASS with touch at 390×844 dark and keyboard at 1280×800 light |
| FIXUP-01-A2 | From Hub at 390×844, the workout action passes through the real first-vault setup flow into Add session. Saving one entered set as a draft returns to Hub. After a lock, the Gym preview has no draft text or editor input. At 1280×800, Quick add and unlock reopen the saved session, and Escape returns to Hub with the same encrypted draft and revision. | PASS with touch setup and keyboard resumption |
| Tablet transition | Switcher and Search have separate hit targets at 641, 768, 840, 841 and 1280px with text enlarged to 110%. The compact switcher shows both rooms, Escape restores focus, and Search opens with keyboard focus. The wide header lists all seven apps. | PASS |
| Text enlargement | The workout shortcut and Health room links are in the viewport at 320px and 200% text. Escape restores Quick add focus. Keyboard opens Gym with heading focus and the page fits horizontally. | PASS |

The audited screenshots are in `/tmp/vivek-fixup-01-baseline/playwright-report/town`.
The changed app captures are attached to the Health and shell test reports
in `/tmp/vivek-fixup-01/playwright-report`. The stress fixture enlarges the actual
root font size. Before the menu repair, the workout option occupied 62% of the
viewport. After repair it fits. A post-open tablet measurement found that
adding the Health overview link changed a 28px gap at 768px into a 32px
overlap with Search. CI then exposed a 2.31px overlap when its fonts widened
the overview at the desktop edge. The navigation bar now keeps its intrinsic
flex space. The compact breakpoint and all seven wide links remain available.
Independent visual review remains pending.

## Deletion and compatibility

| Candidate | Disposition and owner | Proof |
| --- | --- | --- |
| Health unavailable tile and separate pinnable filter | Hub uses the same routed tile, ID allowlist and owner-scoped pins for all seven shortcuts. Deleted unavailable markup and styling. | Real Hub pin, reload and reset |
| Competing active-app calculation for the desktop overview | The overview and switcher share the shell's existing app calculation, with exact room matches before prefix fallback. Town remains the app for other Town routes. | Clinic, Gym, Travel, and existing suite navigation |
| Legacy Finance setup request and browser-test URL rewrite | The Finance vault service uses the canonical `/api/vault/setup` POST. Its unit test asserts the real request, and the existing Town budget journey no longer rewrites the URL. | First-vault browser setup and existing budget journey exercise the backend directly |
| Menu placement that only adjusted vertical position | The same open-time measurement bounds the existing panel horizontally. Existing menu ownership, native links, placement preference, focus return and reflow survive. | 320px text stress and existing Finance, Travel, and Hub menu journeys |

Against the base the feature changes 95 added and 44 deleted physical production
lines. Tests add 225 and remove eleven, and guidance adds four and removes five.
No files moved. New lines carry validated owner-bound history through unlock and
bound the menu. Clinic and Gym use the existing Health store, entry and workout
editors, encrypted record formats, draft handling and revision rules.
The Health route plus a boolean intent and the validated Hub source are the
only navigation state. No record value or draft is stored in navigation state.
A new shortcut for an existing Health editor would change the Hub's menu and
the Health room's existing dispatch, while the vault and store stay shared.

## Verification

Commands use Node 24.22.2, the repository Python environment, and installed
Chromium. The production build's existing initial-bundle warning remains
731.05 kB against the 650 kB warning threshold. The release manifest hash is
`71ce34cfb284fa0ef68c439313b46330bea45453aefcb6cb1d3f3509dd032e29`.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS. Path, planning, ownership and discovery checks, 135 Python tests and 21 Node tests. |
| `make lint-web` and `make typecheck-web` | PASS. Lint matches its existing baselines and seven TypeScript projects compile. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 719 tests and 77.87% statement coverage. |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 553 tests and 65.22% statement coverage. |
| `make build-frontends` | PASS. Production bundle and release manifest. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 259 Town, Health, World and Pixels browser cases. |
| `npx playwright test --project=suite` | PASS. 75 cross-app browser cases. |
| `make e2e` | PASS. 297 Finance browser cases and five existing skips. |
| `npx playwright test --config apps/media/e2e/playwright.config.ts` | PASS. 197 Media browser cases. |
| `npx playwright test` from `apps/travel/e2e` | PASS. 210 Travel browser cases. |
| `node --test apps/travel/backend/static/tests/*.test.mjs` | PASS. 94 Travel runtime tests. |

The initial full Town run passed 258 cases and failed its exact pin-order
assertion, which still expected six links. The final assertion checks Health
in both orders. The first tablet revision run also found that a synthetic
workout date jump could trigger real idle-lock logic before the edit. That
case now uses the supported off preference in its isolated synthetic fixture
and keeps all date, edit, and deletion assertions. The dedicated auto-lock
journeys still run. The audited reproduction, three Quick add cases, tablet
transition, and enlarged-text case also ran as focused checks.

## Handoff

- Local gates passed before opening PR #633 and were rerun for the tablet
  sizing correction. GitHub closes only #579 through [PR #633](https://github.com/Vivekpsps3/vivek-monorepo/pull/633). Record the green head, verified merge,
  and closure in a scoped [roadmap #134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) comment.
