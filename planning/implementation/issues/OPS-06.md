# OPS-06 — Record real off-host restore and independent alert activation evidence

- Stable key: `OPS-06`
- GitHub leaf: [#277](https://github.com/Vivekpsps3/vivek-monorepo/issues/277)
- Parents: [#125](https://github.com/Vivekpsps3/vivek-monorepo/issues/125)
- Kind: `operational-evidence`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: `OPS-04`, `OPS-05`
- Conflict groups: `runtime-activation`, `operations-docs`
- Verification profiles: `docs`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

Actual configured backup destination and alert recipient are proven usable; absent prerequisites keep this issue visibly pending.

Close the operational evidence gap only after owner-supplied configuration exists, through a redacted evidence PR.

## Requirements

- #125 acceptance1–4 actual configuration/transfer/restore/independent alert evidence and host/reboot/replacement objectives.
- TD-34 runtime evidence distinct from code success; TD-36 update/protection evidence if previously unavailable.

## Source paths

- `docs/OPERATIONS.md`
- `docs/BACKUP.md`
- `docs/SRE-FOLLOWUPS.md`
- `planning/implementation/templates/evidence.md`

## Target paths

- `planning/implementation/evidence/OPS-06.md`
- `docs/OPERATIONS.md`
- `docs/SRE-FOLLOWUPS.md`

## Steps

1. Before any external action, verify owner-provided destination, separately held key, recipient, runtime access and action authorization are available; do not request/publish secrets in an issue.
2. Use merged code to perform the authorized first off-host encrypted transfer and an independent disposable restore; record redacted identifiers/counts/timings and observed RPO/RTO.
3. Perform only the configured/authorized test alert and independently verify recipient delivery; distinguish synthetic fixture success from actual activation.
4. Where authorized and feasible, record exact tested release/CSP/reboot/replacement-host checks; list any unperformed obligation by owner and prerequisite rather than filling it with a claimed pass.
5. Publish a redacted evidence PR. Close the leaf/parent only when every retained activation row has evidence; otherwise keep state external-prerequisite with precise outstanding items.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| A01 | Owner-configured destination/key/recipient and authorization | real transfer/disposable restore/test alert execute | redacted independent evidence proves recovery and notification without exposing credentials/private data | observed operation output and recipient confirmation |
| A02 | Any required runtime prerequisite is absent | an agent evaluates launch readiness | it does not execute external mutations or close the issue; missing prerequisite and next actor are explicit | pending evidence row and remote issue status |
| A03 | Evidence PR is reviewed | runtime claims are checked | every claimed success has an actual command/outcome/time and synthetic-only work is labelled | reviewer evidence matrix |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Stale activation/availability claims in operating docs | Replace with dated observed facts and explicit pending obligations; no new controller/backup history state. | required | Evidence distinguishes code, dry-run, deployment and independently verified restore/alert. |

## Non-goals

- Do not change the signing/AES-GCM protocol or move private plaintext server-side.
- Do not add a second ledger, state store, background daemon or generic framework.
- Do not claim external activation, deployment or merged completion without evidence.

## Test scenarios

- Actual transfer/decryption/restore counts and measured time
- Authorized alert independently received
- Missing prerequisites remain pending, no secrets in artifacts

## Risks

- This issue cannot be made ready merely by time passing or a successful code PR.

## Completion evidence

- Issue-specific acceptance matrix with test/artifact for every row, exact commands and source/base revision.
- Deletion ledger: removed vs moved vs necessary new production code, surviving consumers and compatibility proof.
- One reviewable PR closing this leaf only, with parent references and a fresh roadmap status note.

## External prerequisites

- Owner-supplied off-host destination and separately held recovery key available privately.
- Configured external alert recipient plus explicit authorization for test message.
- Authorized runtime/recovery environment access and disposable target; no production overwrite.

Do not start this leaf until the external prerequisites exist. A code adapter or dry run does not close it.
