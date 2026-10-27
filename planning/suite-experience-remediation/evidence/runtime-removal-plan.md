# Approved legacy runtime removal

**Executed after explicit owner approval on 2026-10-27.** All 66 listed paths are absent. [Actual removal record](actual-runtime-removal.json) records hashes, pure-model destinations and the two subsequently retired packaging symlinks. Final verification is in [the release evidence](final-verification.md). The proposal below preserves the reviewed scope.

The user requested completion of the remaining remediation tasks. DEL-06/07 and DEL-ALL require retiring the old Travel/Media string renderers, hash routers, and HTTP/session/theme/toast dispatchers after native behavior parity. They are no longer served by the root FastAPI app.

This proposal removes only the files listed below. A byte-for-byte snapshot of all runtime and test inputs is saved at `/tmp/suite-runtime-before-removal.tar.gz`, with hashes in `/tmp/suite-runtime-before-removal.json`. This preserves the uncommitted edits as well as tracked versions.

Before removal, pure date/composer/flight/format/validation/restore models and their meaningful assertions are moved to the app-owned frontends. Native date inputs, Angular routing, explicit Media saves, native disclosures and the agenda replace old widget-specific source assertions; exact story replacements are recorded in the test migration manifest. Shared date/week modules and applied migration history stay. The Leaflet vendor copy under Travel frontend is retained.

Replacement checks: all Travel browser stories including map recovery, optional forms and row Undo; all Media browser stories including draft races, errors, photos, catch-up and library recovery; root/shared Karma; retained Node models and contrast checks. Gates remain unchanged.

Files proposed for deletion:

- `apps/media/backend/static/app.css`
- `apps/media/backend/static/favicon.svg`
- `apps/media/backend/static/index.html`
- `apps/media/backend/static/modules/api.mjs`
- `apps/media/backend/static/modules/app.mjs`
- `apps/media/backend/static/modules/format.mjs`
- `apps/media/backend/static/modules/guard.mjs`
- `apps/media/backend/static/modules/icons.mjs`
- `apps/media/backend/static/modules/score.mjs`
- `apps/media/backend/static/modules/search-groups.mjs`
- `apps/media/backend/static/modules/shell.mjs`
- `apps/media/backend/static/modules/views.mjs`
- `apps/media/backend/static/tests/api.test.mjs`
- `apps/media/backend/static/tests/contrast.test.mjs`
- `apps/media/backend/static/tests/guard.test.mjs`
- `apps/media/backend/static/tests/score.test.mjs`
- `apps/media/backend/static/tests/search-groups.test.mjs`
- `apps/media/backend/static/tests/shell.test.mjs`
- `apps/media/backend/static/tests/suite.test.mjs`
- `apps/media/backend/static/tests/views.test.mjs`
- `apps/travel/backend/static/app.css`
- `apps/travel/backend/static/favicon.svg`
- `apps/travel/backend/static/index.html`
- `apps/travel/backend/static/modules/actions/flight.mjs`
- `apps/travel/backend/static/modules/actions/forms.mjs`
- `apps/travel/backend/static/modules/actions/ui.mjs`
- `apps/travel/backend/static/modules/api.mjs`
- `apps/travel/backend/static/modules/app.mjs`
- `apps/travel/backend/static/modules/calendar-model.mjs`
- `apps/travel/backend/static/modules/copy.mjs`
- `apps/travel/backend/static/modules/decisions.mjs`
- `apps/travel/backend/static/modules/feedback.mjs`
- `apps/travel/backend/static/modules/helpers.mjs`
- `apps/travel/backend/static/modules/labels.mjs`
- `apps/travel/backend/static/modules/messages.mjs`
- `apps/travel/backend/static/modules/restore.mjs`
- `apps/travel/backend/static/modules/route-parser.mjs`
- `apps/travel/backend/static/modules/router.mjs`
- `apps/travel/backend/static/modules/screens.mjs`
- `apps/travel/backend/static/modules/state.mjs`
- `apps/travel/backend/static/modules/states.mjs`
- `apps/travel/backend/static/modules/validate.mjs`
- `apps/travel/backend/static/modules/views/calendar.mjs`
- `apps/travel/backend/static/modules/views/composer.mjs`
- `apps/travel/backend/static/modules/views/home.mjs`
- `apps/travel/backend/static/modules/views/new-trip.mjs`
- `apps/travel/backend/static/modules/views/pto.mjs`
- `apps/travel/backend/static/modules/views/settings.mjs`
- `apps/travel/backend/static/modules/views/trip.mjs`
- `apps/travel/backend/static/tests/blockers.test.mjs`
- `apps/travel/backend/static/tests/bundle.test.mjs`
- `apps/travel/backend/static/tests/decisions.test.mjs`
- `apps/travel/backend/static/tests/runtime.test.mjs`
- `apps/travel/backend/static/tests/toast.test.mjs`
- `apps/travel/backend/static/tests/tr4.test.mjs`
- `apps/travel/backend/static/tests/week-header.test.mjs`
- `apps/travel/backend/static/vendor/images/layers-2x.png`
- `apps/travel/backend/static/vendor/images/layers.png`
- `apps/travel/backend/static/vendor/images/marker-icon-2x.png`
- `apps/travel/backend/static/vendor/images/marker-icon.png`
- `apps/travel/backend/static/vendor/images/marker-shadow.png`
- `apps/travel/backend/static/vendor/leaflet.css`
- `apps/travel/backend/static/vendor/leaflet.js`
- `packages/browser/runtime/dom.mjs`
- `packages/browser/runtime/theme.mjs`
- `packages/browser/runtime/toast.mjs`
