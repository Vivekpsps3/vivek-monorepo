# MED-06 — implementation evidence

- Leaf issue and parent(s): [#240](https://github.com/Vivekpsps3/vivek-monorepo/issues/240); parent [#85](https://github.com/Vivekpsps3/vivek-monorepo/issues/85) stays open
- Agent/context, branch/worktree: implementer continuing the existing claim, `agent/med-06`, `/tmp/vivek-med-06`
- Base main SHA, current tested SHA: rebased onto `origin/main` `0022c5ef8065e08892b6eecdfa6450158ee69ef6`. Product commit `3ba6f31f84cb8b1b7e348fdb8a57c9c0c0dfce81` is the tree these commands ran against. The earlier compact-detail commit is `5ac9ce9` on that same base.
- Fresh-main/prerequisite/active-PR checks: fetched `origin/main` and rebased the unpushed branch. No conflict. MED-02 tags (`addTag` / `normaliseTags`), MED-03 rating (`ratingOptions` / `segmentValue`, no `name="rating"` input), and MED-04 Related (one `IntersectionObserver`) are on this main. Claim already posted: https://github.com/Vivekpsps3/vivek-monorepo/issues/240#issuecomment-6813212051. No second claim. No open PR overlapped this detail diff before this branch was pushed.

## Acceptance

Fixtures are synthetic library rows from the Media e2e API. The show is a manual series with three local episodes. Viewport for DET1 is 390×844. Light and dark themes are applied in the page. No provider is contacted for the saved detail read.

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| DET1 | A series with no artwork shows a kind icon and the title's first letter, not a two-letter crop. Chips show Series and Watching. Artwork is 2:3. Episode dates are calendar copy, undated episodes say "Air date unknown", and Mark watched, Mark next watched, and Remove from library are at least 44px. Mark watched exposes `aria-pressed`. Manual progress stays folded until opened and does not drop the note or the 4-out-of-10 rating. Mark next, Undo, a 502, and a direct watch toggle keep that draft. Reload restores it from the existing per-tab draft. A book shows progress and folds anticipation. A movie folds both and shows kind, creator, and fallback icon. Phone light and dark have no horizontal overflow and no serious or critical axe findings. | PASS | `apps/media/e2e/detail-presentation.spec.ts` (both tests). `detail-meta.test.mjs` covers ratio, kind copy, disclosure, and episode date lines. |

MED-02, MED-03, and MED-04 behavior stayed in place on this run: `tags.spec.ts` 4/4, `rating.spec.ts` 3/3, `related.spec.ts` 3/3, and `detail-races.spec.ts` 4/4.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Detail eyebrow plus `title.slice(0, 2)` fallback, at base `0022c5ef` | `detail.component.html` only | `detail-meta.mjs` (`metaChips`, `placeholderLetter`, `kindIcon`) and `format.mjs` `statusOptions` | Eyebrow and two-letter crop removed from the detail header. Library cards still use their own ratio and two-letter fallback. | DET1 fallback, chips, and 2:3 box |
| Hardcoded State/Relationship `<option>` lists in the detail template | Detail form only. `format.mjs` was already the kind vocabulary for other surfaces. | `statusOptions` in `format.mjs`. `detail-meta.mjs` `STATE_LABELS` remains only when a chip has no kind. | Template branches deleted. No second kind map. | `detail-meta.test.mjs` artist/game/book labels; `format.test.mjs` still owns the vocabulary |
| Always-visible generic progress and Anticipated on every non-artist | Detail form | `progressPrimary`, `needsMoreOpen`, and one `ng-template` for the progress fields | Books and games still show progress. Other kinds disclose progress and anticipation. Artists still have no progress field. | DET1 disclosure test; book progress tests in `phase0.spec.ts` and `native.spec.ts` |
| Inline episode date assembly and unguarded `fetched_at.slice(0, 10)` | Detail template | `episodeDateLine` and `dateOnly`, with `showDay` / `formatDay` | Old branches removed from the template | DET1 dates; `detail-meta.test.mjs` |
| A second mark-next POST drafted on the detail component | Would have duplicated `NextEpisodeService.markNext` | `NextEpisodeService` (now also returns the saved entry) and `NextEpisodeUndoService` | Detail calls the service. One store: `MediaDrafts`. | DET1 mark-next, 502, and Undo |

- Candidate class and protected counterexamples: presentation feature plus duplicate-policy removal. Not a net-negative simplification. Membership SQL, catalog versus personal entry, the rating editor, the tag editor, and the Related observer were not given a second implementation.
- Comparison base SHA and full replacement closure: `0022c5ef8065e08892b6eecdfa6450158ee69ef6`. Closure is `detail.component.ts`, `detail.component.html`, `detail-meta.mjs`, `detail-meta.d.mts`, `media.css`, `next-episode.service.ts`, `docs/MEDIA.md`, `detail-meta.test.mjs`, and `apps/media/e2e/detail-presentation.spec.ts`.
- Production added/deleted/moved; comments/blank-only churn separately: `git diff --numstat origin/main` for the six production files is +346/−55, of which 14 added lines are blank. No moves. No generated bundle committed.
- Independent equivalent implementations before/after: detail status lists 2 → 1 (`format.mjs`). Mark-next POSTs 1 → 1. Draft stores 1 → 1. Related observers 1 → 1.
- State/cache owners and public entry points before/after: `MediaDrafts` remains the only item draft. `keepDrafts` rebases that draft's base onto the progress response and leaves the form fields in place. Rating still uses `ratingOptions` / `segmentValue`. Tags still use `addTag` / `normaliseTags`. Related still uses one `IntersectionObserver`.
- Remaining old symbol/path search, including config and discovery: no `name="rating"` input. Library/Add two-letter fallback remains for MED-09. `NextEpisodeService.markNext` is the only `/episodes/next` client.
- Follow-up change: a status label change edits `format.mjs`. Disclosure copy edits `detail-meta.mjs`. Draft rebasing edits `DetailComponent.keepDrafts`.
- Tests/docs/generated changes separately: `detail-meta.test.mjs` +59/−1, `detail-presentation.spec.ts` +188, `docs/MEDIA.md` one rewritten sentence. This evidence file is the other doc. `dist/` was rebuilt for Playwright and is not committed.
- Net production delta and specific reviewed safety/compatibility exception if positive: about +291 physical lines. The growth is the compact header, the disclosure, the draft rebase, and the typed helpers. The template's second status list and always-visible generic controls were removed in the same change. This is a feature, not a simplification claim.
- No behavior/data/meaningful assertion silently removed: tag editing, half ratings, Related loading, detail races, and book progress save/reload still pass.

## Verification

Commands from `/tmp/vivek-med-06` against `3ba6f31f84cb8b1b7e348fdb8a57c9c0c0dfce81`. Heavy Playwright and coverage commands used `flock /tmp/vivek-heavy-checks.lock`. Playwright used `PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE=$HOME/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. An earlier launch failed before any page opened because the sandbox browser path had no Chromium; that run is not a product result.

| Command | Result |
| --- | --- |
| `make lint-python` | PASS. Ruff format clean. Ruff 101 findings match the baseline. Suppressions 6 match. |
| `make typecheck-python` | PASS. mypy 87 findings match the baseline. |
| `make typecheck-web` | PASS |
| `make lint-web` | PASS. Finance 469, site 9, packages 1, world engine 0, all at baseline. |
| `node --test apps/media/backend/static/tests/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs` | PASS, 57 |
| `./scripts/coverage-gate.sh media` | PASS, 208 tests, 84.37% (floor 70.6%). No Python product file changed. |
| `make build-frontends` | PASS. Production bundle written under `dist/web`. Pre-existing unused Finance import warnings only. |
| `npx playwright test --config apps/media/e2e/playwright.config.ts` | PASS, 95, including both `detail-presentation.spec.ts` tests, `detail-races.spec.ts` 4, `rating.spec.ts` 3, `tags.spec.ts` 4, `related.spec.ts` 3 |
| `make test-fast` | PASS. Doc paths, planning validation (95 packets), shared boundaries, and script tests. |

Not run: `npm run test:web` (no `packages/ui` or `apps/web` source change, and no Karma spec mounts Media `DetailComponent`; `make typecheck-web` includes `apps/web/tsconfig.spec.json`). Town Playwright and `npx playwright test --project=suite` (no Town, route, or suite file change). Finance, Travel, and server coverage gates. Deployment was not run.

## Handoff

- PR URL (leaf closure keyword only): recorded after `gh pr create`. `Closes #240` only. #85 is referenced and stays open.
- Roadmap #134 append-only status-note URL: recorded after the scoped comment. The issue body was not edited.
- Merged/activation status: not merged. Local verification passed. CI is not recorded yet. Not deployed.
- Remaining external prerequisites or approved scope decisions: none for this leaf. Library and Add artwork stay with MED-09. Parent #85 stays open.
- Next actor: watch CI on the pull request, squash-merge only with authorization, then record the squash SHA on #240 and #134.

No unstated decision from the previous context is necessary to continue.
