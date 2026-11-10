# MED-11 — Remove verified no-caller Media helpers and artist portrait pipeline

- Stable key: `MED-11`
- GitHub leaf: [#296](https://github.com/Vivekpsps3/vivek-monorepo/issues/296)
- Parents: [#200](https://github.com/Vivekpsps3/vivek-monorepo/issues/200), [#85](https://github.com/Vivekpsps3/vivek-monorepo/issues/85)
- Kind: `implementation`
- Base checked: `8c37ce2` on 2026-11-10. Re-read current `main` before editing.
- Dependencies: none
- Conflict groups: `media-records`, `media-provider-transport`, `media-provider-family`
- Verification profiles: `media_back`, `server_back`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

Media service code with no supported consumer is removed while route responses, saved-read behavior, episode progress and migration data remain stable.

## Requirements

- #200 simplification scope and #85 Media owner isolation; preserve current public API and user-visible behavior.
- Recheck all candidates against fresh main, including tests, imports, lazy/config entry points and migration references.

## Source paths

- `apps/media/backend/services/jsonstore.py`
- `apps/media/backend/services/textutil.py`
- `apps/media/backend/services/when.py`
- `apps/media/backend/services/records.py`
- `apps/media/backend/services/providers.py`
- `apps/media/backend/services/validate.py`
- `apps/media/backend/services/membership.py`
- `apps/media/backend/tests/`

## Target paths

- `apps/media/backend/services/`
- `apps/media/backend/tests/`

## Steps

1. Read fresh main and this packet. Recheck all references in application source, tests, docs, configuration and migration imports. Treat decorator-registered routes and framework entry points as live consumers.
2. Delete the unreferenced `jsonstore.py`; remove only `textutil.clean_rating` and `clean_artwork`; remove `when.choose_release`, its private `WHEN_RANK`, and `within_days`; remove `records.needs_collaborators` and `saved_source_keys`.
3. Remove `records.mark_next` only after confirming the route still uses `episode_next.mark_next_checked` and its expected-id, owner, conflict and concurrency behavior remains intact.
4. Delete the uncalled artist portrait chain (`musicbrainz_artist_image`, `wikidata_artist_images`, `cached_artist_portraits`, `attach_artist_portraits`). Keep `image_from_relations`, which has another live provider caller.
5. Consolidate `_safe_https` and `_https_artwork` only if one existing validation owner preserves the exact current policy: trim strings, accept case-sensitive `https://` up to 1000 characters, otherwise return `None`. `validate.http_url` is not equivalent because it accepts HTTP and raises a validation error.
6. Replace tests that monkeypatch deleted portrait symbols with transport-boundary assertions proving search and saved reads do not make enrichment requests. Keep route payload and episode-next behavior assertions.
7. Preserve `membership.py`, the applied migration's imported behavior, `artist-portrait:` cache retention and existing cache rows. Measure removed production/test LOC separately from moved helpers and test changes.
8. Run all applicable verification profiles expanded by the planning guide and root instructions. Record exact commands, results, revision and acceptance evidence before opening a PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| MEDDEL1 | each helper/file candidate on fresh main | source, test, config, docs and migration consumers are checked | only confirmed no-caller code is removed; live serializers, release functions, validators and episode command remain | consumer ledger and fresh search results |
| MEDDEL2 | saved-read/search routes and portrait cache rows | the removed enrichment path is absent | responses and no-provider-I/O behavior are stable; migration retention remains unchanged | API payload, transport spy and migration preservation evidence |
| MEDDEL3 | duplicate strict HTTPS normalizers | both live call sites run through one owner | accepted values and rejected values match exactly | boundary vectors for whitespace, scheme, malformed input and length |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Uncalled JSON, text, release and record helpers listed in steps 2–3 | delete definitions, unused imports and the unreferenced module; keep current owners | required | full consumer search plus route and service regressions |
| Artist portrait fetch/cache attachment chain | remove the uncalled closure and stale helper-only test seams | required | provider caller map, transport-boundary assertions and retained cache-migration fixture |
| `_safe_https` / `_https_artwork` exact duplicate | replace with one existing owner only if semantics remain identical | conditional | callsite map and strict-HTTPS boundary vectors |

## Non-goals

- No route, payload, migration, cache-retention or user-visible feature changes.
- Do not replace `records.dumps/loads` with `jsonstore` or merge `clean_artwork` into `http_url`; their semantics differ.
- Do not edit historical migration revisions or the imported migration helper in `membership.py`.
- No general provider framework or file split.

## Test scenarios

- no-call search across route/config/test/migration references; JSON/text/release helper owners; saved-read and search no-enrichment; migration cache retention; next-episode ownership, expected-id, conflict and concurrency; strict HTTPS boundary.

## Risks

- Existing tests refer to unused portrait helpers as forbidden-call spies. Move those checks to the network boundary; do not retain dead production functions solely to make a spy attach.
- Similar-looking helpers have different error/fallback semantics. Do not consolidate by name alone.

## Completion evidence

- Map each removed symbol to its old and surviving callers; identify any candidate retained and why.
- Attach every acceptance row to a test or explicit reviewed migration/API disposition on the final revision.
- Report production, test and planning LOC independently. Moving code, deleting stale tests without a behavior reason, or splitting files does not count as simplification.
- Applicable local gates pass before PR creation. After merge, update this packet and its fresh-read parent roadmap rows only.
