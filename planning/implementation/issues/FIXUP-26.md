# FIXUP-26 — Open Finance Planning tools at their results and inputs

- Stable key: `FIXUP-26`
- GitHub leaf: [#614](https://github.com/Vivekpsps3/vivek-monorepo/issues/614)
- Parents: [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578), [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `FUX-06`
- Conflict groups: `finance-ui`
- Verification profiles: `docs`, `finance_front`
- Priority: P1

## Outcome

Make each direct Planning destination feel like the tool the user chose, with honest input/readiness state.

## Requirements

The direct Retirement route shows six tools, four source facts and the Annual spending plan before its first Retirement input at about y1636 on 390px. With assets/holdings and no spending evidence it shows a $0 FI target, $0 gap and zero years without a spending prompt.

Browser and source baseline [bb300824](https://github.com/Vivekpsps3/vivek-monorepo/commit/bb3008249f2f97d88ce89a32a1715fda4c00ab46). Use the common revamp acceptance contract and recheck recent merges.

Verify prerequisite outcomes on fresh main. [FUX-06 / #395](https://github.com/Vivekpsps3/vivek-monorepo/issues/395).

## Source paths

- `apps/finance/frontend/src/app/planning/planning.component.html`
- `apps/finance/frontend/src/app/planning/planning.component.ts`
- `apps/finance/frontend/src/app/planning/planning-quick-tools.component.html`
- `apps/finance/frontend/src/app/planning/planning-results.component.html`

## Target paths

The named owners and their affected browser journeys.

## Steps

1. Reproduce the observed path with synthetic records and check the current implementation claims.
2. Lead each deep route with its own next action, required inputs or meaningful result. Keep the overview as a tool index. Put the shared facts/advanced assumptions in scoped disclosures. Distinguish missing spending evidence from deliberately entered zero.
3. Verify ordinary, keyboard/touch and failure journeys. Run launch profiles and actual-diff gates.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| FIXUP-26-A1 | Synthetic account for the primary journey | Exercise the ordinary or direct entry | Open Retirement and each other canonical Planning tool by phone or link. The named tool’s first meaningful input or result is visible in the initial viewport. Legacy routes and return positions work. | Executed browser journey with exact control, route and focus assertions |
| FIXUP-26-A2 | Relevant failure, alternate input or prior state | Retry, return, or use a second input path | Compare missing, explicit zero, known nonzero, stale and failed source facts. A missing required baseline prompts for it without presenting a factual zero projection. Chosen zero and existing math keep their meanings. | Executed recovery and return behavior with domain assertions |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded controls or paths in this slice | Remove repeated global index and full supporting fact panels above the active tool. Preserve source provenance through the scope where it informs a decision. | Replacement or simplification | Before/after UI, migrated consumers and surviving behavior |

## Non-goals

Keep canonical app state, existing record and privacy semantics, supported routes and independent features. This packet owns the named journey.

## Test scenarios

- Reproduce the starting behavior above, then verify both acceptance rows at 390×844 and 1280×800 in light and night.
- Cover touch, keyboard, named focus and reduced motion. Stress 320px and 200% text when touching shared or scene layout.

## Risks

Recheck overlapping work. Preserve supported failure and empty-state meanings, drafts and safe return before deleting old paths.

## Completion evidence

Record the tested SHA, command results, captures and deletion evidence in `planning/implementation/evidence/FIXUP-26.md`. Close only this leaf from its implementation PR.
