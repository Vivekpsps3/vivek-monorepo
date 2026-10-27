# Finance frontend

Finance is a lazy feature of the root Angular application in `apps/web`. It owns encrypted records, vault behavior, imports and financial calculations under `src/app`, with routes mounted at `/finance/`. Shared account/session behavior belongs to the root web platform.

Run commands from the repository root:

```sh
make install
make build-frontends
make dev
npm run test:finance -- --watch=false --browsers=ChromeHeadlessCI
npx playwright test --project=finance
```

Use `npm start` alongside the API for frontend development. The root build writes `dist/web/browser`. The local `package.json` only forwards the existing `npm test --prefix apps/finance/frontend` command; it has no separate dependency installation or build.

See [Development](../../../docs/DEVELOPMENT.md), [Frontend conventions](../../../docs/FRONTEND.md), and [Security](../../../docs/SECURITY_MODEL.md).
