# Personal site

One public site with a portfolio, shared sign-in, and private Finance, Travel,
and Media tools. One FastAPI service and one SQLite database run behind the
existing nginx-edge TLS proxy. Both frontend builds ship in the same image.
Finance data remains encrypted in the browser; combining databases does not
decrypt or transform financial records.

- `/` — public portfolio, with an Apps link
- `/hub` — shared private home
- `/finance/`, `/travel/`, `/media/` — tools
- `/auth/login` — shared sign-in

```sh
make install
make build-frontends
make dev
```

Open http://127.0.0.1:8000. Development state is under `.local/`, separate from
production. `make test` runs the regression suites; `make docker-build` builds
the production image; `make test-suite-routes` checks the assembled release.

[Operations and recovery](docs/OPERATIONS.md) is the current deployment reference.
[Remaining SRE work](docs/SRE-FOLLOWUPS.md) records accepted constraints and TODOs.
[Architecture](docs/ARCHITECTURE.md), [data model](docs/DATA_MODEL.md), and
[security model](docs/SECURITY_MODEL.md) describe domain behavior.

The historical standalone Flask backend and per-domain Docker definitions are
not deployed. Production promotes the exact image tested by CI. A temporary deployment checkout
supplies the versioned Compose definition and is removed after the job. Application
code runs from the image; no permanent source checkout is needed on the host.
