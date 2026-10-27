# Public site feature

The portfolio is a lazy feature of the root Angular application in `apps/web`. It shares the root installation, build and router with the private workspace. Public content is prerendered at `/`, `/home`, `/work`, `/about` and `/secrets` into `dist/web/browser`.

Run `make install`, `make build-frontends` and `make dev` from the repository root. Use `npm start` alongside the API for frontend editing at http://127.0.0.1:4200. Run public unit tests with `npm run test:site -- --watch=false --browsers=ChromeHeadlessCI`; `npm test --prefix apps/site` forwards to that suite.

The `/secrets` demo uses ECDH and AES-GCM locally in the browser. It has no chat server and does not access Finance data.

Content ownership:

- `src/app/app.routes.ts`: public route titles and descriptions.
- `src/app/app.component.*`: public layout and navigation.
- `src/app/components/`: Home, Work, About and local encryption demo.
- `src/app/services/ecdh.service.ts`: browser key exchange and encryption.
- `src/styles.css`: public feature styles over the shared UI tokens.
- `apps/web/routes.json`: server route manifest, including `/blog` → `/home` compatibility.

See [Development](../../docs/DEVELOPMENT.md), [Frontend conventions](../../docs/FRONTEND.md), and [Verification](../../docs/VERIFICATION.md).
