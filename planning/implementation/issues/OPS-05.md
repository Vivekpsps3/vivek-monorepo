# OPS-05 — Deliver independent-monitor integrations with synthetic alert proof

- Stable key: `OPS-05`
- GitHub leaf: [#276](https://github.com/Vivekpsps3/vivek-monorepo/issues/276)
- Parents: [#125](https://github.com/Vivekpsps3/vivek-monorepo/issues/125)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Plan source: [amendment #286](https://github.com/Vivekpsps3/vivek-monorepo/pull/286). Use its branch if the amendment is not yet on main.
- Dependencies: `OPS-01`, `OPS-03`
- Conflict groups: `monitoring`, `operations-docs`
- Verification profiles: `ops`, `server_back`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

Monitoring code can detect the intended failures independently and demonstrate notification formatting without unsolicited messages.

Wire bounded readiness/TLS/backup-freshness checks to configurable heartbeat/webhook integrations using safe fixtures.

## Requirements

- #125 accepted independent HTTPS/readiness/TLS/backup-age monitors and notification delivery.
- TD-33 bounded redacted diagnostics; real recipient activation owned OPS-06.

## Source paths

- `apps/server/monitor.py`
- `ops/monitoring/site-alerts.yml`
- `docs/OPERATIONS.md`
- `docs/SRE-FOLLOWUPS.md`
- `compose.yml`

## Target paths

- `apps/server/monitor.py`
- `ops/monitoring/site-alerts.yml`
- `docs/OPERATIONS.md`
- `scripts/ (fake heartbeat/webhook fixture if required)`

## Steps

1. Define independent checks and bounded label/status envelopes for readiness, TLS expiry and backup age; keep local probes and external detection explicitly different.
2. Add configurable existing heartbeat/webhook integration with dry-run/test transport and bounded timeout/retry; never hardcode a recipient, token or private URL.
3. Exercise unhealthy/unreachable/expired/stale-backup/fresh states and recovery without reading private domain payloads.
4. Prove redaction, no duplicate spam on repeated failure and honest missing-configuration state.
5. Remove contradictory monitor/paging success claims and keep activation evidence separate.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| A01 | Synthetic unhealthy/unreachable/TLS-expiry/stale-backup cases | independent fixture checks run | right bounded failure/recovery status reaches fake notification transport once as specified | fake HTTPS/heartbeat/webhook integration test |
| A02 | No destination or dry-run configured | monitoring command runs | no real message is sent and configuration/activation status remains explicit | zero-network notification count assertion |
| A03 | Secret/private URL marker in config and transport failure | logging/retry/reporting occurs | no token/feed/credential/private marker appears and retries remain bounded | redaction and timeout tests |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Parallel local/independent monitor logic and fabricated paging claims | Share status primitives, retain independence of execution and retire unused duplicate rules/claims. | required | Failure mapping, request counts and docs distinguish local/remote evidence. |

## Non-goals

- Do not change the signing/AES-GCM protocol or move private plaintext server-side.
- Do not add a second ledger, state store, background daemon or generic framework.
- Do not claim external activation, deployment or merged completion without evidence.

## Test scenarios

- Readiness/unreachable/TLS/age/recovery mapping
- Dry-run and missing configuration send zero real alerts
- Secret redaction, bounded retry and duplicate suppression

## Risks

- A configured probe or notification adapter is not verified delivery; retain pending external recipient/access prerequisites without inventing activation evidence.

## Completion evidence

- Issue-specific acceptance matrix with test/artifact for every row, exact commands and source/base revision.
- Deletion ledger: removed vs moved vs necessary new production code, surviving consumers and compatibility proof.
- One reviewable PR closing this leaf only, with parent references and a fresh roadmap status note.
