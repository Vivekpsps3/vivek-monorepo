# MED-03 — implementation evidence

- Leaf issue and parent(s): [#237](https://github.com/Vivekpsps3/vivek-monorepo/issues/237); parent [#85](https://github.com/Vivekpsps3/vivek-monorepo/issues/85) stays open
- Agent/context, branch/worktree: implementer, `agent/med-03`, `/tmp/vivek-med-03`
- Base main SHA, current tested SHA: base `bc2d79ebabab7d2b719bcbff920a4f256dbeb9f6`. The commands below ran on that base plus the files in this commit, immediately before the commit. Karma used port 9981 in this worktree only; that line was reverted and is not in the commit.
- Fresh-main/prerequisite/active-PR checks: HEAD matched `origin/main` at the base above. MED-02 #236 is closed by squash `0c6e6bf3e2e3e4a244efd478fed21766ad81a442`. MED-10 #285 is closed by squash `1268f8d8a61b4b0116fc10eedc6739dfed1f8b78`. Both are ancestors of the base. The tag editor and the detail race fixes stayed in place. Claim: https://github.com/Vivekpsps3/vivek-monorepo/issues/237#issuecomment-6806636390

## Acceptance

Fixtures are synthetic journal rows created through the Media e2e API (integer items, one saved `7.5` item, one clear-half item). Accessible names are `0 out of 10` through `10 out of 10`. No live provider call. The rating model was already on this base and was not edited.

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| RATE1 | Open an item, Home selects 0, End selects 10, Clear rating sets null. Each save PATCH body is the exact integer or `null`. A saved 7.5 shows `Current rating: 7.5. Pick a whole number to change it.`, leaves 7 and 8 unchecked, and a note-only save omits `rating`. Reload still shows 7.5. Choosing 8 removes the note and PATCHes `rating: 8`. Clearing a different 7.5 PATCHes `null`, not a rounded number. The number input is absent. | PASS | `rating-model.test.mjs` (`ratingOptions has 11 options with out-of-10 labels`, `segmentValue accepts integers 0–10 only`, `halfNote only for non-integers in range`) inside the media node run (53 passed). `apps/media/e2e/rating.spec.ts` › `integer and null ratings save exactly and a saved half rating is not rounded` |
| RATE2 | With an unsaved note, ArrowRight moves 0 → 1 → 2 and keeps the radio focused. At 390px the 11 radios wrap to 2 rows; at 1280px they are 1 row. Light and dark both keep the radios inside the viewport, with no horizontal overflow and no serious or critical axe findings. Cancelling “Leave unsaved changes?” keeps radio 2, the note, and the session draft. The server rating and review stay null. | PASS | `apps/media/e2e/rating.spec.ts` › `arrow keys, width, theme, and cancelling leave keep the unsaved rating` |
| RATE1 failed save | A 500 PATCH of rating 9 leaves the radio checked, keeps the note, stores draft rating 9, and leaves the server rating null. | PASS | `apps/media/e2e/rating.spec.ts` › `a failed rating save keeps the unsaved note and the chosen integer` |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Item `input[name=rating]` (`type=number`, `min=0`, `max=10`, `step=0.5`, `[(ngModel)]="rating"`) at base `bc2d79e` | `detail.component.html`; e2e `phase0.spec.ts`, `bundle-m.spec.ts`, `tags.spec.ts`, `rating.spec.ts` filled that input | `rating-model.mjs` (`ratingOptions`, `segmentValue`, `halfNote`) plus one `ui-segmented` editor. `DetailComponent.save` still PATCHes `this.rating` only when it changed, with no rounding | Replaced the number input. Migrated the four e2e callers to exact `N out of 10` radios. No second client rounding function existed | `form.media-editor input[name=rating]` count is 0 in `rating.spec.ts`. Full Media Playwright 86 passed, including phase0, bundle-m, and tags |
| Season rating number input | Season disclosure `seasonRate` | Same control | Retained. It rates one season, not the item | Still `step="0.5"` under “Season rating (optional)”. Not part of this deletion |
| Server `rating_value` half-step acceptance | `apps/media/backend/services/validate.py` | Same function | Retained so a stored 7.5 is not migrated | Untouched. The note-only save omits `rating` and reload stays 7.5 |

- Candidate class and protected counterexamples: duplicate live policy. The number input was the live item editor; the rating model was already the integer/half policy and had no screen caller. Membership SQL, catalog versus personal entry, the tag editor, and detail race cancellation were not edited.
- Comparison base SHA and full replacement closure: `bc2d79ebabab7d2b719bcbff920a4f256dbeb9f6`. Rating closure is `detail.component.ts`, `detail.component.html`, `media.css` (rating rules only), `rating.spec.ts`, and the three e2e callers. `rating-model.mjs` and `rating-model.d.mts` are unchanged. `apps/web/src/app/search/search-dialog.component.ts` is a separate safety fix recorded below; it is not a rating implementation.
- Production added/deleted/moved; comments/blank-only churn separately: `git diff --numstat` against the base. Rating: `detail.component.html` +16/−10, `detail.component.ts` +23/−0 (one of those lines is the `ratingChoice` comment), `media.css` +41/−0 (one blank line). Net rating production +70, of which 1 comment and 1 blank. Search safety: `search-dialog.component.ts` +19/−2, net +17, no comment or blank. No moves. No generated bundle committed.
- Independent equivalent implementations before/after: item rating UI 2 (unused model plus the number input) → 1 (the segmented editor reads `segmentValue` and writes the exact number). `segmentValue` returns null for halves and does not round. Server half-step validation stays as the storage rule, not a second editor.
- State/cache owners and public entry points before/after: `this.rating` and `MediaDrafts` (`media-item-draft`) remain the only item-rating state. `chooseRating` and `clearRating` call `rememberDraft`. `PATCH /media/api/entries/{id}` is still the write. Search still binds vault listeners for the life of the root injector and now releases them when that injector is destroyed.
- Remaining old symbol/path search, including config and discovery: `input[name="rating"]` remains only as the assertion that the item control is gone. The season input has no `name="rating"`. `rating-model.mjs` is still the policy module.
- Follow-up change: an item-rating rule change edits `rating-model.mjs` and this editor. A season rating change still edits `seasonRate`. Search lock lifetime stays in `SEARCH_FINANCE`.
- Tests/docs/generated changes separately: `rating.spec.ts` +172/−13, `phase0.spec.ts` +1/−1, `bundle-m.spec.ts` +1/−1, `tags.spec.ts` +5/−5. This evidence file is the only doc.
- Net production delta and specific reviewed safety/compatibility exception if positive: rating net +70 because the screen had to mount the existing model and lay out 11 radios; the number input was only 10 lines. The model files added 0. The search +17 releases listeners the factory previously discarded. Base Frontend CI run [43094735011](https://github.com/Vivekpsps3/vivek-monorepo/actions/runs/43094735011) already failed `World production controller ownership` with `Expected 0 to be 1` at `world.component.spec.ts:521` because that binding kept the storage listener installed. Destroying the injector now unbinds it, and a late import does not bind a destroyed injector. A living app still has the listeners until shutdown.
- No behavior/data/meaningful assertion silently removed: half ratings still persist until an explicit choice. Draft leave/cancel, failed save, tag editing, and season ratings still behave as before. The old number-input fills in phase0, bundle-m, and tags now click the same integer the input used to set.

## Verification

Commands from `/tmp/vivek-med-03`. `PYTHON=/home/vivek/Deployments/vivek-monorepo/.venv/bin/python` (worktree `.venv` is a symlink; nothing was installed into it). `CHROME_BIN` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` were `$HOME/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. Karma port 9981 was set inside `config.set` for the web run and reverted before commit. The coverage reporter loaded.

| Command | Result |
| --- | --- |
| `python3 planning/implementation/plan.py launch MED-03` | printed the `media_front` commands below |
| `make test-fast` | PASS |
| `make lint-web` | PASS |
| `make typecheck-web` | PASS |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS, 710 SUCCESS. Statements 83.23% (5530/6644), branches 70.2% (2123/3024), functions 82.81% (1108/1338), lines 86.91% (4788/5509) |
| `node --test apps/media/backend/static/tests/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs` | PASS, 53 |
| `make build-frontends` | PASS (`ng build web --configuration production`, then `write-release-manifest.mjs`) |
| `npx playwright test --config apps/media/e2e/playwright.config.ts` | PASS, 86, including `rating.spec.ts` 3/3 |

Not run: Finance, site, and Travel Karma; Finance, Travel, and Town Playwright; Python coverage gates. This diff does not change those screens or any Python file. The search change is covered by the web Karma suite, which includes the World listener test that was red on the base. Deployment was not run.

## Handoff

- PR URL (leaf closure keyword only): not opened yet. The PR will use `Closes #237` only and will reference #85 without a closing keyword.
- Roadmap #134 append-only status-note URL: not posted yet.
- Merged/activation status: not merged. Local verification passed. CI is not recorded.
- Remaining external prerequisites or approved scope decisions: none. The search listener release is the safety fix that makes the already-failing web Karma gate pass; it does not change the rating scale.
- Next actor: open the pull request, append the #134 note, watch Backend, Frontend, Unified Site Release, and Playwright, then squash-merge and record the squash SHA on #237 and #134.

No unstated decision from the previous context is necessary to continue.
