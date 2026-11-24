# FIXUP-16 — Keep workspace search actions tied to the current query

- Stable key: `FIXUP-16`
- GitHub leaf: [#604](https://github.com/Vivekpsps3/vivek-monorepo/issues/604)
- Parents: [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578), [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `HUB-04`, `NAV-02`
- Conflict groups: `suite-search`, `finance-public-api`, `private-shell`
- Verification profiles: `docs`, `web_front`
- Priority: P0

## Outcome

Make Search safe to use at typing speed and useful when one source is unavailable.

## Requirements

Search Portland, replace it with a different query, and press Enter during debounce. Chromium opened the Portland trip at 320, 390 and 1280px. The old option stays active after the input changes. The server failure branch also clears independently available Finance matches.

Browser and source baseline [bb300824](https://github.com/Vivekpsps3/vivek-monorepo/commit/bb3008249f2f97d88ce89a32a1715fda4c00ab46). Use the common revamp acceptance contract and recheck recent merges.

Verify prerequisite outcomes on fresh main. [HUB-04 / #246](https://github.com/Vivekpsps3/vivek-monorepo/issues/246), [NAV-02 / #387](https://github.com/Vivekpsps3/vivek-monorepo/issues/387).

## Source paths

- `apps/web/src/app/search/search-dialog.component.ts`
- `apps/web/src/app/search/search-dialog.component.html`
- `tests/e2e/search.spec.ts`

## Target paths

The named owners and their affected browser journeys.

## Steps

1. Reproduce the observed path with synthetic records and check the current implementation claims.
2. Invalidate older options and keyboard selection as soon as the visible query changes. Keep local Finance visibility independent of Travel/Media retry. Retire stale rows from touch activation and from the combobox’s active descendant.
3. Verify ordinary, keyboard/touch and failure journeys. Run launch profiles and actual-diff gates.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| FIXUP-16-A1 | Synthetic account for the primary journey | Exercise the ordinary or direct entry | Hold an old response, type a new query and try Enter or touch. Only options for the visible query can open. Keyboard highlight follows a visible option and lands on its exact record. | Executed browser journey with exact control, route and focus assertions |
| FIXUP-16-A2 | Relevant failure, alternate input or prior state | Retry, return, or use a second input path | Fail Travel/Media search with an unlocked matching Finance record. Keep the current local match and a concise retry for the failed source. Lock/sign-out removes disallowed results and old responses cannot republish. | Executed recovery and return behavior with domain assertions |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded controls or paths in this slice | Remove the stale selectable-result window and the global failure branch’s unconditional clearing of unrelated results. Preserve debouncing, server limits, local-only Finance and the current privacy lifecycle. | Replacement or simplification | Before/after UI, migrated consumers and surviving behavior |

## Non-goals

Keep canonical app state, existing record and privacy semantics, supported routes and independent features. This packet owns the named journey.

## Test scenarios

- Reproduce the starting behavior above, then verify both acceptance rows at 390×844 and 1280×800 in light and night.
- Cover touch, keyboard, named focus and reduced motion. Stress 320px and 200% text when touching shared or scene layout.

## Risks

Recheck overlapping work. Preserve supported failure and empty-state meanings, drafts and safe return before deleting old paths.

## Completion evidence

Record the tested SHA, command results, captures and deletion evidence in `planning/implementation/evidence/FIXUP-16.md`. Close only this leaf from its implementation PR.
