# Leaflet DOM adaptation

`leaflet.mjs` is the existing vendored Leaflet distribution, with its license retained.
It exports the library as an ES module. The SVG capability probe and radio controls
construct elements directly. Labels, string popup content, scale text, and icon
strings use `textContent`; rich popup/icon content must be supplied as DOM elements.
The application renders attribution and zoom buttons as Angular templates.

No Trusted Types policy, sanitization bypass, or HTML-string renderer is added.
The map smoke test must exercise tiles, zero coordinates, markers, popup labels,
keyboard zoom, attribution, failed tiles, retry, and route teardown under the real
suite Content Security Policy. The obsolete distribution is removed at cutover.
