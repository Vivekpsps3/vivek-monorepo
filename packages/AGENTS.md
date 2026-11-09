# Shared code

[ui](ui/src/public-api.ts) owns shared Angular controls and interaction contracts;
[browser](browser/src/index.ts) owns browser utilities;
[auth](auth/src/index.ts) exposes auth utilities. Check the existing public entry
before creating another helper or adding a cross-app import.

Share repeated behavior with actual consumers. Keep app validators, financial math,
provider identity and persistence policy with their domain. A new shared abstraction
must replace real copies in the same PR and have a bounded public API and clear
disposal/error ownership. Use a plain function before a configurable framework.

For UI changes, preserve accessible names, linked errors, keyboard/focus return,
dialog scroll, hit targets and theme tokens. Resolve cascade ownership instead of
stacking specificity overrides. Migrate consumers and remove their old selectors.
A shared selector change requires inspecting actual consuming apps.

Public reexports and discovery adapters can be compatibility boundaries. Verify
config, lazy, test and downstream consumers before removing one. In particular,
the Pixels scoring test import under ui/src loads the owned suite into Karma.

Use root shared UI/consumer test gates. Read [FRONTEND](../docs/FRONTEND.md) or
[DESIGN_GUIDE](../docs/DESIGN_GUIDE.md) only for affected UI behavior.
