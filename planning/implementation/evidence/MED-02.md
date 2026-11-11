# MED-02 — implementation evidence

- Leaf issue and parent(s): [#236](https://github.com/Vivekpsps3/vivek-monorepo/issues/236); parent [#85](https://github.com/Vivekpsps3/vivek-monorepo/issues/85) stays open
- Agent/context, branch/worktree: Cursor Grok, `agent/med-02`, `/tmp/vivek-med-02`
- Base main SHA, current tested SHA: base `3954d1f27aa8ad0766eac9a7e9667f68d3c76571`. Application files were tested on that base. Implementation commit `318ea4906e3713269da86d74c52404089e39b265`. `origin/main` later moved to `1b4f35a` (FIN-01, finance-only); that commit was not in the local Media run.
- Fresh-main/prerequisite/active-PR checks: MED-01 is on this base (saved reads do not repair). Open PR at claim time was #322 (`agent/fin-01`), which does not use `media-detail-form`. No other open PR claimed the detail form. Claim: https://github.com/Vivekpsps3/vivek-monorepo/issues/236#issuecomment-6788682891

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| TAG1 | Unicode spaces, case-insensitive duplicate keeping the first spelling, 40 and 41 code points, 20 and 21 tags, Enter, empty Backspace, remove-button focus, save, and reload. The pure model covers trim, code points, duplicates, and the cap. The browser edits the mounted chips. | PASS | `apps/media/backend/static/tests/tag-model.test.mjs`; `apps/media/e2e/tags.spec.ts` (`keyboard tag editing normalizes, caps, saves and reloads`, `Backspace and remove move focus to the input or the next tag`) |
| TAG2 | Unsaved note and rating, Enter in the tag field, then a failed Save. Enter sends no POST and no PATCH. The one later PATCH body is the note, rating, review base, and the committed tag. The chip, the uncommitted tag text, the note, and the rating remain, including after reload. The server row is unchanged. | PASS | `apps/media/e2e/tags.spec.ts` (`Enter does not submit notes or ratings and a failed save keeps the draft`) |

A draft written before tags, with no `tags` field, still restores the note and rating and does not invent chips: `a draft from before tags still restores the note`.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Tag parsing and persistence beside `tag-model` and the entry draft/PATCH | No detail editor and no second client parser existed on `3954d1f`. Library filters parse at most 10 URL tags. `patch_entry` still strips and stores the list. | `tag-model.mjs` for editor rules; `DetailComponent.save` PATCH for the one write; `MediaDrafts` for recovery | No duplicate client handler to delete. The new editor calls `addTag`, `removeTag`, and `normaliseTags`. Draft reads call `normaliseTags`. Tags are sent only when the list changed. Enter does not save. | TAG1 save asserts one PATCH of the normalised tags and omits review and rating. TAG2 asserts zero requests on Enter and one PATCH on Save. `rg` of `addTag` / `normaliseTags` / `removeTag` in `apps/media` finds the model, detail, drafts, and the model test. |

- Candidate class and protected counterexamples: duplicate live policy that was not present as a second editor on this base. Library URL filters, server tag storage, membership migration SQL, and catalog versus personal-entry payloads stay. `records.py`, `journal.py`, `membership.py`, library, Add, and popular discovery were not edited.
- Comparison base SHA and full replacement closure: `3954d1f27aa8ad0766eac9a7e9667f68d3c76571`. Closure is `detail.component.ts`, `detail.component.html`, `drafts.service.ts`, `media.css`, `docs/MEDIA.md`, and `apps/media/e2e/tags.spec.ts`.
- Production added/deleted/moved; comments/blank-only churn separately: production insertions 203, deletions 4 (`git diff --numstat`). Of the added lines, 4 are comments and 2 are blank. Net production code is about +197. No move.
- Independent equivalent implementations before/after: before, one normaliser and no detail editor. After, one normaliser, one chip editor, one entry PATCH. Library filter parsing remains a separate 10-tag query policy.
- State/cache owners and public entry points before/after: personal fields still live on the detail form and in the per-tab `media-item-draft` record. Tags and uncommitted tag text joined that same record. There is no tag-only store.
- Remaining old symbol/path search, including config and discovery: no retired symbol. `tag-model.mjs` is the editor normaliser. `patch_entry` remains the server write.
- Follow-up change: a later tag rule change edits `tag-model.mjs` and the detail chip control. Draft recovery already calls `normaliseTags`.
- Tests/docs/generated changes separately: `tags.spec.ts` is 197 new lines. `docs/MEDIA.md` replaces one sentence. No generated bundle is committed.
- Net production delta and specific reviewed safety/compatibility exception if positive: about +197 production lines. This is the feature that mounts the unused model. The extra code is the chip control, Enter isolation from form submit, focus after remove, and draft fields so a failed save keeps the note, rating, chips, and uncommitted text. It is not a second tagging policy.
- No behavior/data/meaningful assertion silently removed: existing detail draft, rating, and save tests still pass. Pre-tag drafts still restore.

## Verification

Local execution in `/tmp/vivek-med-02`. CI, merge, and deployment were not run for this record.

| Command | Result |
| --- | --- |
| `node --test apps/media/backend/static/tests/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs` | PASS. 53 passed. |
| `make test-fast` | PASS. |
| `make lint-web` | PASS. ESLint baselines matched. Engine purity test passed. |
| `make typecheck-web` | PASS. |
| `make lint-python` | PASS. 211 files formatted. Ruff 101 findings match the baseline. Suppressions match. |
| `make typecheck-python` | PASS. mypy 87 findings match the baseline. |
| `CHROME_BIN=$HOME/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 654 of 654 SUCCESS. Statements 82.47% (5102/6186). |
| `./scripts/coverage-gate.sh media` | PASS. 204 passed. Total coverage 84.15% (floor 70.60%). Floor file not edited. The gate printed a rise notice from 71.60%; that rise is not from this leaf's Python, and the floor was not changed. |
| `npm run build && node scripts/write-release-manifest.mjs` | PASS. |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=$CHROME_BIN npx playwright test --config apps/media/e2e/playwright.config.ts --workers=1` | PASS. 81 passed (3.1m), including `tags.spec.ts`. |

Four-worker runs on this machine also passed every MED-02 test. One of those runs failed only `library-filters.spec.ts` "Back drops a pending filter", and an overloaded run added unrelated timeouts. The same library failure reproduced after stashing this leaf and rebuilding unmodified `3954d1f`. It also failed one of three isolated reruns. It is not a tag-editor regression. The sequential 81-pass run above is the local gate result.

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/332 (`Closes #236`). Parent #85 is referenced and not closed.
- Roadmap #134 append-only status-note URL: https://github.com/Vivekpsps3/vivek-monorepo/issues/134#issuecomment-6789418912. The issue body was not edited.
- Merged/activation status (actual evidence, not assumption): not merged, not deployed. CI was not finished when this note was written.
- Remaining external prerequisites or approved scope decisions: none for this leaf. Parent #85 stays open.
- Next actor: watch CI, then squash-merge when Backend, Frontend, Unified Site Release, and Playwright are green.
