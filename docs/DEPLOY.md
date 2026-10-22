# Deploy

See [Operations](OPERATIONS.md) for the authoritative current release, migration,
rollback, paths, monitoring, and recovery procedures. Production is one application
image and one SQLite database. The old four-container finance-tracker stack,
production builds, and separate site-deploy step are retired. The checkout now
supplies only the tested deployment definition; it is not a live application tree.
