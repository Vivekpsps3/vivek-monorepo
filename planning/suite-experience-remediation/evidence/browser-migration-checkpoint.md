# Browser migration checkpoint

This is a working handoff, not closure of the acceptance or deletion ledger.
The owner selected one agent; no independent agent review is claimed.

## Implemented interaction changes

- Travel and Media use canonical Angular routes. The startup hash translator
  handles old bookmarks; changing the hash after startup is no longer a router.
- Travel PTO policy, other-leave and settings key drafts now protect route and
  document exits, preserve independent/newer edits across save/retry/removal,
  and permit expired-session teardown. Fourteen browser regressions cover phone
  and desktop. See [completed draft follow-up](travel-drafts-library-queries.md).
- Travel uses native date inputs and explicit destination-change controls.
  Custom calendar-grid pointer handlers and roving-tab semantics are retirement
  candidates. Keyboard date entry, destination changes, resize, retry, retained
  titles, shortened-date cancellation and legacy PTO allocation have browser checks.
- Media uses explicit **Save changes**. Blur and status selection do not send
  silent saves. The request contains changed fields; unchanged notes do not
  overwrite another tab. Review updates retain the existing review-base check.
- Media keeps up to ten per-tab recovery drafts, scoped to the signed-in user.
  A matching-version draft restores locally; an older version is offered through
  Restore/Discard. It is not sent until Save. Invalid units are not restored.
  Session clearing removes these copies; an old component cannot write a draft
  under a new user's identity.
- The root request policy bounds ordinary requests at twelve seconds, with a
  thirty-second allowance for explicit calendar refresh. Local domain errors keep
  forms editable and clear after success; the old keyed Media retry-toast
  renderer is not part of the new interaction.
- Generic toast persistence, cap priority and paused lifetime are covered by
  shared UI Karma tests. Finance's browser matrix still covers toast layout and
  keyboard dismissal; rerun it after the latest shared changes.
- Library cards have SQL pagination, matching counts and a Favorites filter.
  Artist expansion is saved-only and recorded in the URL for Back navigation.
  Manual artist/album/song creation and independent child membership have browser
  checks. Discovery remains separate from membership.
- Season controls use native disclosures. Keyboard disclosure use, future versus
  unknown dates, catch-up and safe undo have browser checks.
- Calendars use an agenda with precision bands for Media releases. Ordinary
  Media calendar GETs use the database/cache only. Provider refresh is an explicit
  POST; unavailable refresh retains saved dates. Browser timezone is sent.
- Screenshot matrices run by default at 390, 768 and 1280 in light and dark.
  SCREENSHOT_DIR can redirect artifacts; it is not required to discover these tests.

## Current suites

- Travel: axe, blockers, focus-ring, native and screenshots under apps/travel/e2e.
- Media: bundle-m, phase0, native and screenshots under apps/media/e2e.
- Shared modal/session/request/toast regressions: root web Karma.
- Media backend: calendar, membership sort/pagination, provider/cache and existing
  review-conflict suites remain active.

Browser test counts are not a parity metric. Related autosave and keyed-toast
cases were consolidated around explicit-save, draft, cancellation and local-error
scenarios. Do not infer acceptance merely from fewer tests passing.

## Final reconciliation — 2026-10-27

All 69 original Travel/Media browser declarations now have explicit [replacement stories and interaction dispositions](browser-test-migration.json). The [113 static assertion mappings](static-test-migration.json) preserve useful app-owned pure models and record retired widget/source assertions. Native dates/disclosures, explicit Media saves, item-local persistent retry errors and agenda calendars replace the old widget mechanisms.

Optional forms, seven row Undo retries, PTO/key drafts, flights, map outages/recovery, ambiguous/lost creates, library focus/scroll, newer in-flight edits, portrait generation isolation and shared toast/theme/request policy all have current acceptance evidence in [final verification](final-verification.md). The owner approved the exact removal; all 66 proposed files and two unused packaging mirrors are retired. The retained backend `static/tests` directories are test-discovery paths, not served runtimes. Source count alone and browser case count alone are not parity metrics.
