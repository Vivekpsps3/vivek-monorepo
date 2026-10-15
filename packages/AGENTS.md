# Shared packages

Follow the [root handoff](../AGENTS.md). These packages are consumed by Finance and the public site through TypeScript path aliases.

- packages/auth exports browser-side passwordless signing-key helpers. Keep passphrases and private keys in the browser; see [SECURITY_MODEL.md](../docs/SECURITY_MODEL.md).
- packages/browser exports browser-only date, formatting, CSV, and low-level Web Crypto helpers shared by apps and packages.
- packages/ui owns shared Angular primitives, public exports, and CSS tokens. Preserve the public-api exports and token names used by consumers.
- Check Finance and site imports before changing an export, selector, token, or function signature. Prefer compatible additive changes.
- Package manifests define no standalone test or build scripts. Validate changes through the consuming app or apps.
