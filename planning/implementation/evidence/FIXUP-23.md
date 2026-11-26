# FIXUP-23 — Memory Shelves keyboard continuity

- Leaf [#611](https://github.com/Vivekpsps3/vivek-monorepo/issues/611) and tracking parents [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578) and [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304).
- Sole implementer on `agent/fixup-23` in `/tmp/vivek-fixup-23`. [Issue claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/611#issuecomment-7185454924)
- Fresh main base `112b231997668a624c9ad806e0c44025f13aa115`. Tested product and tests `d8f1bc90e6ab1c1466830f2f1dc7813e3e1092ef`.
- GAME-10 merge `df970e356ce8be8198b5bd3fa5543d359b2943d2` is an ancestor of the base. Current source still owns the same seeded six pairs, tab-scoped saved game, score and reward boundary. The live leaf and open PR list showed no competing claim or overlapping work.

## Acceptance

| Row | Executed proof | Result |
| --- | --- | --- |
| Baseline | The audited Memory Shelves source paths match the fresh main base. The synthetic Chromium account opened shelf 1 with Enter, reached shelf 12 by arrow keys, then matched the Bell pair. Shelf 12 was disabled with `tabindex=0`. Focus dropped to `BODY`, ArrowRight did nothing and zero eligible shelves were in the tab order. | Reproduced with `/tmp/fixup-23-audit.spec.ts` as a temporary case in the existing Town browser spec. |
| FIXUP-23-A1 | At 390×844 and 1280×800 in both palettes, Tab reaches Play and enters the board's sole tab stop. Every pair completes with only arrows, Enter and Space. Horizontal navigation skips matched shelves. Every interim match leaves one enabled tab stop in the viewport with visible keyboard focus and an announced match count. The final match focuses Restart, which Enter activates on the same route. | PASS across four real Chromium journeys. |
| FIXUP-23-A2 | The same viewport and palette matrix exercises pause, a real reload after the Bell pair, and Resume. Restoring a paused board preserves the match and move count. Resume focuses Shelf 2 because Shelf 1 was matched. Reentering an active round restores its face-up shelf and computes an eligible tab stop from the loaded board. | PASS with phone touch and desktop keyboard. |
| FIXUP-23-A2 | All six pairs still finish in six moves on seed 10. Restart restores the same deal. Quit retains the previous score. Browser role/name assertions cover group instructions, matched disabled shelves, live progress and the focused final action. The browser observes zero Town, Media, Pixels, Health or Stamp writes. Existing outage, sound, reduced-motion, and sign-out journeys remain covered. | PASS in the focused browser matrix and Web Karma. |
| Enlarged text | At 320px with a 32px root font, the whole matched symbol fits and a keyboard move scrolls its focus into view. The single-column board moves one row with ArrowDown. Resizing to 390px with the same text size fits two columns, and ArrowDown moves to the correct lower shelf. | PASS in real Chromium. |

The focused production browser report attaches synthetic captures for post-match
focus and the Restart action at both widths and palettes. Reviewed copies are in
`/tmp/fixup-23-reviewed`. Compare `before-match-lost-focus-1280-light.png` with
`after-memory-match-focus-1280-light.png`. The enlarged-text capture is
`after-memory-enlarged-text.png`. The early four-column and two-column attempts
clipped Lantern at 200% text. The final grid fits columns to the rendered text
size and keyboard navigation reads that grid. Independent owner visual review is pending.

## Deletion and compatibility

| Previous path | Disposition | Proof |
| --- | --- | --- |
| `shelfTab()` could assign a matched, disabled shelf the active tab stop. Arrow navigation could also target a matched shelf. | One computed active tab stop covers new, resumed and loaded rounds. Disabled shelves have no `tabindex`, and arrows skip matched shelves. | Keyboard-only four-way matrix and loaded-board journeys. |
| Visible `Seed 10.` and the `data-seed` debug attribute appeared on the live game. The keyboard hints sat after its controls. | The rendered seed and its component property are removed. The deal, saved game and tests retain the seed. Instructions describe the shelf group before play. | The same symbol order and move count survive reload, restart and both input paths. |

Compared with the fresh main base, production adds 50 and removes 34 physical
lines (net 16). Tests add 124 and remove 11. Town guidance replaces two lines.
The added lines cover focus recovery, accessible progress and text enlargement.
Generated files and screenshots stay in the local test artifacts. `/town/memory` and the owner-bound
`town.memory-shelves.v1` format retain the same state owners. Game rules, scores,
shortcuts and supported corrupt-storage and sign-out behavior still run through
existing owners. `git diff --check` passed, and source review found no live seed
markup or `shelfTab()` consumer.

## Verification

Local checks use Node 24.22.2, the repository Python environment and installed
Chromium. The existing initial bundle warning remains 730.75 kB against 650 kB.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS. Documentation, queue, ownership and discovery checks, 135 Python tests and 21 Node tests. |
| `make lint-web` and `make typecheck-web` | PASS. Lint findings match their baselines and all seven TypeScript projects compile. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 719 tests and 77.88% statement coverage. |
| `make build-frontends` | PASS. Bundle and release manifest `bfc0eeae5ea179dcde63cbfcd9fe4747f22eb95a7b68e46cb721e3c26dc4520d`. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts town-memory.spec.ts` | PASS. 13 focused production Chromium cases. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 256 Town, Health, Pixels and World browser cases. |
| `npx playwright test --project=suite` | PASS. 69 cross-app browser cases. |

The first chained suite process ended with SIGTERM after 55 successful cases.
The unchanged standalone command completed all 69 cases.

## Handoff

- The local gates passed before PR creation. GitHub closes #611 through its PR.
- Record the verified merge, issue closure and CI in a scoped [roadmap #134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) comment.
- Independent owner visual review and production deployment are pending.
