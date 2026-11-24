# FIXUP-18 — Return from suite Settings to the task that opened it

- Stable key: `FIXUP-18`
- GitHub leaf: [#606](https://github.com/Vivekpsps3/vivek-monorepo/issues/606)
- Parents: [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578), [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `NAV-02`, `NAV-04`
- Conflict groups: `private-shell`, `private-routes`, `account-settings`
- Verification profiles: `docs`, `web_front`
- Priority: P1

## Outcome

Treat routine settings changes as a short interruption with a clear way back to the exact task.

## Requirements

From Portland trip detail, open the account menu, Settings, then Appearance. Only a settings-index link and a generic Town preview are visible. The user must use browser history to find the originating trip. The account menu opens bare /settings.

Browser and source baseline [bb300824](https://github.com/Vivekpsps3/vivek-monorepo/commit/bb3008249f2f97d88ce89a32a1715fda4c00ab46). Use the common revamp acceptance contract and recheck recent merges.

Verify prerequisite outcomes on fresh main. [NAV-02 / #387](https://github.com/Vivekpsps3/vivek-monorepo/issues/387), [NAV-04 / #389](https://github.com/Vivekpsps3/vivek-monorepo/issues/389).

## Source paths

- `apps/web/src/app/private-layout.component.html`
- `apps/web/src/app/settings/settings-shell.component.ts`
- `apps/web/src/app/settings/settings-shell.component.html`
- `packages/ui/src/return-context.ts`
- `tests/e2e/settings-navigation.spec.ts`

## Target paths

The named owners and their affected browser journeys.

## Steps

1. Reproduce the observed path with synthetic records and check the current implementation claims.
2. Capture the allowlisted origin when Settings opens from the shell. Preserve it through section navigation and provide a visible, named return from the index and child pages. Keep contextual connector and scene previews distinct.
3. Verify ordinary, keyboard/touch and failure journeys. Run launch profiles and actual-diff gates.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| FIXUP-18-A1 | Synthetic account for the primary journey | Exercise the ordinary or direct entry | From a filtered collection, exact trip day and selected Town room, enter Settings by touch and keyboard and switch sections. Explicit return restores source route, query, focus and useful scroll even after refresh where the state is supported. | Executed browser journey with exact control, route and focus assertions |
| FIXUP-18-A2 | Relevant failure, alternate input or prior state | Retry, return, or use a second input path | Visit Settings directly or with an expired/unknown origin. Use a safe fallback. Preserve form cancellation and shared vault/owner clearing, plus browser Back behavior. | Executed recovery and return behavior with domain assertions |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded controls or paths in this slice | Reuse the current return mechanism. Remove any duplicate origin state introduced by local wrappers and keep one relevant explicit exit in each settings context. | Replacement or simplification | Before/after UI, migrated consumers and surviving behavior |

## Non-goals

Keep canonical app state, existing record and privacy semantics, supported routes and independent features. This packet owns the named journey.

## Test scenarios

- Reproduce the starting behavior above, then verify both acceptance rows at 390×844 and 1280×800 in light and night.
- Cover touch, keyboard, named focus and reduced motion. Stress 320px and 200% text when touching shared or scene layout.

## Risks

Recheck overlapping work. Preserve supported failure and empty-state meanings, drafts and safe return before deleting old paths.

## Completion evidence

Record the tested SHA, command results, captures and deletion evidence in `planning/implementation/evidence/FIXUP-18.md`. Close only this leaf from its implementation PR.
