# Travel

Travel owns trip planning, PTO, optional transport/flight lookup, maps, notes and budgets. Its Angular feature lives under `frontend` at `/travel/`; its routers and services live under `backend` at `/travel/api/`.

The root FastAPI service supplies the shared session and unified SQLite database. Development state is `.local/data/site.db`; production state and backups follow the root operations workflow. Finance's encrypted records and vault remain separate from Travel behavior. Travel works while the Finance vault is locked.

Run from the repository root:

```sh
make install
make build-frontends
make dev
./scripts/coverage-gate.sh travel
node --test apps/travel/backend/static/tests/*.test.mjs
npx playwright test --project=travel
```

The `backend/static/tests` directory is retained for pure-model test discovery; it is not a served frontend. Flight lookup uses an optional server-side `FLIGHTAWARE_API_KEY` or a personal key saved in Settings. Manual entry remains available without it.

See [Travel behavior](../../docs/TRAVEL.md), [Development](../../docs/DEVELOPMENT.md), [Backups](../../docs/BACKUP.md), and [Quality gates](../../docs/QUALITY.md).
