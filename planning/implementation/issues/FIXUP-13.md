# FIXUP-13 — Use the canonical Finance Imports entry from Home

- Stable key: `FIXUP-13`
- GitHub leaf: [#591](https://github.com/Vivekpsps3/vivek-monorepo/issues/591)
- Parents: [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578), [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `FUX-03`, `FUX-07`, `NAV-02`
- Conflict groups: `finance-ui`
- Verification profiles: `docs`, `finance_front`
- Priority: P1

## Outcome

Keep Finance’s first import in the same Imports flow as later statements, including preview, receipts and a clear return.

## Requirements

Finance Home’s Import card activity link opens the real bank-import wizard on /finance/spending?add=1. Cancel leaves the user on Activity, outside the Imports history and recovery surface. Imports already supports start=bank and contextual Activity import actions use it. Starter and First steps also repeat some early actions.

Reproduce on the audited revision with synthetic data. Unlock an empty synthetic vault, select Import card activity, then cancel. Compare the resulting Activity page with starting the same wizard from Imports.

Browser baseline [27c99dc2](https://github.com/Vivekpsps3/vivek-monorepo/commit/27c99dc28370c5d2c49382bc1486faeb98c3573f). Follow the selected coastal Town design and common acceptance contract.


Verify prerequisite outcomes on fresh main. [FUX-03 / #392](https://github.com/Vivekpsps3/vivek-monorepo/issues/392), [FUX-07 / #396](https://github.com/Vivekpsps3/vivek-monorepo/issues/396), [NAV-02 / #387](https://github.com/Vivekpsps3/vivek-monorepo/issues/387).

## Source paths

- `apps/finance/frontend/src/app/dashboard/dashboard.component.html`
- `apps/finance/frontend/src/app/dashboard/dashboard.component.ts`
- `apps/finance/frontend/src/app/hubs/spending-hub.component.ts`
- `apps/finance/frontend/src/app/imports/imports.component.ts`

## Target paths

The named source owners and affected existing browser journeys.

## Steps

1. Reproduce the observed starting state and recheck fresh main and open claims.
2. Use the canonical bank-import intent from Finance Home and an accurate, deliberate return on Cancel and Done. Preserve the documented legacy URL for existing bookmarks.
3. Consolidate duplicate first actions. Keep accurate balance/transaction labels, useful onboarding progress, and populated Home facts.
4. Run the packet profiles and applicable actual-diff gates. Record successful and failure journeys with local evidence.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| FIXUP-13-A1 | Empty vault on first visit | Use Import card activity and preview a supported synthetic file | The existing bank wizard opens in Imports. No write occurs before confirmation. Cancel and Done have clear return or receipt actions. | Executed route, actual preview, Cancel and receipt |
| FIXUP-13-A2 | Legacy import URL or a vault with records | Open the saved URL or return to Home after import | Legacy import and dated manual add remain distinct. Useful Home facts appear first and starter actions do not repeat. | Legacy, populated and vault guard browser checks |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded UI in the affected slice | Remove Finance Home’s dependency on the date-less Activity import alias and redundant starter CTAs. Preserve supported legacy URL behavior. | Presentation or entry replacement | List migrated consumers, removed markup/paths and surviving journeys. |

## Non-goals

Preserve the canonical editors, source ownership, data semantics, existing routes and supported user records. The content already assigned to open roadmap leaves remains in those packets.

## Test scenarios

- Unlock an empty synthetic vault, select Import card activity, then cancel. Compare the resulting Activity page with starting the same wizard from Imports.
- Use 390×844 and 1280×800 in light and night. Check keyboard, touch and reduced motion, plus 320px and 200% text for shared layout changes.

## Risks

Preserve preview, dedupe, revisions and onboarding progress.

## Completion evidence

Record the tested SHA, exact command results, before/after acceptance captures and removal evidence in `planning/implementation/evidence/FIXUP-13.md`. Close only this leaf with the implementation PR.
