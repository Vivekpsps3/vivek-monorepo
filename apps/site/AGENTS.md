# Public site

This app owns public pages. The private workspace is composed by apps/web; private
tracking data and authenticated account state do not belong in public rendering.
Use the existing [public API](src/public-api.ts) when composing routes.

Reuse shared UI/tokens and existing page structure. Prefer removing an obsolete
style override to adding a stronger one. Keep keyboard/focus, responsive layout and
light/dark behavior intact.

Use [FRONTEND](../../docs/FRONTEND.md) for affected conventions and root instructions
for Site Karma plus browser journeys that open the changed page. Changing shared
styles also requires the affected consumers' gates. Do not copy the full shared
instruction set here; update this file only for durable public-site differences.
