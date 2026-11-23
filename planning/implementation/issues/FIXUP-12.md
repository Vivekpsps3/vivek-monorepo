# FIXUP-12 — Keep Hub summaries compact and remove repeated destination panels

- Stable key: `FIXUP-12`
- GitHub leaf: [#590](https://github.com/Vivekpsps3/vivek-monorepo/issues/590)
- Parents: [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578), [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `FIXUP-01`, `NAV-03`, `HUB-01`, `HUB-05`
- Conflict groups: `hub-main`, `hub-agenda`
- Verification profiles: `docs`, `web_front`
- Priority: P1

## Outcome

Keep the Hub as a short practical arrival, with the next useful decisions and a clear route into the suite.

## Requirements

The empty/locked phone Hub is 1847px tall. It repeats Town and Pixels as shortcuts and large progress panels. It shows Unlock in both Up next and Net worth, and repeats top-level links in fallback cards. The Hub’s 13-week Pixels strip offers small standalone touch cells.

Reproduce on the audited revision with synthetic data. Compare empty/locked Hub with a seeded Hub that has a trip, continuation and bills. Then open the full agenda.

Browser baseline [27c99dc2](https://github.com/Vivekpsps3/vivek-monorepo/commit/27c99dc28370c5d2c49382bc1486faeb98c3573f). Follow the selected coastal Town design and common acceptance contract.


Verify prerequisite outcomes on fresh main. [FIXUP-01 / #579](https://github.com/Vivekpsps3/vivek-monorepo/issues/579), [NAV-03 / #388](https://github.com/Vivekpsps3/vivek-monorepo/issues/388), [HUB-01 / #243](https://github.com/Vivekpsps3/vivek-monorepo/issues/243), [HUB-05 / #247](https://github.com/Vivekpsps3/vivek-monorepo/issues/247).

## Source paths

- `apps/web/src/app/hub/hub.component.html`
- `apps/web/src/app/hub/hub.component.css`
- `apps/web/src/app/hub/up-next/up-next.component.html`
- `apps/web/src/app/hub/hub-destinations.component.ts`

## Target paths

The named source owners and affected existing browser journeys.

## Steps

1. Reproduce the observed starting state and recheck fresh main and open claims.
2. Keep Quick add, the next three actions and the destination grid primary. Show the next trip and continuation when available and a compact Finance disclosure.
3. Fold duplicate progress panels, placeholder cards and launch links into the closest useful summary or shortcut. Keep an optional small Town preview and put extended date exploration in Pixels.
4. Run the packet profiles and applicable actual-diff gates. Record successful and failure journeys with local evidence.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| FIXUP-12-A1 | Empty, locked, populated and one failed source | Open Hub at 390×844 and 1280×800 | Quick add, Up next and six usable shortcuts lead. When both Finance panels are locked there is one accessible unlock action and both states remain intelligible. | Layout captures and source-state checks |
| FIXUP-12-A2 | Agenda filter, reminder and continuation fixtures | Expand agenda, complete/undo an action and return | Filters, dates, reminder/continue routes and owner/device pins remain usable with no extra source reads. | Agenda/owner/request-count browser checks |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded UI in the affected slice | Remove duplicate launcher headings, empty filler and the interactive Hub strip after migrating its date navigation to the canonical Pixels route. | Presentation or entry replacement | List migrated consumers, removed markup/paths and surviving journeys. |

## Non-goals

Preserve the canonical editors, source ownership, data semantics, existing routes and supported user records. The content already assigned to open roadmap leaves remains in those packets.

## Test scenarios

- Compare empty/locked Hub with a seeded Hub that has a trip, continuation and bills. Then open the full agenda.
- Use 390×844 and 1280×800 in light and night. Check keyboard, touch and reduced motion, plus 320px and 200% text for shared layout changes.

## Risks

Preserve independent failures and bounded agenda behavior. SCENE-07 owns the weekly reflection link.

## Completion evidence

Record the tested SHA, exact command results, before/after acceptance captures and removal evidence in `planning/implementation/evidence/FIXUP-12.md`. Close only this leaf with the implementation PR.
