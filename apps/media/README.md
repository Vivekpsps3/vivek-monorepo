# Media

Media is the private journal for movies, series, books, artists, albums, songs and games. Its Angular feature lives under `frontend` at `/media/`; its routers and services live under `backend` at `/media/api/`.

The root FastAPI service supplies the shared session and unified SQLite database. Personal membership, ratings, notes, progress and portrait choices remain user-owned. Public catalog metadata is separate from membership. Media works while the Finance vault is locked.

Run from the repository root:

```sh
make install
make build-frontends
make dev
./scripts/coverage-gate.sh media
node --test apps/media/backend/static/tests/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs
npx playwright test --project=media
```

The `backend/static/tests` directory is a pure-model test-discovery path, not a served frontend. The journal supports manual entry and saved reads during provider outages. Optional metadata keys stay server-side; see the root `.env.example` and provider capabilities in [Media behavior](../../docs/MEDIA.md).

See [Development](../../docs/DEVELOPMENT.md), [Backups](../../docs/BACKUP.md), and [Quality gates](../../docs/QUALITY.md).
