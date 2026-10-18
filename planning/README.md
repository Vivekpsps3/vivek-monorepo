# Personal operating system brief

[`personal-operating-system.md`](./personal-operating-system.md) is the original
product brief, retained for context. It describes a broad ecosystem and media
journal vision; it is not a current implementation checklist. Current behavior
and verification are recorded in the canonical docs below.

The repository has implemented the main product areas described there:

- Finance, Travel, Media, and the public site are separate apps. The authenticated
  Hub provides app summaries; Media has its own database and authenticated,
  private user records. See [architecture](../docs/ARCHITECTURE.md),
  [project overview](../README.md), and [Media behavior](../docs/MEDIA.md).
- Media supports manual entry, public metadata search, personal ratings and one
  overall review, optional separate experiences, progress, episode tracking,
  and release awareness. See [Media behavior](../docs/MEDIA.md).
- The Finance user-journey work has an execution record for streams A–E and
  their reported verification in the [Finance UX audit](../docs/FINANCE_UX_AUDIT.md).

Some boundaries remain explicit product or provider limits: Finance uses CSV
imports today, with SimpleFIN documented as a future direction; Media provider
coverage depends on the configured keys and `MEDIA_SCRAPE_MODE`, and it does not
use Rotten Tomatoes, Metacritic, Spotify, or IGDB. Manual TV titles do not get a
TVMaze episode lookup. See [architecture](../docs/ARCHITECTURE.md) and
[Media behavior](../docs/MEDIA.md).

The brief asks for broad browser-driven end-to-end coverage across every app and
journey. Current verification docs describe backend and frontend suites,
Media's Python and static-module tests, and an optional real-browser Finance
release-cache check; they do not record that full cross-app browser acceptance
run. See [verification tiers](../docs/VERIFICATION.md). Treat that as unverified
acceptance coverage, not evidence of a specific product defect.
