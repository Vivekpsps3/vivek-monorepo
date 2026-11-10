# CON-01 — implementation evidence

- Leaf issue and parent(s): [#206](https://github.com/Vivekpsps3/vivek-monorepo/issues/206); parent [#197](https://github.com/Vivekpsps3/vivek-monorepo/issues/197) stays open
- Agent/context, branch/worktree: Cursor Grok, `agent/con-01`, `/tmp/vivek-con-01`
- Base main SHA, current tested SHA: packet base `80b9ca0e0776297f3addcdfdac78542f6a7ced40`. `origin/main` fast-forwarded to `3f0304381486682169fb94f4c42875e63452393d` before the gates. Tested SHA `9764c17e48fe6f0668e06de3a7426ac8adf0bedc` (`make test-fast` rerun on that commit; the other three gates passed on the same checker diff).
- Fresh-main/prerequisite/active-PR checks: no queue dependency. No open pull requests when the leaf started. Conflict groups `architecture-checker`, `root-typescript-config`, and `server-composition` were not edited in product files. `routes.ts`, `main.py`, `schema.py`, and `public-api.ts` were read and left unchanged.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| LOCAL1 | A fixture hub file imports Finance `secret.ts` through the `@finance/*` path alias, and a Pixels file imports nested World `engine/private.ts` by relative path. `main(["--root", fixture])` fails both edges with owner and path. | PASS | `GraphFixtureTests.test_alias_and_nested_private_imports_fail` |
| LOCAL2 | `routes.ts` lazy-imports Finance `public-api` and a Town component. `apps/server/main.py` imports the Finance registrar. A same-package Python relative import passes. `apps/server/checks.py` importing that registrar fails, so the server tree is not exempt. | PASS | `test_public_entry_and_server_composition_pass`, `test_server_platform_file_is_not_exempt`; real tree `python3 scripts/check-shared-boundaries.py` prints OK |
| LOCAL3 | A comment and a string that look like imports produce no edge. A real reexport, `require()`, type-only import, and dynamic `import()` fail. A Python relative import into Town and a package import of an app fail. A Town/World cycle names both owners. | PASS | `test_comments_and_strings_are_not_edges`, `test_python_relative_and_package_edges`, `test_cycle_names_both_owners` |
| LOCAL4 | The checker source has no `IMPORT_RE`, `import_target`, or `source_app != "server"`. Composition is a file list, not `apps/server`. Twenty-three reviewed edges name removal owners. A new hub file that copies a baselined import still fails. | PASS | `test_one_import_owner_remains`, `test_reviewed_file_does_not_cover_a_new_file`, `make test-fast` |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| `IMPORT_RE` and `import_target` regex ownership | `check-shared-boundaries.py` `main` | `check_boundaries`, `python_edges`, and `resolve-ts-imports.mjs` (edges only; no allow/deny) | removed the regex extractor | LOCAL1 alias and LOCAL3 reexport/require fail; comments do not |
| Blanket `source_app != "server"` exemption | every server source file | enumerated `SERVER_COMPOSITION` files plus `server:tests` | removed the exemption | `checks.py` fails; `main.py` passes |
| Blanket skip of `apps/media/e2e` | the old import loop | resolved edges; specs and e2e may import another feature in the same app only | removed the skip | real tree passes without ignoring that directory |
| Reviewed cross-owner edges (23) | live production imports | the same files, listed with removal owners | retained as a named baseline, not a new-file bypass | `test_reviewed_file_does_not_cover_a_new_file` |
| Private-sink and generic Finance UI scans | finance frontend, package `src`, and the generic UI path list | the same scans | retained; scope text now says they do not cover Travel, Media, or the server | `test_sink_scope_is_finance_frontend_and_package_src` |

- Candidate class and protected counterexamples: duplicate live policy (regex ownership versus resolved ownership). Product routes, vault files, Media services, and Travel files were not edited. The baseline does not allow a new source or target.
- Comparison base SHA and full replacement closure (including new files): parent `3f0304381486682169fb94f4c42875e63452393d`. Closure is `scripts/check-shared-boundaries.py`, `scripts/resolve-ts-imports.mjs`, `scripts/test_check_shared_boundaries.py`, `docs/ARCHITECTURE.md`, and this evidence file.
- Production added/deleted/moved; comments/blank-only churn separately: `check-shared-boundaries.py` +574/−86. `resolve-ts-imports.mjs` +124/−0. Physical production +698/−86, net +612. No move. The TypeScript file is the parser/resolver the leaf requires; it does not decide ownership.
- Independent equivalent implementations before/after: one regex import-ownership path before; one resolved path after. Policy stays in the Python checker.
- State/cache owners and public entry points before/after: none. Public entries remain the four `public-api` modules and Finance `testing` from `*.spec.ts`. Server composition remains the seven named files.
- Remaining old symbol/path search, including config and discovery: `IMPORT_RE`, `import_target`, and `source_app != "server"` are absent from `scripts/check-shared-boundaries.py`. `make test-fast` still calls that script.
- Follow-up change: deleting a baselined edge edits that source file and its `REVIEWED` row. Removal owners are `server-identity`, `web-hub`, `web-platform`, `web-town`, `web-world`, `web-settings`, and `web-search`.
- Tests/docs/generated changes separately: tests +271/−0. `docs/ARCHITECTURE.md` +18/−1. This evidence file is the other documentation. No generated output.
- Net production delta and specific reviewed safety/compatibility exception if positive: +612 physical lines. The growth is the safety fix: the regex path could not resolve aliases, package-relative Python imports, or the TypeScript forms this repo uses, and the server exemption hid every server edge. Both old paths are deleted. The 23 baseline rows are existing imports with owners, not a broader allow-list. `migrate.py` keeps one non-literal `import_module(f"apps.{domain}...")` because that file is an enumerated composition seam; any other non-literal dynamic import fails.
- No behavior/data/meaningful assertion silently removed: Finance, Travel, Media, Hub, and auth product files were not edited. Sink and generic-UI assertions remain, including the negative samples. Platform and public-entry unit tests remain.

## Verification

Commands ran from `/tmp/vivek-con-01` with `PATH="/tmp/node24/bin:$PATH"` (`node` v24.11.1), holding `flock` on `/tmp/vivek-wave-gates.lock` for the whole sequence. Local execution only. Coverage floors were not changed. Server coverage printed a rise from 61.87% to 80.63% because main had moved; the 61.53% floor stayed.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS. Doc paths, 80-packet planning validation, blame revisions, shared boundaries OK, finance UX, 53 unittest tests (14 of them the boundary fixtures), e2e discovery, and 15 node tests. |
| `make lint-python` | PASS. 211 files formatted. Ruff 101 findings match the baseline. Suppressions 6 match the baseline. |
| `make typecheck-python` | PASS. mypy 87 findings match the baseline. |
| `./scripts/coverage-gate.sh server` | PASS. 874 passed, 2 xfailed. Total coverage 80.63% (floor 61.53%). Perf gate passed. |

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/300 (`Closes #206`, `Refs #197`). Parent #197 is not closed.
- Roadmap #134 append-only status-note URL: posted after merge. The issue body was not edited.
- Merged/activation status (actual evidence, not assumption): local gates passed. Squash merge is authorized for this leaf. This file does not claim deployment or activation.
- Remaining external prerequisites or approved scope decisions: none for this leaf.
- Next actor: integration owner, after this leaf is squash-merged.

## Context handoff

Issue / parent / local packet: CON-01, GitHub #206, parent #197, packet `planning/implementation/issues/CON-01.md`.

Branch, worktree, base main SHA, current SHA: `agent/con-01`, `/tmp/vivek-con-01`, merged main `3f0304381486682169fb94f4c42875e63452393d`, tested SHA `9764c17e48fe6f0668e06de3a7426ac8adf0bedc`.

Owned files and conflict groups: `architecture-checker`, `root-typescript-config`, `server-composition`. Product files in those groups were not edited.

Completed acceptance rows with direct evidence: LOCAL1, LOCAL2, LOCAL3, and LOCAL4 PASS in the table above.

Unfinished/failed rows and exact next action: none in the leaf. Commit, push, open the pull request, squash-merge, comment on #134, and remove this worktree.

Deletion ledger and current consumer migration: regex ownership and the server-wide exemption are gone. Callers are the `make test-fast` script entry and the unittest module. Composition files and the 23 reviewed edges are the remaining dispositions.

Commands run, results, tested SHA; required checks still pending: the four commands above passed. `make test-fast` is repeated after this evidence file so doc links are checked. CI was not required before the local gates.

PR and roadmap note URLs; actual merge/deployment/activation state: https://github.com/Vivekpsps3/vivek-monorepo/pull/300. The #134 comment follows merge. Not deployed.

External prerequisites and next actor: none. Next actor is the integration owner after squash merge.

No unstated decision from the previous context is necessary to continue.
