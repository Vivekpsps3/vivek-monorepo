# FIXUP-32 — Use one set of actionable Clinic lab and checkup rows

- Leaf issue and parent(s): [#620](https://github.com/Vivekpsps3/vivek-monorepo/issues/620) under [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578) and [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304).
- Agent/context, branch/worktree: branch `agent/fixup-32`, worktree `/tmp/vivek-fixup-32`. [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/620#issuecomment-7229657118). No subagents. The shared checkout was not edited. Harbor Rhythm, the workout dialog, Media, Travel, Finance, server, `queue.json`, the completion registry, and CI were not edited.
- Base main SHA `2bd41147c144bb95d3611f008fc289929ff24c00`. Tested product SHA `f8027e295ec0a3507483080c52cac163928a8052`.
- Fresh-main/prerequisite/active-PR checks: fetched `origin/main` before the worktree and again before this record. That SHA is still `origin/main`. ROOM-14 (#464, PR #597, merge `26dc5f33`, product `88b6d67b`) and HEAL-05 (#436, PR #568, merge `e2f1d28e`, product `285d20c0`) are ancestors. Lab folders, the checkup book, range words, and lock clearing are present on this base. On that main, a 390px Clinic archive still showed the same Ω-marker readings in the chart text, a range table, and a separate action list, and a checkup note repeated in Latest, chart text, the table, and the actions. FIXUP-29 set logging stays. GAME-11 and FIXUP-31 were left on their own branches.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| FIXUP-32-A1 | Synthetic vault. Mixed lab and checkup archive at 1280×800 and 390×844, light and night, reduced motion, touch on 390. Select Ω-other, read measured date, value 4, unit u, and “no range”, and edit that record from the same row. Return to all folders and open Ω-marker: below 9 and in-range 15 stay ordered, the trend figure is one polyline whose text is “Trend”, and Edit sits on the below row with the chart above it and less than 520px away. Checkup book shows each synthetic note once beside its measured date. Paging still reveals older weight rows. At 320×844 with 200% text the checkup Edit stays a 44px target and the room does not scroll sideways. | PASS | `apps/web/e2e/health-entry.spec.ts` “opens a no-range lab folder and an older checkup in the clinic archive” and “pages weight history…”, inside `npx playwright test --config apps/web/e2e/playwright.config.ts` (314 passed). Room specs assert one range phrase, one visit note, and the edit control inside the row. |
| FIXUP-32-A2 | Same archive: an invalid high-before-low range keeps the lab dialog open. A failed upsert leaves value 4 and focuses the same Edit control; the unsent name is absent from the room. Distinct below, in, above, and no-range rows keep stored units. Reload keeps client id `hlt_SyntheticLabEntryABCDE` on value 9. Lock Finance clears checkup notes and marker text; unlock restores the two visit notes once, newest first. Sign-out clears the names. Editing Ω-other to 5 does not move the Ω-marker polyline. Town requests do not contain the synthetic names. | PASS | Same Playwright file: “saves each lab range and a checkup…” at 1280 light and 390 dark, plus the archive lock/unlock path. `health-room.component.spec.ts` covers the failed save, the revision conflict, and chart parity. |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Lab latest sentence, sparkline point list, range table, and a second Edit/Delete list | Clinic lab folder rendered the same reading four times | One trend figure (caption “Trend”, aria-hidden SVG from the existing sparkline geometry) and one wrapping row per result: measured, value, unit, range, Latest on the newest row only, Edit and Delete | Removed the parallel lab action list and the sparkline text list for labs. `app-health-sparkline` still serves vitals. | Room text has no `Lab ·` sentence. “below range” and the visit note each appear once. Edit `aria-label` still names the full record. |
| Checkup latest sentence, note list, visit table, and a second action list | The checkup book repeated the note in Latest, chart text, the table, and the actions | One row per visit: measured date, note, Latest on the newest row, Edit and Delete. The measured-date fact stays. | Removed the checkup sparkline and the parallel checkup action list. | No `data-health-sparkline="checkup"`. Book text has no `Checkup ·` sentence. |

- Candidate class and protected counterexamples: replacement of duplicate lab and checkup displays. Schema v2, stored units, range meaning, client ids, revisions, vault lock clearing, canonical lab and checkup editors, Gym set logging, and existing `/town/clinic` routes stay.
- Comparison base SHA `2bd41147c144bb95d3611f008fc289929ff24c00`. Replacement closure is the health room template, component, and stylesheet. No new production file. `health-history.ts` and `health-sparkline` were not edited.
- Production added/deleted/moved: template +61/−50, stylesheet +52/−8, component +5/−0. Net +60. The added lines are the single row, the inline trend figure, and `rowLabel` for the existing accessible name. Comments were not stripped to shrink the diff.
- Independent equivalent implementations before/after: one Clinic room. Vitals still use the sparkline component and `entryRow`. Labs and checkups no longer do.
- State/cache owners and public entry points before/after: `/town/clinic` and the lab and checkup dialogs stay. Focus still uses `health-entry-${clientId}` and returns to the opener button. Show more still reveals the next page.
- Remaining old symbol/path search: `seriesId="lab"` and `seriesId="checkup"` are gone. `archive-table` selectors are gone; wall tables stay. `queue.json`, the completion registry, and CI were not edited.
- Follow-up change: none in this leaf.
- Tests/docs/generated changes separately: tests add 149 lines and delete 49 (`health-entry.spec.ts` +101/−30, `health-room.component.spec.ts` +48/−19). This evidence file is the documentation change. No bundle is committed. Fixtures stay synthetic (Ω-marker, Ω-other, Ω-held, “Synthetic visit note”).
- Net production delta and specific reviewed safety/compatibility exception if positive: +60 production lines. The stylesheet lets the one row wrap at 390px and at 320px with 200% text. Domain values were not rewritten to shrink the file.
- No behavior/data/meaningful assertion silently removed: range words, units, record identity, failed save, revision conflict, lock clearing, paging, and Gym set logging stay asserted. The lab seed id in the browser journey is `hlt_SyntheticLabEntryABCDE` so the vault harness keeps that id (the previous 21-character id was rewritten and could not be selected).

## Verification

Commands ran from `/tmp/vivek-fixup-32` on the tree committed as `f8027e295ec0a3507483080c52cac163928a8052`, before this evidence file. `make test-fast` and Playwright used `PATH="/tmp/vivek-fixup-32/.venv/bin:$PATH"`. Karma used `CHROME_BIN=/tmp/chrome157/chrome-linux64/chrome`. Playwright used `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. `node_modules` and `.venv` are symlinks to the shared checkout and are not committed. Python lint, typecheck, and coverage gates were not run. The diff has no Python product file.

`python3 planning/implementation/plan.py launch FIXUP-32` printed `make test-fast`, `make lint-web`, `make typecheck-web`, `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI`, `make build-frontends`, `npx playwright test --config apps/web/e2e/playwright.config.ts`, and `npx playwright test --project=suite`.

The first full health-entry Playwright run failed because `hlt_SyntheticLabEntryABCD` is 21 characters and the harness stores another id. The assertion now uses a 22-character id. That journey was rerun, then the full Town and suite Playwright commands passed. No product code changed after the recorded Karma or build.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS. |
| `make lint-web` | PASS. |
| `make typecheck-web` | PASS. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 767 SUCCESS. Statements 78.05% (12736/16316), branches 66.09% (5775/8737), functions 80.25% (2780/3464), lines 83.35% (11094/13309). |
| `make build-frontends` | PASS. Pre-existing web bundle budget warning (732.71 kB vs 650 kB). Exit 0. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 314 passed (4.4m), including the clinic archive at 390 and 1280, light and night, and the lab-range save at 1280 light and 390 dark. |
| `npx playwright test --project=suite` | PASS. 75 passed (1.3m). |

## Handoff

- PR URL (leaf closure keyword only): recorded after the pull request opens. The body is only `Closes #620`.
- Roadmap #134 append-only status-note URL: recorded after merge.
- Merged/activation status (actual evidence, not assumption): not merged yet. No deployment.
- Remaining external prerequisites or approved scope decisions: none. The health-room stylesheet was edited with the template so the single row wraps. Harbor Rhythm files were not needed.
- Next actor: review and merge this leaf only. #277 remains open.
