# FIXUP-22 — Protect unsaved weekly reflections on every exit

- Stable key: `FIXUP-22`
- GitHub leaf: [#610](https://github.com/Vivekpsps3/vivek-monorepo/issues/610)
- Parents: [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578), [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `SCENE-07`, `NAV-02`
- Conflict groups: `private-routes`, `health-ui`
- Verification profiles: `docs`, `web_front`
- Priority: P0

## Outcome

Keep a reflection safe until the user deliberately saves or discards it.

## Requirements

Open Weekly review from Hub, unlock, type a note, try Earlier and stay, then take the Hall link. The editor exits without prompting and reopening the same week shows the old empty note. The unconditional Hall link also drops the Hub origin. With 52 saved weeks, the first focus input starts at y1686, Note at y1966 and Save at y2256 because every saved week renders before the editor.

Browser and source baseline [bb300824](https://github.com/Vivekpsps3/vivek-monorepo/commit/bb3008249f2f97d88ce89a32a1715fda4c00ab46). Use the common revamp acceptance contract and recheck recent merges.

Verify prerequisite outcomes on fresh main. [SCENE-07 / #445](https://github.com/Vivekpsps3/vivek-monorepo/issues/445), [NAV-02 / #387](https://github.com/Vivekpsps3/vivek-monorepo/issues/387).

## Source paths

- `apps/web/src/app/town/health/review-editor.component.html`
- `apps/web/src/app/town/health/review-editor.component.ts`
- `apps/web/src/app/routes.ts`

## Target paths

The named owners and their affected browser journeys.

## Steps

1. Reproduce the observed path with synthetic records and check the current implementation claims.
2. Use one navigation decision for week changes, explicit return, shell navigation and browser Back. Restore the actual Hub/Hall source when known and a safe deep-link fallback. Put the active week and its editor first, with one compact history entry.
3. Verify ordinary, keyboard/touch and failure journeys. Run launch profiles and actual-diff gates.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| FIXUP-22-A1 | Synthetic account for the primary journey | Exercise the ordinary or direct entry | Write a synthetic unsaved note and exercise Earlier, explicit exit, app switch and browser Back. Stay preserves fields and focus. An approved discard exits. Save and return opens the correct origin and reloading the exact week shows the committed record. With 52 saved weeks, the editor and history entry are reachable immediately. | Executed browser journey with exact control, route and focus assertions |
| FIXUP-22-A2 | Relevant failure, alternate input or prior state | Retry, return, or use a second input path | Lock or sign out during a dirty draft or a held write. Clear plaintext promptly, preserve the current revision contract and keep any route-level guard from trapping security exits. | Executed recovery and return behavior with domain assertions |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded controls or paths in this slice | Replace inconsistent exit handling and the unconditional Hall-only exit. Keep one encrypted editor and week/date semantics. Replace the full preceding history list with explicit history access. | Replacement or simplification | Before/after UI, migrated consumers and surviving behavior |

## Non-goals

Keep canonical app state, existing record and privacy semantics, supported routes and independent features. This packet owns the named journey.

## Test scenarios

- Reproduce the starting behavior above, then verify both acceptance rows at 390×844 and 1280×800 in light and night.
- Cover touch, keyboard, named focus and reduced motion. Stress 320px and 200% text when touching shared or scene layout.

## Risks

Recheck overlapping work. Preserve supported failure and empty-state meanings, drafts and safe return before deleting old paths.

## Completion evidence

Record the tested SHA, command results, captures and deletion evidence in `planning/implementation/evidence/FIXUP-22.md`. Close only this leaf from its implementation PR.
