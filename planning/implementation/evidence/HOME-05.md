# HOME-05 — implementation evidence

- Leaf [#468](https://github.com/Vivekpsps3/vivek-monorepo/issues/468) and parent scopes [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304), [#312](https://github.com/Vivekpsps3/vivek-monorepo/issues/312).
- Sole issue worker on `agent/home-05` in `/tmp/vivek-home-05`. Base `7d4e662fb6e28167119755885bace8373ca92fb4`. Tested product `b15c25f6ec6f7b38793bacef162895380d198949`.
- Current main contained the furnished rooms, bounded layout API and HOME-04 editor from [#623](https://github.com/Vivekpsps3/vivek-monorepo/pull/623). No overlapping live claims or PRs were present. [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/468#issuecomment-7143055076).

## Acceptance

| Row | Observed outcome and proof | Result |
| --- | --- | --- |
| HOME-05-A1 | The real browser test edits the desk at revision 0 while a second client saves the bookshelf at that revision. The stale write receives 409 and leaves revision 1 intact. A failed reload keeps the draft. Retry loads the other client's room. Reapply previews the desk edit and keeps the saved bookshelf edit. Both persist only after an explicit Save at revision 1. The component conflict test also verifies that Discard keeps the saved version and the unrelated private desk note. | PASS |
| HOME-05-A2 | The first Undo gets 503 and focuses Undo while the confirmed revision and items stay intact. Retry writes the complete prior layout with the current expected revision. Reset initially changes only the scene preview. A failed confirmation retains the draft and focuses Keep editing. Escape restores the draft scene and focuses Reset room. Successful Reset restores starters and focuses the previously selected desk, or the room's Decorate action when that object is absent. | PASS |
| HOME-05-LIFE | The component test changes owner while a write is held and verifies that no stale draft, note, or revision publishes. The Playwright cross-tab lock test delivers a held write after invalidation and verifies that the new placement, note and stale revision stay absent. The post-conflict GET shares the owner, room and generation checks and returns useful retry state on ordinary failure. | PASS |
| HOME-05-VIEW | The actual recovery path ran at 390×844 with touch and 1280×800 with keyboard, in light and night with reduced motion. Tested confirmation and conflict controls reach 44×44px. Axe found no serious or critical violations in the reset panel, and the browser checks include no horizontal overflow, visible focus return and zero animations in reduced motion. Playwright retained eight conflict/reset captures. | PASS |
| PLACE-08-LAYOUT | The existing room and exterior owner, 12×12 geometry, bounded exterior anchor set and 16KiB request cap continue through the same layout API. The browser exercised stale, successful and failed revision writes in order and reloaded confirmed Reset from the API. Server tests check stored geometry, foreign owner, CSRF, concurrent create/update and size caps. The new recovery flag contains no hidden record content. | PASS |
| PLACE-08-RECOVER | Model and HTTP tests seed a malformed record with synthetic markers. Reads flag it without exposing the markers and valid-looking PUTs leave the raw record and revision intact. Unknown placements retain their exact public fields during another eligible edit and the API blocks attempts to remove or alter them. The browser checks the read-only starter fallback and usable desk action. | PASS |

Undo retains the one prior confirmation for the current room visit and writes through the ordinary revisioned endpoint. It is cleared on lock, owner change, or departure. The conflict preview uses the latest saved room. Explicit reapply uses the local version of edited pieces and preserves other changes. Confirmed Reset preserves milestone ornaments and unavailable pieces, and blocks conflicts with their occupied positions. Manual art review by the owner remains pending.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Disposition |
| --- | --- | --- | --- |
| Discard-and-reload as the only conflict path | Home room editor and component fixture | Existing Home editor and layout read/write transport | Replaced with one recovery panel that can retry the load, preview a reapply, or discard. The draft stays local through recoverable failures. |
| Silent filtering of stored item records before a replacement write | Owner-scoped Home layout GET and PUT | Single layout record, public view and compare-and-swap write | Replaced with a protected fallback when the raw record cannot round-trip. Valid unknown records survive writes unchanged and unknown fields stay in the stored record. |

- Feature and safety repair. The comparison base is `7d4e662f`. The replaced frontend path and server projection are in the diff. Production added 283 and removed 65 physical lines, with no moved files. Tests added 197 and removed 5 lines. Guidance changed one line. No generated assets were committed.
- The revisioned endpoint and database row remain the only persistence owners. The Home editor keeps one draft with a temporary conflict base or reset preview, plus the prior confirmed snapshot used for Undo. The new public response field appears only when recovery is required. Supported callers, entitlement checks, focus and private-note clearing remain.
- One latest layout GET follows a conflict and can be retried. Reapply sends no write. The next Save, Undo and Confirm reset each use one PUT. No new blocking initialization work, animation, asset requests, route, migration or history table.
- The Home lazy chunk measured 58,023 raw bytes and 16,695 gzip bytes. The initial web bundle retains its existing 728.95 kB advisory. The four-room browse and edit presentation follows in [FIXUP-30 #618](https://github.com/Vivekpsps3/vivek-monorepo/issues/618).

## Verification

- `PATH="$PWD/.venv/bin:$PATH" make test-fast` — PASS. Planning and boundary checks, 135 Python tests and 21 Node tests.
- `make lint-web`, `make typecheck-web`, `make lint-python` and `make typecheck-python` — PASS. Existing baselines match.
- `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` with the installed Chromium 156 via `CHROME_BIN` — PASS. 719 tests and 77.79% statement coverage.
- `./scripts/coverage-gate.sh server` — PASS. 484 tests, one existing skip, 81.74% coverage and Town read p50 of 155.60ms.
- `make build-frontends` — PASS, with the existing initial bundle advisory.
- `npx playwright test --config apps/web/e2e/playwright.config.ts` — PASS. 235 tests, including all 18 Home cases.
- `npx playwright test --project=suite` — PASS. 61 tests.

## Handoff

- The PR closes only #468. The scoped roadmap status follows verified merge.
- Next leaf in the owner-requested sequence is [FIXUP-30 #618](https://github.com/Vivekpsps3/vivek-monorepo/issues/618).
