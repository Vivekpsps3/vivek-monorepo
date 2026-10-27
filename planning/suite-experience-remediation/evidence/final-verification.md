# Final implementation vetting — 2026-10-27

The implementation and approved runtime retirement are complete in the working tree on `suite-experience-remediation`. All 66 proposed legacy files and two unused packaging symlinks are absent; useful models and meaningful regressions remain in app-owned frontends and the canonical suites. The owner’s explicit approval resolved the previous deletion block. Final affected browser verification passed all 177 cases without skips or retries; the integrated change is open as [PR #22](https://github.com/Vivekpsps3/vivek-monorepo/pull/22). No production deployment is authorized or performed.

## Fixes found during the final audit

- Backend display rounding no longer reads retired frontend JavaScript. Two-decimal defaults and explicit precision overrides are backend-owned, while four-decimal stored PTO values are unchanged. The full coverage gate reproduced the hidden dependency before the fix; `test_fmt_days_has_no_frontend_file_dependency` now forbids such file reads.
- Trip-create identity is a nullable database column with a unique user/key index, replacing the process-only dictionary. Completed retries survive reopen/restart; concurrent requests insert one trip; users do not share keys; rollback does not reserve a key; deleted trips can be recreated. Revision `site_trip_create_attempt_v1` is expand-only.
- Database dependencies consistently use function scope. A deterministic ASGI response-start test first observed zero committed trips at a 201 response, then passed after the fix. Commit-time failure now returns 500 and rolls back. The real HTTP dev seed subsequently created data for all six users without the intermittent follow-up 404.
- Unused server `install/current` database publication is removed. Tests use their actual app database. Injected engines remain caller-owned, and factory-owned engines dispose even when startup checks fail. The login decoy secret uses the actual request database, survives restart, and no longer depends on Finance's historical globals.
- Root `/` now prerenders Home through the public feature before matching the private empty-path layout. Public pages have meaningful HTML and zero private API requests. Explore-link accessible names include their visible text. The existing `/blog` bookmark has an explicit `/home` redirect.
- Travel row removal retains Undo and failed-restore Retry for destination, transport, activity, parking, note, reminder and cost. Tests compare restored personal fields, excluding regenerated row/timestamp identity. Parking exposes its necessary flag. Newer PTO edits survive an in-flight save and remain unsaved until the next submit.
- Media Library captures the actual scroll offset at navigation time, rather than a possibly delayed scroll event, and restores after router scrolling and loaded content. Existing heading/focus/scroll checks passed twenty repetitions each (40 cases); their thresholds were not lowered.
- A new portrait-race story reproduced an album note being saved to the previous artist after its late portrait response. Auxiliary photo/link requests now cancel on item changes and check the item generation. Delete/link confirmation and completion also retain their target generation. The album draft and destination identity stay intact.
- The real-account challenge test consumes the intercepted response before forwarding it to the browser. The manual-music test waits for the destination song heading before editing shared form controls; its save and artist-isolation assertions stay intact.
- Offline Unicode-title migration planning now uses a read-only source snapshot and emits literal backfill SQL. It does not try to fetch rows from Alembic's offline connection. Planning leaves source bytes unchanged.
- The dev seed uses the root built frontend and an artist default supported by both historical and current APIs. The adoption harness chooses historical `main:app` or `production_app --factory` from the source tree. Exact original-value comparison replaces the obsolete assumption that a lossless backfill cannot add catalog/membership rows.

## Local verification

| Check | Result / log |
| --- | --- |
| Full Python coverage | Finance 116 / 84.52%; Travel 74 / 85.10%; Media 138 / 79.45%; server 73 / 65.07%. All original floors unchanged. `/tmp/suite-retirement-gates.log` |
| Karma | Finance 383, public 15, root/shared 92 passed. Root's four new tests cover legacy theme migration, precedence, unavailable storage and listener cleanup. `/tmp/suite-retirement-gates.log` |
| Node and fast scripts | 46 retained domain/shared/auth Node tests, 38 Python script checks and 7 fast Node checks passed. All 113 original static assertions have recorded retained/replaced dispositions; none is silently skipped. `/tmp/suite-retirement-gates.log` |
| Full browser matrix | 177 passed, zero skipped, zero retries after retirement. `/tmp/suite-retirement-browser.log`. One root config and harness; no retries or screenshot opt-in. |
| Portrait race repetition | 20 passed, no skips. The story waits for the destination level-one heading; the old artist also has an album card heading. `/tmp/suite-retirement-portrait-repeat.log` |
| Scroll race repetition | 40 passed, no skips. `/tmp/suite-final-scroll.log` |
| Manual music repetition | 20 passed, zero skipped. `/tmp/suite-final-music.log`; only destination-readiness waiting changed. |
| Quality | Python format/Ruff/mypy, web ESLint and all configured TypeScript checks passed. Allowances did not rise relative to `origin/main`. `/tmp/suite-retirement-gates.log`, `/tmp/suite-retirement-browser-types.log` |
| Production build | One web build, 5 public prerenders; 529.93 kB initial / 140.33 kB estimated transfer; 5.499-second sample. `/tmp/suite-retirement-build.log` |
| Image / assembled checks | Built `personal-site:development`; production routes, schema, auth, CSRF, isolation, account deletion, metrics and CSP passed. `/tmp/suite-retirement-image.log` |
| Real image browser | Public/local crypto, bootstrap/login, private SPA navigation, real Leaflet DOM, allowed artwork, origin-only tile Referer, negative script/HTML probes passed. `/tmp/suite-retirement-image-browser.log` |
| Seeded adoption / upgrade | Both modes and batch-recreate proof passed; 2,521 original rows preserved per mode, 36 proven catalog additions and 36 memberships; integrity/FKs/drift/smoke passed. [Portable results](seeded-preservation.json), `/tmp/suite-retirement-adoption.log` |
| Developer seeding | 6 users, 1,200 encrypted records, 60 trips, 108 initial Media entries and nested music fixtures through real handlers. `/tmp/suite-final-dev-seed.log` |
| Dependency audits | `npm audit --omit=dev --audit-level=high`: 0 vulnerabilities; pinned backend `pip-audit --disable-pip --no-deps`: no known vulnerabilities. `/tmp/suite-retirement-npm-audit.log`, `/tmp/suite-retirement-pip-audit.log` |
| CI validation | CI/deploy YAML and embedded shell syntax passed. Identity model changes trigger schema rehearsal; cross-app acceptance and retained shared Node contracts run in CI. |

The browser matrices include 390/768/1280 light/dark captures, with additional 320/1440 navigation/axe coverage, locked-vault Travel/Media access, forced colors, reduced motion/transparency and 200% content zoom. Sampled Hub, Media library, Travel split/map, drafts and Finance failure/planning screenshots were inspected. Synthetic map tiles establish DOM/policy behavior, not live provider availability. No exhaustive defect-free or independent-agent review claim is made.

## Architecture, metrics and evidence

- Root npm installation/lock/build/bootstrap, one router, app-owned lazy features, suite-owned account/session and one explicit server factory are implemented. Domain API prefixes and useful aliases remain. Historical migration identifiers remain unchanged.
- Finance-only validation moved to Finance; browser packages retain neutral date/money/crypto primitives. Identity coverage follows relocated source instead of omitting it.
- [Toolchain/bundle metrics](final-toolchain-metrics.json), [build-loop samples](developer-loop.json), [source counts](final-source-metrics.json) and the existing [library query measurements](library-page-queries.json) separate moved code, installed mechanisms and required product behavior. The measured 24-card mixed library path fell from 319 SELECTs to 5; books from 197 to 2. Before/after build samples are descriptive warm-cache measurements, not a benchmark claim.
- [Actual runtime retirement](actual-runtime-removal.json) records the approved 66-file removal and model destinations. Two obsolete packaging symlinks were removed without claiming source-line savings. Source totals are 103,220 before and 95,953 after: **7,267 fewer lines**, including tests and vendored source by the declared suffix method. Gross retired runtime lines are reported separately from model moves and the baseline net difference.
- [Static assertion reconciliation](static-test-migration.json) maps all 113 original assertions; [browser reconciliation](browser-test-migration.json) maps all 69 original Travel/Media declarations. Custom calendar widgets become native date controls; Media autosave becomes explicit Save with owned recovery drafts; bespoke retry toasts become local errors plus the shared toast contract. These are recorded interaction changes, not silently skipped stories.
- [Requirements](requirement-acceptance.md) links R01–R34 to concrete acceptance suites and records the final disposition.

## Delivery checkpoint

All approved removal paths are absent, all model imports resolve without the retired packaging mirrors, and the full local Python/Karma/Node/lint/type/build/image/migration gates pass. Applied migration history, meaningful URL compatibility, encryption and unchanged quality floors remain. The final 177-case browser rerun passed. [PR #22](https://github.com/Vivekpsps3/vivek-monorepo/pull/22) is open; all 34 task rows are closed. CI is the second run, and no merge or deployment was performed.

The first post-retirement browser matrix exposed two test/environment failures without changing product assertions: the portrait regression had matched a saved-child heading before the destination page loaded, and Docker network changes aborted the new Finance tab’s initial JavaScript downloads with `ERR_NETWORK_CHANGED`. The portrait test now waits for the actual level-one album heading and passes twenty repetitions. The full matrix is rerun after Docker work finishes, with no retries enabled and no fixture error suppressed. The failed trace/log remains at `/tmp/suite-retirement-browser-before-readiness.log`.

Production image validated: `sha256:4ac6e4d47a74ab917497b2fa3ffe9976343335aa8b2d5341002811c26a9c19eb`. The local bundle’s content release is `98f6aff18e92c21d1f4f0e57217a09b4ee825fbee8b4e15e4fca7099ecc0573f`. No live-provider uptime, exhaustive defect-free behavior or independent-agent review is claimed. Representative screenshots are sampled; synthetic tiles test DOM/policy behavior.
