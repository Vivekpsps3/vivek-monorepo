# OPS-05 — implementation evidence

- Leaf issue and parent(s): [OPS-05](../completed/issues/OPS-05.md) / [#276](https://github.com/Vivekpsps3/vivek-monorepo/issues/276). Parent [#125](https://github.com/Vivekpsps3/vivek-monorepo/issues/125) stays open. Real recipient activation stays [#277](https://github.com/Vivekpsps3/vivek-monorepo/issues/277).
- Agent/context, branch/worktree: Grok implementer, branch `agent/ops-05`, worktree `/home/vivek/.grok/worktrees/deployments-vivek-monorepo/subagent-01a1ed4c-ffd1-7c22-9d50-0f605ae752ad`.
- Base main SHA, current tested SHA: base `dde90b7346909e78464aa6ae9814cb3b9ebe4ccd`. Tested implementation SHA `c0cae0b12e53877809bb30b77fd56429c9644f0f`. Local gates below ran on that tree before this evidence commit. No real recipient was contacted.
- Fresh-main/prerequisite/active-PR checks: OPS-01 merge `8b9f0998abecac065887230a8e1a2257f6b2a496` and OPS-03 merge `9620ebb7a0b31027acb892f90e75d46a02bd6447` are ancestors of the base. Their off-host adapter, single backup scheduler, and routing guards are still in source; `scripts/test_backup_offhost.py` and `ops/actions-runner/test_routing.py` passed on this tree. Claim comment: https://github.com/Vivekpsps3/vivek-monorepo/issues/276#issuecomment-6970976539. No competing open PR was touching the monitor files.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| A01 | Synthetic unhealthy, unreachable, expired TLS, and stale backup each reach `FakeTransport` once with `source=independent`. A second identical failure sends zero requests. Recovery sends `state=recovered` once and drops the failure word. Heartbeat liveness repeats only after recovery and does not use the webhook URL. A fake HTTPS opener returning 503 does not copy the response body. Expiring TLS reaches both webhook and heartbeat once, then a later clear heartbeat goes only to the heartbeat URL. | PASS | `apps/server/tests/test_monitor_alerts.py`: `test_a01_webhook_failures_reach_transport_once`, `test_a01_recovery_does_not_keep_the_failure`, `test_a01_heartbeat_failure_recovery_and_liveness`, `test_a01_fresh_webhook_sends_nothing`, `test_a01_fake_https_probe_ignores_the_body`, `test_both_channels_reject_partial_configuration`. SHA `c0cae0b12e53877809bb30b77fd56429c9644f0f`. |
| A02 | Mode `off` reports `not_configured` and sends nothing. Dry-run reports `dry_run`, plans the failure, and sends nothing. An empty webhook reports `missing_webhook`. Unconfigured checks are not a healthy heartbeat. `python -m apps.server.monitor --once` prints the same statuses with `sent` 0. `urllib.request.urlopen` and `socket.create_connection` are patched to fail if called. | PASS | `test_a02_off_and_dry_run_do_not_touch_the_network`, `test_a02_unconfigured_checks_are_not_a_healthy_heartbeat`, `test_a02_command_prints_explicit_offline_status`. SHA `c0cae0b12e53877809bb30b77fd56429c9644f0f`. |
| A03 | A transport exception that contains the synthetic URL, token, and note is retried three times (`sleep` 0.25 then 0.5), then suppressed on the next tick. Logs and the report omit those markers. `render_report` redacts a configured URL, token, and URL password. HTTP 500 then 204 stops at the second try. `SITE_ALERT_MAX_ATTEMPTS=99` and `SITE_ALERT_TIMEOUT_SECONDS=99` clamp to 3 and 10. One allowed attempt stays one request. `repr(AlertConfig)` omits the token and URL. | PASS | `test_a03_failure_logs_are_redacted_and_retries_are_bounded`, `test_a03_timeout_attempts_and_http_status_stay_bounded`, `test_missing_heartbeat_invalid_token_and_bad_fixture_send_nothing`, `test_both_channels_reject_partial_configuration`. SHA `c0cae0b12e53877809bb30b77fd56429c9644f0f`. |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Duplicate numeric alert thresholds in `ops/monitoring/site-alerts.yml` (`7500`, `1209600`, `site_probe_success == 0`, backup age, TLS remaining) | Prometheus rule file only. The maintenance process did not read those expressions. | `classify_readiness`, `classify_tls`, and `classify_backup` in `apps/server/monitor.py`. Rules now match `site_check_state` labels and set `delivers: "false"`. | Numeric copies removed. Error, latency, and exporter-missing rules retained and marked as non-delivering. | `test_deletion_rules_and_docs_distinguish_local_and_remote` |
| Failed TLS probe published as `site_tls_expiry_timestamp_seconds 0` | `/metrics` scrape | `site_check_state{check="tls",state="unknown"}`. A known expiry still publishes the timestamp. | The zero timestamp is removed so unknown is not a 1970 expiry. | `test_local_metrics_do_not_invent_a_certificate_date_or_dump_payloads` |
| Docs that could be read as paging already working | OPERATIONS monitoring section and SRE follow-up row 59–66 | Same documents. The external-destination checkbox stays open. | Wording now separates local probes, synthetic proof, and OPS-06 activation. | Same deletion test. Phrase `notification destination is configured` is absent. |
| Unreachable `both` length check after the missing-URL returns | None | The earlier `missing_destination`, `missing_webhook`, and `missing_heartbeat` returns | Removed. Partial configuration still sends nothing. | `test_both_channels_reject_partial_configuration` |

- Candidate class and protected counterexamples: duplicate rules and fabricated paging claims. Protected: one maintenance process, off-host gauges from OPS-03, TD-33 redacted diagnostics, signing and AES-GCM untouched.
- Comparison base SHA and full replacement closure: `dde90b7346909e78464aa6ae9814cb3b9ebe4ccd`. Closure: `apps/server/monitor.py`, `apps/server/tests/test_monitor_alerts.py`, `ops/monitoring/site-alerts.yml`, `compose.yml`, `docs/OPERATIONS.md`, `docs/SRE-FOLLOWUPS.md`, `apps/server/AGENTS.md`, `Makefile` (test discovery only), `quality/ruff-baseline.txt`, `quality/mypy-baseline.txt`, this evidence file.
- Production added/deleted/moved: `apps/server/monitor.py` 170 → 963 lines (`+829 / -36`). `compose.yml` 112 → 117 (`+5`). `ops/monitoring/site-alerts.yml` 34 → 48 (`+29 / -15`). Moved 0. Net production about +812 lines. This is the alert path, not a simplification claim.
- Independent equivalent implementations before/after: one `backup_loop` and one `/metrics` handler before. The same process remains. Classifiers are shared. Local probes and webhook/heartbeat delivery do not call each other.
- State/cache owners and public entry points before/after: process memory `_PROCESS_CHECKS` and `_PROCESS_NOTE` only. No new database, file, daemon, or ledger. Entry points remain `python -m apps.server.monitor` and `--once`.
- Remaining old symbol/path search: `def backup_loop(` once, `def classify_readiness(` once, `def classify_tls(` once, `def classify_backup(` once, one Compose monitor command. `deliver_offhost` and `offhost_loop` are absent from the monitor. Compose alert mode defaults to `off` with empty URL variables.
- Follow-up change: which production files and independent policy owners now need editing: a real recipient is OPS-06. It sets the existing `SITE_ALERT_*` variables and records a real delivery. It does not add another monitor.
- Tests/docs/generated changes separately: `apps/server/tests/test_monitor_alerts.py` is 1317 lines. `docs/OPERATIONS.md` `+11 / -10`. `docs/SRE-FOLLOWUPS.md` `+7 / -4`. `apps/server/AGENTS.md` `+5`. Makefile `+1 / -1`. Ruff baseline `-1` (retired `SIM117`). Mypy baseline `-2` (retired `arg-type` and `index`). No bundle is committed.
- Net production delta and specific reviewed safety/compatibility exception if positive: the growth is bounded classification, redaction, retry, and opt-in delivery. Default mode `off` still serves metrics and runs the backup loop without opening an alert socket.
- No behavior/data/meaningful assertion silently removed: off-host gauges, hourly backup command, and probe success/duration metrics remain. Unknown TLS no longer emits a zero expiry. A bad fixture reports `bad_fixture` and does not page. Real unknown still pages once when delivery is configured.

## Verification

| Command | Tested revision | Result |
| --- | --- | --- |
| `python3 -m unittest apps.server.tests.test_monitor_alerts scripts.test_backup_offhost scripts.test_backup_retention ops.actions-runner.test_routing` | `c0cae0b12e53877809bb30b77fd56429c9644f0f` tree before this evidence file | PASS. Alert tests 24. Related suites included in `make test-fast` (135 unittest tests OK). |
| `make test-fast` | same tree, with the worktree `.venv` on `PATH` | PASS. Doc paths OK. Planning validation 114 packets. |
| `make lint-python` | same tree | PASS. Ruff 90 findings match the baseline. Suppressions 6 match. |
| `make typecheck-python` | same tree | PASS. Mypy 80 findings match the baseline. |
| `./scripts/coverage-gate.sh server` | same tree | PASS. 396 passed. Total coverage 79.38%. Floor 61.53% held. The suggested pin to 78.38% was not applied. Perf gate passed. |
| `make docker-build` | Image build-arg `SITE_RELEASE` was `dde90b7346909e78464aa6ae9814cb3b9ebe4ccd` because the product commit did not exist yet. The context copied this tree's `apps/server/monitor.py`. | PASS. |
| `make test-suite-routes` | That image | PASS. Unified checks passed. |
| `make db-validate-seeded` | That image. Adopt and upgrade. Upgrade from `dde90b7346909e78464aa6ae9814cb3b9ebe4ccd`. | PASS. Adopt action `stamp_and_upgrade`. Upgrade action `current`. Schema diff empty. Smoke routes 200. Both backup runs printed `"offhost": "off"`. |

`python3 planning/implementation/plan.py launch OPS-05` is the source of the ops and server_back commands. Coverage was not lowered. No real webhook, heartbeat, or private URL was called.

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/503 (`Closes #276`). Parent #125 and roadmap #134 are referenced and stay open. #277 is mentioned and stays open.
- Roadmap #134 append-only status-note URL: not posted yet. The archive PR has to merge first.
- Merged/activation status: not merged when this note was written. Not deployed. No real recipient, token, or private URL was configured or contacted. Synthetic fixtures and `FakeTransport` are the proof. OPS-06 remains the activation evidence.
- Remaining external prerequisites or approved scope decisions: an owner-supplied webhook or heartbeat URL, a separate token, and a real delivery recorded under OPS-06. Compose defaults stay `off` and empty.
- Next actor: CI on the PR, then squash-merge of this leaf only. Archive OPS-05 after that merge SHA is known. Do not close #125 or #277.

No unstated decision from this context is necessary to continue.
